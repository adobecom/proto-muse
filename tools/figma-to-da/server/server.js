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

// Load skill files once at startup so the agent has full authoring knowledge
const SKILL_BASE = join(REPO_PATH, '.claude/skills/build-content-from-figma');
const skillContent = {
  skill: readFileSync(join(SKILL_BASE, 'SKILL.md'), 'utf8'),
  authoringPattern: readFileSync(join(SKILL_BASE, 'references/authoring-pattern.md'), 'utf8'),
  tokenMapping: readFileSync(join(SKILL_BASE, 'references/token-mapping.md'), 'utf8'),
  extractor: readFileSync(join(SKILL_BASE, 'agents/figma-content-extractor.md'), 'utf8'),
};
console.log('Skill files loaded from', SKILL_BASE);

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
  // Parse fileKey and nodeId from the Figma URL for REST API fallback
  const figmaFileMatch = figmaUrl.match(/figma\.com\/(?:design|file)\/([^/?#]+)/);
  const figmaFileKey = figmaFileMatch ? figmaFileMatch[1] : '';
  const figmaNodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  const figmaNodeId = figmaNodeMatch ? decodeURIComponent(figmaNodeMatch[1]) : '';

  const figmaAccessInstructions = FIGMA_TOKEN
    ? `### Figma access — REST API (preferred)

A Figma personal access token is available. Use the REST API to extract design content:

  # Get file metadata (title, frames)
  curl -s "https://api.figma.com/v1/files/${figmaFileKey}" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}" | head -c 4000

  # Get specific node content (text, fills, children)
  curl -s "https://api.figma.com/v1/files/${figmaFileKey}/nodes?ids=${figmaNodeId}" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}"

  # Export node as image (PNG or SVG)
  curl -s "https://api.figma.com/v1/images/${figmaFileKey}?ids=${figmaNodeId}&format=png" \\
    -H "X-Figma-Token: ${FIGMA_TOKEN}"

Use these to extract text content, background colors, and image assets. The node structure
gives you text layers, fills (colors/images), and component names. Derive heading levels and
body sizes from the layer names and visual hierarchy (see token-mapping reference below).

If Figma MCP tools (get_design_context, get_metadata) ARE available in this session, prefer
them over the REST API for richer output.`
    : `### Figma access — MCP only

No FIGMA_TOKEN env var is set. Attempt to use Figma MCP tools (get_design_context,
get_metadata, get_screenshot). If they are not available in this session, extract as much
as possible from the Figma URL structure and any publicly accessible metadata.`;

  return `## AUTOMATED MODE — non-interactive execution

You are running the build-content-from-figma skill fully automated for the DA app.
Skip every "STOP", "BLOCKING", and "wait for user confirmation" gate.
Proceed through all phases without pausing.

### Inputs (pre-filled — do not ask for these)

- Figma URL: ${figmaUrl}
- Figma file key: ${figmaFileKey}
- Figma node ID: ${figmaNodeId}
- DA org: ${org}
- DA site (repo): ${site}
- DA path: drafts/${username}/<slug>  ← derive <slug> as kebab-case from the Figma frame name
- DA token: ${token}

### Auth override

Never call da-auth-helper. Use the DA token above directly for every admin.da.live and
admin.hlx.page request:

  curl ... -H "Authorization: Bearer ${token}" ...

${figmaAccessInstructions}

### Git override

Do NOT create git branches, do NOT commit, do NOT push. This is content authoring only.
Skip Phase 6a (upload plan confirmation) and Phase 7a (preview/publish question) — proceed automatically.

### Phase 1 override (no user interaction)

- Extract the frame name from the Figma file (via REST API or MCP).
- Derive block name and slug from the frame name automatically (kebab-case).
- Set DA destination: org=${org}, repo=${site}, path=drafts/${username}/<slug>.html

### Preview fallback (IMPORTANT)

After a successful upload (Phase 6), attempt preview via:
  POST https://admin.hlx.page/preview/${org}/${site}/main/drafts/${username}/<slug>

If this returns 404 or any non-200 status, do NOT treat it as a fatal error.
Instead, output:
  PREVIEW_URL=https://da.live/edit#/${org}/${site}/drafts/${username}/<slug>

The DA edit URL is a valid result — the user can open it, review the content, and
publish from the DA editor.

### Output requirement

Your FINAL line of output must be exactly:
  PREVIEW_URL=<url>

where <url> is either the aem.page preview URL (if preview succeeded) or the
da.live edit URL (if preview returned 404). Only output PREVIEW_URL=error if
the DA upload itself failed (Phase 6).

---

## Skill content

${skillContent.skill}

---

## Authoring pattern reference

${skillContent.authoringPattern}

---

## Token mapping reference

${skillContent.tokenMapping}

---

## Figma content extractor (apply this for Phase 2)

${skillContent.extractor}
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
        if (name.startsWith('mcp__plugin_figma') || input.includes('api.figma.com')) {
          stage = Math.max(stage, 0);
        } else if ((name === 'Write' || name === 'Edit') && stage < 1) {
          stage = 1;
        } else if (name === 'Bash' && input.includes('admin.da.live')) {
          stage = Math.max(stage, 2);
        } else if (name === 'Bash' && input.includes('admin.hlx.page')) {
          stage = Math.max(stage, 3);
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
    });
    return;
  }

  jobs.set(jobId, { status: 'done', previewUrl });
}

app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`Repo path: ${REPO_PATH}`);
});
