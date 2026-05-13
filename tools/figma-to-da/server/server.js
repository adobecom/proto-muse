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
  jobs.set(jobId, { status: 'pending' });
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

async function runAgent(jobId, figmaUrl, daContext) {
  const org = daContext?.org || '';
  const site = daContext?.site || '';
  const daBase = `https://da.live`;

  const prompt = `You are a DA page prototyper working in the proto-muse AEM Edge Delivery Services repository.

Your task:
1. Fetch the Figma design at: ${figmaUrl}
   - Use the Figma REST API (GET /v1/files/:fileKey) or WebFetch to retrieve component structure.
   - Extract the key sections, layout, text, and color tokens from the design.

2. Generate AEM block HTML + CSS files:
   - Create a new page at /tools/prototypes/<slug>/index.html using AEM block conventions.
   - For each major design section, create a matching block in /blocks/<block-name>/.
   - Use semantic HTML, minimal inline styles, and CSS custom properties for colors/spacing.

3. Commit the generated files to a new git branch named prototype/<slug>:
   git checkout -b prototype/<slug>
   git add .
   git commit -m "feat: prototype from Figma ${figmaUrl}"
   git push origin prototype/<slug>

4. Compute the AEM preview URL. AEM EDS automatically serves any pushed branch.
   The subdomain is the branch name with every "/" replaced by "-":
   Branch "prototype/<slug>" → subdomain "prototype-<slug>"
   Preview URL: https://prototype-<slug>--proto-muse--adobecom.aem.page/tools/prototypes/<slug>/

5. Trigger Helix to index the page by calling the admin preview API (no auth needed):
   curl -X POST "https://admin.hlx.page/preview/adobecom/proto-muse/prototype-<slug>/tools/prototypes/<slug>/index"

6. Your FINAL line of output must be exactly:
   PREVIEW_URL=https://prototype-<slug>--proto-muse--adobecom.aem.page/tools/prototypes/<slug>/

   This line must appear on its own with no other text after it.
   Do not summarise or add any content after this line.
   Replace <slug> with a short kebab-case name derived from the Figma file title.
   If the push fails, output: PREVIEW_URL=error on the last line and explain why above it.`;

  let previewUrl;

  const queryOptions = {
    cwd: REPO_PATH,
    permissionMode: 'bypassPermissions',
    allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'WebFetch'],
    pathToClaudeCodeExecutable: process.env.CLAUDE_PATH || '/Users/cod87753/.local/share/claude/versions/2.1.140',
    stderr: (line) => process.stderr.write(`[agent ${jobId.slice(0, 8)}] ${line}`),
  };

  if (process.env.BEDROCK_MODEL_SMART) {
    queryOptions.model = process.env.BEDROCK_MODEL_SMART;
  }

  let finalResult = '';
  for await (const msg of query({ prompt, options: queryOptions })) {
    if (msg.type === 'result') {
      finalResult = msg.result || '';
      // Explicit marker (preferred)
      const explicit = finalResult.match(/PREVIEW_URL=(\S+)/);
      if (explicit) previewUrl = explicit[1];
      // Fallback: any aem.live or aem.page URL in the result text
      if (!previewUrl) {
        const fallback = finalResult.match(/https:\/\/[^\s"')]+\.aem\.(live|page)[^\s"')]+/);
        if (fallback) previewUrl = fallback[0];
      }
    }
  }

  if (!previewUrl) {
    // Agent finished without a URL — surface the result text so the user isn't left empty-handed
    jobs.set(jobId, {
      status: 'done',
      previewUrl: null,
      summary: finalResult.slice(0, 1000),
    });
    return;
  }

  jobs.set(jobId, { status: 'done', previewUrl });
}

app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`Repo path: ${REPO_PATH}`);
});
