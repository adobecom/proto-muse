/*
 * Figma → DA Agent Server  (multi-agent pipeline)
 *
 * Setup (Anthropic API key):
 *   ANTHROPIC_API_KEY=sk-...  REPO_PATH=/path/to/proto-muse  npm start
 *
 * Setup (AWS Bedrock):
 *   AWS_BEARER_TOKEN_BEDROCK=...  AWS_REGION=us-west-2  \
 *   BEDROCK_MODEL_SMART=us.anthropic.claude-sonnet-4-6   \
 *   REPO_PATH=/path/to/proto-muse  npm start
 *
 * Pipeline:
 *   1. Analyze agent   — reads Figma, maps sections to Milo blocks or marks NEW
 *   2. Block builders  — one agent per NEW block, run in parallel
 *   3. Author agent    — extracts content, assembles DA HTML, uploads + previews
 *
 * Endpoints:
 *   POST /jobs  { figmaUrl, daContext }  → 202 { jobId }
 *   GET  /jobs/:id                       → { status, stage, previewUrl?, error? }
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const execFileP = promisify(execFile);
const git = (...args) => execFileP('git', ['-C', REPO_PATH, ...args], { timeout: 15_000 });

const PORT = process.env.PORT || 3001;
const REPO_PATH = process.env.REPO_PATH;

if (!REPO_PATH) {
  console.error('ERROR: Set REPO_PATH env var to the proto-muse repo root.');
  process.exit(1);
}

if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
  process.env.CLAUDE_CODE_USE_BEDROCK = '1';
  console.log(`Using Bedrock in ${process.env.AWS_REGION || 'us-east-1'}`);
} else {
  console.log('Using Claude Code built-in auth');
}

const SKILL_BASE = join(REPO_PATH, '.claude/skills/build-content-from-figma');
const REF_BASE = join(REPO_PATH, 'tools/figma-to-da/server/references');

const pipelineRefs = {
  miloBlockInventory: readFileSync(join(REF_BASE, 'milo-block-inventory.md'), 'utf8'),
  c1BlockCreation: readFileSync(join(REF_BASE, 'c1-block-creation.md'), 'utf8'),
  c1AuthoringPattern: readFileSync(join(REF_BASE, 'c1-authoring-pattern.md'), 'utf8'),
};
const legacyRefs = {
  tokenMapping: readFileSync(join(SKILL_BASE, 'references/token-mapping.md'), 'utf8'),
  extractor: readFileSync(join(SKILL_BASE, 'agents/figma-content-extractor.md'), 'utf8'),
};
console.log('Pipeline reference files loaded from', REF_BASE);

const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
console.log('Figma REST API:', FIGMA_TOKEN ? 'enabled (FIGMA_TOKEN set)' : 'disabled (set FIGMA_TOKEN env var to enable)');

const app = express();
app.use(cors());
app.use(express.json());

/** @type {Map<string, { status: string, stage: number, previewUrl?: string, error?: string }>} */
const jobs = new Map();

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseFigmaUrl(figmaUrl) {
  const fileMatch = figmaUrl.match(/figma\.com\/(?:design|file)\/([^/?#]+)/);
  const nodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  return {
    figmaFileKey: fileMatch ? fileMatch[1] : '',
    figmaNodeId: nodeMatch ? decodeURIComponent(nodeMatch[1]) : '',
  };
}

function buildFigmaAccess(figmaFileKey, figmaNodeId) {
  if (FIGMA_TOKEN) {
    return `### Figma access — REST API (preferred)

A Figma personal access token is available. Use the REST API to extract design content:

  # Get file metadata and top-level frames
  curl -s "https://api.figma.com/v1/files/${figmaFileKey}" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}" | head -c 8000

  # Get specific node content (text, fills, children)
  curl -s "https://api.figma.com/v1/files/${figmaFileKey}/nodes?ids=${figmaNodeId}" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}"

  # Export a node as image
  curl -s "https://api.figma.com/v1/images/${figmaFileKey}?ids=<nodeId>&format=png" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}"

If Figma MCP tools (get_design_context, get_metadata) are available in this session,
prefer them over the REST API for richer output.`;
  }
  return `### Figma access — MCP only

No FIGMA_TOKEN env var is set. Use Figma MCP tools (get_design_context, get_metadata,
get_screenshot). If they are not available, extract what is possible from the URL.`;
}

function buildQueryOptions(jobId, label) {
  const opts = {
    cwd: REPO_PATH,
    permissionMode: 'bypassPermissions',
    allowedTools: [
      'Bash', 'Read', 'Write', 'Edit', 'WebFetch',
      'mcp__plugin_figma_figma__get_design_context',
      'mcp__plugin_figma_figma__get_screenshot',
      'mcp__plugin_figma_figma__get_metadata',
      'mcp__plugin_figma_figma__use_figma',
    ],
    pathToClaudeCodeExecutable: process.env.CLAUDE_PATH || '/Users/cod87753/.local/share/claude/versions/2.1.140',
    stderr: (line) => {
      process.stderr.write(`[${jobId.slice(0, 8)} ${label}] ${line}`);
    },
  };
  if (process.env.BEDROCK_MODEL_SMART) opts.model = process.env.BEDROCK_MODEL_SMART;
  return opts;
}

function extractUsage(msg) {
  return {
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
    cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: msg.usage?.cache_creation_input_tokens ?? 0,
    costUsd: msg.total_cost_usd ?? 0,
    durationMs: msg.duration_ms ?? 0,
    numTurns: msg.num_turns ?? 0,
  };
}

function aggregateUsage(usageArray) {
  const valid = usageArray.filter(Boolean);
  const sum = (key) => valid.reduce((acc, u) => acc + (u[key] ?? 0), 0);
  return {
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    costUsd: sum('costUsd'),
    durationMs: sum('durationMs'),
    numTurns: sum('numTurns'),
  };
}

// ── Analyze Agent ─────────────────────────────────────────────────────────────

function buildAnalyzePrompt(figmaUrl, figmaFileKey, figmaNodeId) {
  const figmaAccess = buildFigmaAccess(figmaFileKey, figmaNodeId);

  return `## AUTOMATED MODE — non-interactive execution

This agent runs fully automated. Skip every "STOP", "BLOCKING", and "wait for user
confirmation" gate. Do NOT create git branches or commits.

### Inputs

- Figma URL: ${figmaUrl}
- Figma file key: ${figmaFileKey}
- Figma node ID: ${figmaNodeId}

${figmaAccess}

---

## Task: Analyze the Figma Design

Read the full Figma design and produce a JSON page plan that maps each visual section
to a block assignment.

### Steps

1. Call get_design_context (or get_metadata + REST API) on the root frame:
   ${figmaUrl}

2. Examine the top-level children of the root frame — these are the horizontal
   sections/bands of the page, read top-to-bottom.

3. For each section:
   a. Identify the visual pattern: layout shape, number of columns, content types
   b. Record the section's Figma node ID (from the root frame's children list)
   c. Assign a block using the rules below

### Block assignment rules

- **Milo blocks**: Match to a Milo block when it genuinely fits the section's visual
  pattern (see the Milo Block Inventory below for all available blocks and their
  visual signals).
- **New custom blocks**: When no Milo block is a good fit, assign \`"NEW: <kebab-name>"\`
  where the name describes the section's purpose (e.g. "NEW: metric-strip",
  "NEW: app-grid", "NEW: logo-carousel").
- Do NOT force an imperfect Milo block to avoid creating a new one — a purpose-built
  custom block beats a mismatched standard block. New blocks are expected when the
  design calls for something Milo doesn't cover well.

### Deriving the page slug

From the Figma frame/file name: kebab-case, lowercase, no special characters.
Example: "Hub — A.com" → "hub-acom", "Acrobat Product Page" → "acrobat-product-page"

### Output format

After your analysis, output exactly these two lines as the LAST lines of your response
(no other text after them):

PAGE_PLAN=[{"section":"hero","block":"marquee","variants":["large"],"nodeId":"123:456"},{"section":"metrics","block":"NEW: metric-strip","variants":[],"nodeId":"789:012"}]
SLUG=page-slug-here

Each entry in PAGE_PLAN must have:
- "section": human-readable name of the section
- "block": Milo block name (e.g. "marquee", "accordion") OR "NEW: <kebab-name>"
- "variants": array of variant strings, empty array if none
- "nodeId": the Figma node ID for this section

---

## Reference: Milo Block Inventory

${pipelineRefs.miloBlockInventory}
`;
}

async function runAnalyzeAgent(jobId, figmaUrl) {
  const { figmaFileKey, figmaNodeId } = parseFigmaUrl(figmaUrl);
  const prompt = buildAnalyzePrompt(figmaUrl, figmaFileKey, figmaNodeId);
  const options = buildQueryOptions(jobId, 'analyze');

  let finalResult = '';
  let usage = null;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'result') {
      finalResult = msg.result || '';
      usage = extractUsage(msg);
    }
  }

  const planMatch = finalResult.match(/PAGE_PLAN=(\[.*\])/s);
  const slugMatch = finalResult.match(/SLUG=(\S+)/);

  if (!planMatch) throw new Error('Analyze agent did not output a PAGE_PLAN sentinel.');
  if (!slugMatch) throw new Error('Analyze agent did not output a SLUG sentinel.');

  let plan;
  try {
    plan = JSON.parse(planMatch[1]);
  } catch (e) {
    throw new Error(`Analyze agent PAGE_PLAN is not valid JSON: ${e.message}\nRaw: ${planMatch[1].slice(0, 500)}`);
  }

  const slug = slugMatch[1];
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    throw new Error(`Analyze agent returned invalid slug: "${slug}" — must be lowercase alphanumeric + hyphens`);
  }
  console.log(`[${jobId.slice(0, 8)}] analyze done — ${plan.length} sections, slug: ${slug}`);
  plan.forEach((e) => console.log(`  [${jobId.slice(0, 8)}]   ${e.section} → ${e.block}`));

  return { plan, slug, usage };
}

// ── Block Builder Agent ───────────────────────────────────────────────────────

function buildBlockBuilderPrompt(entry, figmaUrl, figmaFileKey) {
  const blockName = entry.block.replace(/^NEW:\s*/, '').trim();
  const figmaAccess = buildFigmaAccess(figmaFileKey, entry.nodeId);

  return `## AUTOMATED MODE — non-interactive execution

Do NOT create git branches or commits. Use the Write tool (not bash/heredoc) for all
file writes.

### Inputs

- Block to create: ${blockName}
- Section: "${entry.section}"
- Figma URL: ${figmaUrl}
- Figma node ID for this section: ${entry.nodeId}
- REPO_PATH: ${REPO_PATH}

${figmaAccess}

---

## Task: Build a New C1 Block

Create a Helix/Milo C1 block named \`${blockName}\` that matches the "${entry.section}"
section in the Figma design.

### Steps

1. Call get_design_context on node ID \`${entry.nodeId}\` (or use REST API) to
   understand the section's:
   - Column structure and layout
   - Content types (text, images, icons, CTAs, etc.)
   - Visual style (colors, spacing, alignment)

2. Read these two existing blocks as structural reference before writing:
   ${REPO_PATH}/blocks/hub-hero/hub-hero.js
   ${REPO_PATH}/blocks/hub-featured/hub-featured.js

3. Create the following two files using the Write tool:
   ${REPO_PATH}/blocks/${blockName}/${blockName}.js
   ${REPO_PATH}/blocks/${blockName}/${blockName}.css

4. Follow the C1 Block Creation Guide below exactly.

### Output

Your FINAL line of output must be:
BLOCK_DONE=${blockName}

---

## Reference: C1 Block Creation Guide

${pipelineRefs.c1BlockCreation}
`;
}

async function runBlockBuilderAgent(jobId, entry, figmaUrl) {
  const { figmaFileKey } = parseFigmaUrl(figmaUrl);
  const blockName = entry.block.replace(/^NEW:\s*/, '').trim();
  const prompt = buildBlockBuilderPrompt(entry, figmaUrl, figmaFileKey);
  const options = buildQueryOptions(jobId, `block:${blockName}`);

  let finalResult = '';
  let usage = null;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'result') {
      finalResult = msg.result || '';
      usage = extractUsage(msg);
    }
  }

  const doneMatch = finalResult.match(/BLOCK_DONE=(\S+)/);
  const resolvedName = doneMatch?.[1] ?? blockName;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(resolvedName)) {
    throw new Error(`Block builder returned invalid block name: "${resolvedName}" — must be lowercase alphanumeric + hyphens`);
  }

  console.log(`[${jobId.slice(0, 8)}] block-builder done — ${resolvedName}`);
  return { blockName: resolvedName, originalMarker: entry.block, usage };
}

// ── Author Agent ──────────────────────────────────────────────────────────────

function buildAuthorPrompt(plan, draftSlug, builtBlocks, figmaUrl, figmaFileKey, figmaNodeId, org, site, token, username) {
  const slug = draftSlug;
  const figmaAccess = buildFigmaAccess(figmaFileKey, figmaNodeId);
  const planJson = JSON.stringify(plan, null, 2);
  const builtBlocksList = builtBlocks.length > 0
    ? builtBlocks.map((b) => `- ${b}  →  ${REPO_PATH}/blocks/${b}/${b}.js`).join('\n')
    : '(none — all sections use Milo blocks)';

  return `## AUTOMATED MODE — non-interactive execution

Skip every "STOP" and "wait for user confirmation" gate. Do NOT create git branches
or commits. Proceed through all phases without pausing.

### Inputs

- Figma URL: ${figmaUrl}
- Figma file key: ${figmaFileKey}
- Page slug: ${slug}
- DA org: ${org}
- DA site (repo): ${site}
- DA username: ${username}
- DA token: ${token}
- REPO_PATH: ${REPO_PATH}

### Auth override

Never call da-auth-helper. Use the DA token directly in all curl commands:
  curl ... -H "Authorization: Bearer ${token}" ...

### Git override

Do NOT create git branches, do NOT commit, do NOT push.

### Output requirement

Your FINAL line of output must be exactly:
  PREVIEW_URL=<url>

where <url> is:
- The aem.page preview URL if preview succeeded (Phase 3b returns 200)
- The da.live edit URL if preview returned non-200:
  https://da.live/edit#/${org}/${site}/drafts/${username}/${slug}
- The literal string "error" only if the DA HTML upload itself failed

${figmaAccess}

---

## Page plan (already resolved — do not re-analyze block matching)

The block for each section is given. Do not call get_design_context on the root
frame to re-determine block assignments — that work is already done.

\`\`\`json
${planJson}
\`\`\`

## Custom blocks built in this run

These block files already exist on disk:

${builtBlocksList}

For each block in this list, before authoring its section:
- Read its \`.js\` file to understand the expected column/row structure
- Derive the DA table name using title-case from the folder name:
  \`icon-stats\` → \`Icon Stats\`,  \`metric-strip\` → \`Metric Strip\`

---

## Phase 1 — Extract Figma Content

For each section in the page plan (in order):

1. Use get_design_context on the section's \`nodeId\` from the plan.
   If the Figma data already covers this section from a prior call, re-use it.
2. Apply the Figma Content Extractor procedure (reference below).
3. Use visual heuristics for typography (largest bold text = heading, etc.)
   since C1 blocks do not use --s2a- tokens.
4. Record: heading text + level, body text, eyebrow text (if any),
   CTA link texts + styles (primary/secondary/plain),
   media asset URLs + node IDs, background color (if any).
5. Do NOT download any assets yet — capture URLs and node IDs only.

---

## Phase 2 — Assemble DA HTML

### 2a. Download Figma media assets

For each media asset (background images, product images, icons, logos) collected
in Phase 1:

  mkdir -p /tmp/figma-media/${slug}
  mkdir -p /tmp/da-upload/drafts/${username}
  curl -sL "<figma-asset-url>" -o /tmp/figma-media/${slug}/<descriptive-filename>

Verify type: file /tmp/figma-media/${slug}/<descriptive-filename>
Add the correct extension (.png, .jpg, .svg) based on the file command output.

### 2b. Upload assets to DA shadow folder

Upload each asset. Run uploads in parallel where possible.

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.da.live/source/${org}/${site}/drafts/${username}/.${slug}/<filename>" \\
    -H "Authorization: Bearer ${token}" \\
    -F "data=@/tmp/figma-media/${slug}/<filename>;type=<mime-type>"

MIME types: .png → image/png, .jpg → image/jpeg, .svg → image/svg+xml
Expect 201 Created. The content.da.live asset URL is:
  https://content.da.live/${org}/${site}/drafts/${username}/.${slug}/<filename>

### 2c. Build the DA HTML document

Use the C1 Authoring Pattern reference below. Key rules:
- One <div> per section/block inside <main>
- Each div contains one <table> with the block name in the first row
- For Milo blocks: use the exact block name + variants from the plan
  (e.g. "Marquee (large, light)", "Accordion (seo)")
- For custom blocks (in the list above): title-case the block name
  (e.g. "metric-strip" → "Metric Strip")
- Use content.da.live URLs for all images
- Use https://www.adobe.com/ as placeholder for all link hrefs
- NO foundation:c2 metadata, NO viewport rows
- NO section-metadata EXCEPT for Tabs/Carousel blocks

Use the Write tool to save the complete HTML to:
  /tmp/da-upload/drafts/${username}/${slug}.html

---

## Phase 3 — Upload, Preview, Publish

### 3a. Upload HTML

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.da.live/source/${org}/${site}/drafts/${username}/${slug}.html" \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: text/html" \\
    --data-binary @/tmp/da-upload/drafts/${username}/${slug}.html

Expect 200 or 201.

### 3b. Preview

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.hlx.page/preview/${org}/${site}/main/drafts/${username}/${slug}" \\
    -H "Authorization: Bearer ${token}"

On 200: PREVIEW_URL=https://main--${site}--${org}.aem.page/drafts/${username}/${slug}
On non-200: PREVIEW_URL=https://da.live/edit#/${org}/${site}/drafts/${username}/${slug}

### 3c. Publish (only if preview succeeded)

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.hlx.page/live/${org}/${site}/main/drafts/${username}/${slug}" \\
    -H "Authorization: Bearer ${token}"

### 3d. Final output

Output a brief summary:
- Page slug and DA path
- Blocks used (from plan)
- Custom blocks created (if any)
- Assets uploaded

Then output as the FINAL line:
  PREVIEW_URL=<url>

---

## Reference: Milo Block Inventory

${pipelineRefs.miloBlockInventory}

---

## Reference: C1 Authoring Pattern

${pipelineRefs.c1AuthoringPattern}

---

## Reference: Token Mapping (visual heuristics)

${legacyRefs.tokenMapping}

---

## Reference: Figma Content Extractor

${legacyRefs.extractor}
`;
}

async function runAuthorAgent(jobId, plan, draftSlug, builtBlocks, figmaUrl, org, site, token, username) {
  const { figmaFileKey, figmaNodeId } = parseFigmaUrl(figmaUrl);
  const prompt = buildAuthorPrompt(
    plan, draftSlug, builtBlocks, figmaUrl, figmaFileKey, figmaNodeId, org, site, token, username,
  );

  const stderrLines = [];
  const options = buildQueryOptions(jobId, 'author');
  options.stderr = (line) => {
    stderrLines.push(line.trimEnd());
    process.stderr.write(`[${jobId.slice(0, 8)} author] ${line}`);
  };

  // Author agent owns stages 2-4; set the floor before iterating
  jobs.set(jobId, { ...jobs.get(jobId), stage: 2 });

  let finalResult = '';
  let previewUrl;
  let usage = null;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'assistant') {
      const toolUses = msg.message?.content?.filter((b) => b.type === 'tool_use') ?? [];
      for (const tool of toolUses) {
        const name = tool.name ?? '';
        const input = JSON.stringify(tool.input ?? '');
        const current = jobs.get(jobId);
        let stage = current?.stage ?? 2;

        const isFigma = name.startsWith('mcp__plugin_figma') || input.includes('api.figma.com');
        if (isFigma) {
          stage = Math.max(stage, 2);
        } else if (
          ((name === 'Write' || name === 'Edit') && input.includes('/tmp/'))
          || (name === 'Bash' && input.includes('admin.da.live') && !input.includes('.html'))
        ) {
          stage = Math.max(stage, 3);
        } else if (name === 'Bash' && (
          (input.includes('admin.da.live') && input.includes('.html'))
          || input.includes('admin.hlx.page')
        )) {
          stage = Math.max(stage, 4);
        }

        if (stage !== current?.stage) {
          jobs.set(jobId, { ...current, stage });
        }
      }
    }

    if (msg.type === 'result') {
      finalResult = msg.result || '';
      const explicit = finalResult.match(/PREVIEW_URL=(\S+)/);
      if (explicit) previewUrl = explicit[1];
      if (!previewUrl) {
        const fallback = finalResult.match(/https:\/\/[^\s"')]+\.aem\.(live|page)[^\s"')]+/);
        if (fallback) previewUrl = fallback[0];
      }
      usage = extractUsage(msg);
    }
  }

  console.log(`[${jobId.slice(0, 8)}] author done — previewUrl: ${previewUrl}`);

  const stderrTail = stderrLines.slice(-60).join('\n');
  const summary = finalResult.trim()
    || `(no agent text output)\n\nstderr tail:\n${stderrTail || '(empty)'}`;

  return { previewUrl, summary, usage };
}

// ── Pipeline Orchestrator ─────────────────────────────────────────────────────

async function commitBuiltBlocks(jobId, builtBlocks, branchName) {
  const { stdout } = await git('rev-parse', '--abbrev-ref', 'HEAD');
  const originalBranch = stdout.trim();

  try {
    await git('checkout', '-b', branchName);
    for (const blockName of builtBlocks) {
      await git('add', `blocks/${blockName}`);
    }
    await git('commit', '-m', `feat: add ${builtBlocks.join(', ')} (figma-da run ${branchName})`);
    try {
      await git('push', '-u', 'origin', branchName);
      console.log(`[${jobId.slice(0, 8)}] ${builtBlocks.length} block(s) → branch ${branchName} (pushed to origin)`);
    } catch (pushErr) {
      console.warn(`[${jobId.slice(0, 8)}] push failed — branch committed locally: ${pushErr.message}`);
    }
  } finally {
    await git('checkout', originalBranch);
  }
}

async function runPipeline(jobId, figmaUrl, daContext) {
  const org = daContext?.org || 'adobecom';
  const site = daContext?.site || 'proto-muse';
  const token = daContext?.token || '';
  const username = daContext?.username || 'anonymous';

  // Stage 0: analyze design → page plan
  jobs.set(jobId, { ...jobs.get(jobId), stage: 0 });
  const { plan, slug, usage: analyzeUsage } = await runAnalyzeAgent(jobId, figmaUrl);

  const uid = jobId.slice(0, 6);
  const draftSlug = `${slug}-${uid}`;
  console.log(`[${jobId.slice(0, 8)}] uid: ${uid}, draft slug: ${draftSlug}`);

  // Stage 1: build new blocks in parallel
  const newEntries = plan.filter((e) => e.block.startsWith('NEW:'));
  const buildUsages = [];
  let builtBlocks = [];

  if (newEntries.length > 0) {
    console.log(`[${jobId.slice(0, 8)}] building ${newEntries.length} new block(s) in parallel`);
    jobs.set(jobId, { ...jobs.get(jobId), stage: 1 });

    const results = await Promise.all(
      newEntries.map((entry) => runBlockBuilderAgent(jobId, entry, figmaUrl)),
    );

    for (const result of results) {
      const entry = plan.find((e) => e.block === result.originalMarker);
      if (entry) entry.block = result.blockName;
      buildUsages.push(result.usage);
    }
    builtBlocks = results.map((r) => r.blockName);
  }

  // Stage 2-4: author agent extracts content, assembles + uploads DA document
  // draftSlug (not slug) is passed so the DA document path carries the run UID
  const { previewUrl, summary, usage: authorUsage } = await runAuthorAgent(
    jobId, plan, draftSlug, builtBlocks, figmaUrl, org, site, token, username,
  );

  // Commit new blocks to a branch named after draftSlug (after author agent so
  // it can still read the block files from the working tree)
  let blockBranch = null;
  if (builtBlocks.length > 0) {
    try {
      await commitBuiltBlocks(jobId, builtBlocks, draftSlug);
      blockBranch = draftSlug;
    } catch (e) {
      console.error(`[${jobId.slice(0, 8)}] git commit failed (non-fatal):`, e.message);
    }
  }

  const usage = aggregateUsage([analyzeUsage, ...buildUsages, authorUsage]);

  if (!previewUrl || previewUrl === 'error') {
    jobs.set(jobId, {
      status: 'done',
      previewUrl: previewUrl || null,
      ...(blockBranch && { blockBranch }),
      summary: summary.slice(0, 4000),
      usage,
    });
    return;
  }

  jobs.set(jobId, { status: 'done', previewUrl, ...(blockBranch && { blockBranch }), usage });
}

// ── Express routes ────────────────────────────────────────────────────────────

app.post('/jobs', async (req, res) => {
  const { figmaUrl, daContext } = req.body;

  if (!figmaUrl || !figmaUrl.includes('figma.com')) {
    return res.status(400).json({ error: 'figmaUrl must be a valid figma.com URL' });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: 'pending', stage: 0 });
  res.status(202).json({ jobId });

  runPipeline(jobId, figmaUrl, daContext).catch((e) => {
    console.error(`[${jobId.slice(0, 8)}] pipeline error:`, e);
    jobs.set(jobId, { status: 'error', error: String(e) });
  });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`Repo path: ${REPO_PATH}`);
});
