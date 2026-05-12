# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AEM Edge Delivery Services (Helix v7)** site template built on Adobe's [Milo](https://github.com/adobecom/milo) library. Content is authored in SharePoint and served via Helix CDN. There is no build step — the project uses native ESM JavaScript loaded directly by the browser.

## Commands

```bash
# Local development server (http://localhost:3000)
aem up

# Run tests (one-time)
npm test

# Run tests in watch/debug mode
npm run test:watch

# Lint JS and CSS
npm run lint

# Lint individually
npm run lint:js
npm run lint:css

# Auto-fix JS lint issues
npx eslint . --fix
```

Install the Helix CLI once: `sudo npm install -g @adobe/aem-cli`

## Architecture

### Entry Point: `scripts/scripts.js`

This is the sole bootstrap file. It:
1. Resolves the Milo library URL based on environment (see "Library Routing" below)
2. Defines site config: locales, IMS client ID, geo-routing, custom decoration hooks
3. Imports and invokes Milo's `loadArea()` to render page blocks
4. Exports `setLibs()` / `getLibs()` so blocks can import Milo utilities at runtime

### Library Routing

The `milolibs` query param controls which Milo build is used:

| Context | Resolution |
|---|---|
| Production (`*.adobecom.*`) | `/libs` (same origin) |
| Local dev | `?milolibs=local` → `http://localhost:6456/libs` |
| Branch preview | `?milolibs=branch-name` → `https://branch-name--milo--adobecom.aem.live/libs` |
| Default (staging/forks) | `https://main--milo--adobecom.aem.live/libs` |

The `milolibs` param is validated against an allowlist to prevent DOM XSS (see `scripts/scripts.js`).

### Block System

Helix/Milo uses a **block-based** component model. Each block is a folder under `/blocks/` with a matching JS and CSS file. Blocks are auto-discovered from the page DOM by Milo's `loadArea()`. This project currently has no custom blocks — it relies entirely on Milo's built-in block library.

### Content

Content is sourced from SharePoint (configured in `fstab.yaml`). The Helix bot syncs SharePoint documents to the CDN. No local content editing — content changes go through SharePoint → Helix preview/publish workflow.

## Testing

- Framework: `@web/test-runner` with Chai assertions
- Tests live in `/test/**/*.test.js`
- Tests run in a real browser context (Chromium)
- External network requests are blocked in tests — mock anything external
- Existing tests cover the `setLibs()` library routing logic in `test/scripts/utils.test.js`

## Code Style

- **ESLint**: Airbnb base config. Import paths must include `.js` extension.
- **Stylelint**: Standard + Prettier. Applies to `blocks/**/*.css` and `styles/*.css`.
- **EditorConfig**: 2-space indent, LF line endings, single quotes.
- No TypeScript — pure ES2020+ JavaScript with ESM imports.
