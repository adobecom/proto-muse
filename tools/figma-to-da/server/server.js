/*
 * Figma → DA Agent Server
 *
 * Setup (Anthropic API key):
 *   ANTHROPIC_API_KEY=sk-...  REPO_PATH=/path/to/proto-muse  npm start
 *
 * Setup (AWS Bedrock):
 *   AWS_BEARER_TOKEN_BEDROCK=...  AWS_REGION=us-west-2  \
 *   BEDROCK_MODEL_SMART=us.anthropic.claude-sonnet-4-6   \
 *   REPO_PATH=/path/to/proto-muse  npm start
 *
 * Then expose with ngrok:
 *   ngrok http 3001   ← paste the HTTPS URL into the DA app
 *
 * Endpoints:
 *   POST /jobs  { figmaUrl, daContext }  → 202 { jobId }
 *   GET  /jobs/:id                       → { status, previewUrl?, error? }
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

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

// Load reference files once at startup so the agent has full pipeline knowledge
const SKILL_BASE = join(REPO_PATH, '.claude/skills/build-content-from-figma');
const REF_BASE = join(REPO_PATH, 'tools/figma-to-da/server/references');
const pipelineRefs = {
  blockInventory: readFileSync(join(REF_BASE, 'block-inventory.md'), 'utf8'),
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

/** @type {Map<string, { status: string, previewUrl?: string, error?: string }>} */
const jobs = new Map();

app.post('/jobs', async (req, res) => {
  const { figmaUrl, daContext } = req.body;

  if (!figmaUrl || !figmaUrl.includes('figma.com')) {
    return res.status(400).json({ error: 'figmaUrl must be a valid figma.com URL' });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: 'pending', stage: 0 });
  res.status(202).json({ jobId });

  runAgent(jobId, figmaUrl, daContext).catch((e) => {
    jobs.set(jobId, { status: 'error', error: String(e) });
  });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

function buildPrompt(figmaUrl, org, site, username, token) {
  const figmaFileMatch = figmaUrl.match(/figma\.com\/(?:design|file)\/([^/?#]+)/);
  const figmaFileKey = figmaFileMatch ? figmaFileMatch[1] : '';
  const figmaNodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  const figmaNodeId = figmaNodeMatch ? decodeURIComponent(figmaNodeMatch[1]) : '';

  const figmaAccessInstructions = FIGMA_TOKEN
    ? `### Figma access — REST API (preferred)

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

If Figma MCP tools (get_design_context, get_metadata) ARE available in this session,
prefer them over the REST API for richer output.`
    : `### Figma access — MCP only

No FIGMA_TOKEN env var is set. Use Figma MCP tools (get_design_context, get_metadata,
get_screenshot). If they are not available, extract what is possible from the URL.`;

  return `## AUTOMATED MODE — non-interactive execution

This pipeline runs fully automated. Skip every "STOP", "BLOCKING", and
"wait for user confirmation" gate. Proceed through all phases without pausing.

### Inputs (pre-filled — do not ask for these)

- Figma URL: ${figmaUrl}
- Figma file key: ${figmaFileKey}
- Figma node ID: ${figmaNodeId}
- DA org: ${org}
- DA site (repo): ${site}
- DA username: ${username}
- DA token: ${token}
- REPO_PATH: ${REPO_PATH}

### Auth override

Never call da-auth-helper. Use the DA token above directly:
  curl ... -H "Authorization: Bearer ${token}" ...

### Git override

Do NOT create git branches, do NOT commit, do NOT push.

### Output requirement

Your FINAL line of output must be exactly:
  PREVIEW_URL=<url>

where <url> is:
- The aem.page preview URL if preview succeeded (Phase 4b returns 200)
- The da.live edit URL if preview returned non-200:
  https://da.live/edit#/${org}/${site}/drafts/${username}/<slug>
- The literal string "error" (PREVIEW_URL=error) only if the DA HTML upload
  itself failed (Phase 4a returned non-200)

${figmaAccessInstructions}

---

## Phase 0 — Design Analysis

Read the full Figma design to identify all major page sections.

1. Call get_design_context (or get_metadata + REST API) on the root frame at:
   ${figmaUrl}

2. Examine the top-level children of the root frame — these are the horizontal
   sections/bands of the page, read top-to-bottom.

3. For each section, identify:
   - Visual pattern: layout shape, number of columns, content types present
   - Compare against BOTH block inventories below (hub-* first, then Milo standard library)
   - Assign: existing block name + variants, OR "NEW: hub-<descriptive-noun>"

4. Matching priority:
   a. hub-* blocks first (custom-styled for this site)
   b. Milo standard blocks (accordion, tabs, text, columns, etc.) when no hub-* fits
   c. "NEW: hub-<name>" only when neither library covers the pattern

5. Bias STRONGLY toward existing blocks. Only mark NEW when no existing block
   + variant combination covers the visual pattern.

5. Derive the page slug from the Figma frame/file name (kebab-case, lowercase).
   Example: "Hub — A.com" → "hub-acom"

6. Output a JSON page plan (in a code block) before proceeding:
   [
     { "section": "hero", "block": "hub-hero", "variants": [] },
     { "section": "trust strip", "block": "hub-marquee", "variants": ["dark"] },
     { "section": "promo panel", "block": "hub-featured", "variants": ["media-right"] },
     { "section": "app grid", "block": "hub-cards", "variants": [] },
     { "section": "metrics", "block": "hub-stats", "variants": [] },
     { "section": "cta band", "block": "hub-cta", "variants": [] }
   ]

---

## Phase 1 — Build New Blocks

Check the page plan for any entries where "block" starts with "NEW:".

If NONE: skip Phase 1 entirely and proceed to Phase 2.

If any NEW blocks exist:
1. Read these two existing blocks as structural reference:
   ${REPO_PATH}/blocks/hub-hero/hub-hero.js
   ${REPO_PATH}/blocks/hub-featured/hub-featured.js

2. For each NEW block (e.g., "hub-promo"):
   a. From Phase 0, identify the section's column structure and content types
      in the Figma design.
   b. Use the Write tool to create:
      ${REPO_PATH}/blocks/<name>/<name>.js  (C1 decorate() pattern)
      ${REPO_PATH}/blocks/<name>/<name>.css  (hub-* CSS conventions)
   c. Follow the C1 Block Creation Guide reference below exactly.
   d. Use the Write tool (NOT bash/heredoc) for both files.

---

## Phase 2 — Extract Figma Content

For each section in the page plan (in order):
1. Use get_design_context on the Figma frame/child node for that section.
   If the full file was already read in Phase 0, re-use that data where possible.
2. Apply the Figma Content Extractor procedure (reference below).
3. Use visual heuristics for typography (largest bold text = heading, etc.)
   since C1 blocks do not use --s2a- tokens.
4. Record: heading text + level, body text, eyebrow text (if any),
   CTA link texts + styles (primary/secondary/plain),
   media asset URLs + node IDs, background color (if any).
5. Do NOT download any assets yet — capture URLs and node IDs only.

---

## Phase 3 — Assemble DA HTML

### 3a. Download Figma media assets

For each media asset (background images, product images, icons, logos) collected
in Phase 2:

  mkdir -p /tmp/figma-media/<slug>
  mkdir -p /tmp/da-upload/drafts/${username}
  curl -sL "<figma-asset-url>" -o /tmp/figma-media/<slug>/<descriptive-filename>

Verify type: file /tmp/figma-media/<slug>/<descriptive-filename>
Add the correct extension (.png, .jpg, .svg) based on the file command output.

### 3b. Upload assets to DA shadow folder

Upload each asset. Run uploads in parallel where possible.

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.da.live/source/${org}/${site}/drafts/${username}/.<slug>/<filename>" \\
    -H "Authorization: Bearer ${token}" \\
    -F "data=@/tmp/figma-media/<slug>/<filename>;type=<mime-type>"

MIME types: .png → image/png, .jpg → image/jpeg, .svg → image/svg+xml
Expect 201 Created. The final content.da.live asset URL is:
  https://content.da.live/${org}/${site}/drafts/${username}/.<slug>/<filename>

### 3c. Build the DA HTML document

Use the C1 Authoring Pattern reference below. Key rules:
- One <div> per section/block inside <main>
- Each div contains one <table> with the block name in the first row
- Block name format: "Hub Hero", "Hub Featured (dark, media-right)", etc.
- Use content.da.live URLs for all images
- Use https://www.adobe.com/ as placeholder for all link hrefs
- NO foundation:c2 metadata, NO viewport rows
- NO section-metadata EXCEPT for Tabs/Carousel — see "Special Milo block patterns"
  in the C1 Authoring Pattern reference for how to author those blocks

Use the Write tool to save the complete HTML to:
  /tmp/da-upload/drafts/${username}/<slug>.html

---

## Phase 4 — Upload, Preview, Publish

### 4a. Upload HTML

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.da.live/source/${org}/${site}/drafts/${username}/<slug>.html" \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: text/html" \\
    --data-binary @/tmp/da-upload/drafts/${username}/<slug>.html

Expect 200 or 201.

### 4b. Preview

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.hlx.page/preview/${org}/${site}/main/drafts/${username}/<slug>" \\
    -H "Authorization: Bearer ${token}"

On 200: PREVIEW_URL=https://main--${site}--${org}.aem.page/drafts/${username}/<slug>
On non-200: PREVIEW_URL=https://da.live/edit#/${org}/${site}/drafts/${username}/<slug>

### 4c. Publish (only if preview succeeded)

  curl -s -w "\\n%{http_code}" -X POST \\
    "https://admin.hlx.page/live/${org}/${site}/main/drafts/${username}/<slug>" \\
    -H "Authorization: Bearer ${token}"

### 4d. Final output

Output a brief summary of what was produced:
- Page slug and DA path
- Blocks used (from page plan)
- Any new blocks created (file paths)
- Any assets uploaded
- Placeholder link reminder

Then output as the FINAL line:
  PREVIEW_URL=<url>

---

## Reference: Hub-* Block Inventory (custom, proto-muse)

${pipelineRefs.blockInventory}

---

## Reference: Milo Block Inventory (standard library)

${pipelineRefs.miloBlockInventory}

---

## Reference: C1 Block Creation Guide

${pipelineRefs.c1BlockCreation}

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

async function runAgent(jobId, figmaUrl, daContext) {
  const org = daContext?.org || 'adobecom';
  const site = daContext?.site || 'proto-muse';
  const token = daContext?.token || '';
  const username = daContext?.username || 'anonymous';

  const prompt = buildPrompt(figmaUrl, org, site, username, token);

  const stderrLines = [];

  const queryOptions = {
    cwd: REPO_PATH,
    permissionMode: 'bypassPermissions',
    allowedTools: [
      'Bash', 'Read', 'Write', 'Edit', 'WebFetch',
      // Figma MCP tools (available via the figma@claude-plugins-official plugin in global settings)
      'mcp__plugin_figma_figma__get_design_context',
      'mcp__plugin_figma_figma__get_screenshot',
      'mcp__plugin_figma_figma__get_metadata',
      'mcp__plugin_figma_figma__use_figma',
    ],
    pathToClaudeCodeExecutable: process.env.CLAUDE_PATH || '/Users/cod87753/.local/share/claude/versions/2.1.140',
    stderr: (line) => {
      stderrLines.push(line.trimEnd());
      process.stderr.write(`[agent ${jobId.slice(0, 8)}] ${line}`);
    },
  };

  if (process.env.BEDROCK_MODEL_SMART) {
    queryOptions.model = process.env.BEDROCK_MODEL_SMART;
  }

  let finalResult = '';
  let previewUrl;
  let usageStats = null;
  const allMessages = [];

  for await (const msg of query({ prompt, options: queryOptions })) {
    allMessages.push(msg.type);

    if (msg.type === 'assistant') {
      const toolUses = msg.message?.content?.filter((b) => b.type === 'tool_use') ?? [];
      for (const tool of toolUses) {
        const name = tool.name ?? '';
        const input = JSON.stringify(tool.input ?? '');
        const current = jobs.get(jobId);
        let stage = current?.stage ?? 0;
        const isFigma = name.startsWith('mcp__plugin_figma') || input.includes('api.figma.com');
        if (isFigma) {
          // Stage 0: first Figma reads (design analysis)
          // Stage 2: Figma reads after block creation (content extraction)
          stage = Math.max(stage, stage >= 1 ? 2 : 0);
        } else if ((name === 'Write' || name === 'Edit') && input.includes('/blocks/')) {
          // Stage 1: writing new block files
          stage = Math.max(stage, 1);
        } else if (
          ((name === 'Write' || name === 'Edit') && input.includes('/tmp/'))
          || (name === 'Bash' && input.includes('admin.da.live') && !input.includes('.html'))
        ) {
          // Stage 3: assembling HTML or uploading assets to DA shadow folder
          stage = Math.max(stage, 3);
        } else if (name === 'Bash' && (
          (input.includes('admin.da.live') && input.includes('.html'))
          || input.includes('admin.hlx.page')
        )) {
          // Stage 4: uploading HTML doc or triggering preview/live
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
      usageStats = {
        inputTokens: msg.usage?.input_tokens ?? 0,
        outputTokens: msg.usage?.output_tokens ?? 0,
        cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage?.cache_creation_input_tokens ?? 0,
        costUsd: msg.total_cost_usd ?? null,
        durationMs: msg.duration_ms ?? null,
        numTurns: msg.num_turns ?? null,
      };
    }
  }

  console.log(`[${jobId.slice(0, 8)}] done — messages: [${allMessages.join(', ')}] previewUrl: ${previewUrl}`);

  // Build a diagnostic summary: prefer the agent's text output; fall back to stderr
  const stderrTail = stderrLines.slice(-60).join('\n');
  const summary = finalResult.trim()
    || `(no agent text output)\n\nstderr tail:\n${stderrTail || '(empty)'}`;

  if (!previewUrl || previewUrl === 'error') {
    jobs.set(jobId, {
      status: 'done',
      previewUrl: previewUrl || null,
      summary: summary.slice(0, 4000),
      ...(usageStats && { usage: usageStats }),
    });
    return;
  }

  jobs.set(jobId, { status: 'done', previewUrl, ...(usageStats && { usage: usageStats }) });
}

app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`Repo path: ${REPO_PATH}`);
});
