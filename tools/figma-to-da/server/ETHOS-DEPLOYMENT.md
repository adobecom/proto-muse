# Figma → DA Server: Ethos Deployment Plan

## What this server is

A lean Express app (`server.js`) that orchestrates a 3-agent Claude Code pipeline:

1. **Analyze agent** — reads a Figma design and maps sections to Milo blocks or marks new ones
2. **Block builder agents** — one per new block, run in parallel, produce JS + CSS
3. **Author agent** — extracts content, assembles DA HTML, uploads + previews

Two endpoints:
- `POST /jobs  { figmaUrl, daContext }` → `202 { jobId }`
- `GET  /jobs/:id` → `{ status, stage, previewUrl?, error?, usage? }`

The UI stays with each consuming project. The server is a shared service.

---

## Current dependencies and their Ethos friction

| Dependency | Current behavior | Friction |
|---|---|---|
| `REPO_PATH` env var | Reads reference docs, writes block files to disk, runs `git` | **Main blocker — see below** |
| `pathToClaudeCodeExecutable` | Hardcoded to a local user path | Trivial: replace with `process.env.CLAUDE_PATH` |
| In-memory `jobs` Map | Stores job state per process | Fine for single-pod MVP; add Redis for HA later |
| Figma MCP | Runs inside the claude subprocess | Needs MCP config baked into the container image |
| Bedrock auth | Already supported via `AWS_BEARER_TOKEN_BEDROCK` | Ethos-native; use IAM role instead of a static token |

---

## The one real problem: REPO_PATH

The server currently uses the local repo for three things:

### 1. Reading reference docs at startup
Files under `tools/figma-to-da/server/references/` and `.claude/skills/build-content-from-figma/` are read with `readFileSync`.

**Fix:** Load paths relative to `import.meta.url` so no external repo is needed. All reference docs already live inside the `server/` folder or can be copied there. `REPO_PATH` is not needed for this.

### 2. Writing new block files to disk
Block builder agents write `blocks/<name>/<name>.js` and `blocks/<name>/<name>.css` directly to the working tree so the author agent can read them.

**Fix:** Collect block file content from the agent's result text instead of from the filesystem. Block builders already output `BLOCK_DONE=<name>` plus the full JS/CSS in their response. The server captures these strings and passes them to the author agent as inline context. The `GET /jobs/:id` response gains a `generatedBlocks: [{ name, js, css }]` field so the UI (or a CI step) can apply them via the GitHub API using the project's own token.

### 3. Creating a git branch and pushing
`commitBuiltBlocks()` runs `git checkout -b`, `git add`, `git commit`, `git push` on the local repo.

**Fix:** Remove this function entirely. Block delivery moves to the API response (see above). The consuming project handles the GitHub commit in its own pipeline using its own credentials.

---

## Target architecture on Ethos

```
┌─────────────────────────────────────────────────────┐
│  Ethos cluster                                      │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  figma-da-server  (single Deployment)        │  │
│  │                                               │  │
│  │  node:lts                                     │  │
│  │  + claude CLI at /usr/local/bin/claude        │  │
│  │  + reference docs baked in at build time      │  │
│  │  + Figma MCP config in ~/.claude/mcp.json     │  │
│  │                                               │  │
│  │  Env vars (Vault / Ethos secrets):            │  │
│  │    AWS_BEARER_TOKEN_BEDROCK  (or API key)     │  │
│  │    AWS_REGION                                 │  │
│  │    FIGMA_TOKEN                                │  │
│  │    PORT=3001                                  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

Consumer projects (UI stays with them):
  figmaToDaServiceUrl: 'https://figma-da.ethos.adobe.net'
  daContext: { org, site, token }   ← project supplies its own DA token
```

---

## Files to add

```
tools/figma-to-da/server/
  Dockerfile
  .claude/mcp.json          ← Figma MCP config for the container
  k8s/
    deployment.yaml
    service.yaml
```

### Dockerfile (sketch)

```dockerfile
FROM node:lts-slim

# Install claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Copy server
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Figma MCP config
COPY .claude/mcp.json /root/.claude/mcp.json

ENV PORT=3001
ENV CLAUDE_PATH=/usr/local/bin/claude

EXPOSE 3001
CMD ["node", "server.js"]
```

### k8s/deployment.yaml (sketch)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: figma-da-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: figma-da-server
  template:
    spec:
      containers:
        - name: server
          image: <registry>/figma-da-server:<tag>
          ports:
            - containerPort: 3001
          env:
            - name: FIGMA_TOKEN
              valueFrom:
                secretKeyRef:
                  name: figma-da-secrets
                  key: figma-token
            # Bedrock auth via IAM role — no static key needed if
            # the pod's service account has the right AWS permissions
            - name: AWS_REGION
              value: us-west-2
```

---

## Code changes required in server.js

| Change | Scope |
|---|---|
| Load reference docs relative to `import.meta.url`, remove `REPO_PATH` reads | ~5 lines |
| `pathToClaudeCodeExecutable`: `process.env.CLAUDE_PATH \|\| '/usr/local/bin/claude'` | 1 line |
| Block builder: capture JS/CSS from agent result text instead of reading files | ~30 lines |
| Author agent: accept `generatedBlocks` as inline context instead of file paths | ~10 lines in prompt builder |
| Remove `commitBuiltBlocks()` and its call site | delete ~25 lines |
| Add `generatedBlocks` field to `GET /jobs/:id` response | ~5 lines |
| Tighten CORS to `*.aem.live` + `localhost` | 3 lines |

Total: roughly 2–3 hours of focused work, no architectural changes.

---

## Consumer onboarding (after server is deployed)

Three config values in the project's UI:

```js
const SERVICE_URL = 'https://figma-da.ethos.adobe.net';

const response = await fetch(`${SERVICE_URL}/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    figmaUrl: '...',
    daContext: { org: 'my-org', site: 'my-repo', token: daToken },
  }),
});
```

No local install, no REPO_PATH, no Claude CLI on the consumer machine. The project brings its own DA token; the service owns the Claude + Figma credentials.

If new blocks were generated, they come back in the job response:

```json
{
  "status": "done",
  "previewUrl": "https://main--my-repo--my-org.aem.page/drafts/...",
  "generatedBlocks": [
    { "name": "metric-strip", "js": "...", "css": "..." }
  ]
}
```

The UI (or a post-job webhook) can then open a PR to the project repo with those files.

---

## Open questions before implementation

- **Figma token scope**: single shared service token, or should consumers pass their own per request? Per-request is safer but adds friction.
- **Job persistence**: in-memory is fine for a single replica. If Ethos needs multiple replicas for HA, a Redis sidecar (or Ethos-managed cache) is needed before launch.
- **Claude CLI version pinning**: the Dockerfile should pin the claude CLI version to avoid pipeline regressions on auto-updates.
- **CORS allowlist**: confirm which origins need access (da.live, aem.live, localhost).
