# Adobe App Builder LLM App Boilerplate

Greenfield App Builder project for **streaming LLM orchestration** (OpenAI Responses API), **tool actions** that return a **shared UI-block contract**, and a **React SPA** that consumes SSE, routes on tool intent, and renders real components (not HTML from the model).

## Stack

- **Actions**: `chat` (SSE stream of Responses events), `recommend` (JSON `{ ui: UIBlock[] }` demo).
- **Web**: React + React Router, `renderers/uiRenderer.jsx`, brand config in `web-src/src/brand.json`.
- **APIs**: `POST /v1/chat`, `POST /v1/recommend` (see `app.config.yaml`).

## Requirements

- Node.js 22+.
- Adobe I/O CLI (`aio`) for `app:dev` / `app:build` / `app:deploy`.

## Configure

Copy `.env.example` to `.env` and set at least `OPENAI_API_KEY`. Optional: `OPENAI_MODEL`, `BRAND_DISPLAY_NAME`.

Per-brand theming: edit `web-src/src/brand.json` (titles, accent colors, `toolRoutes`, `apiVersionPath`). For cross-origin APIs, set `window.__LLM_API_BASE__` before the bundle loads. `aio app build` may generate `web-src/src/config.json` with action URLs; that file is gitignored—defaults use same-origin `/v1/...` paths suitable for `aio app dev`.

## Run

```bash
npm install
npm test
npm run build
npm run app:dev
```

Deploy with `npm run app:deploy` once your AIO workspace is linked.

## Notes

- Streaming uses **Server-Sent Events** (`text/event-stream`) from the `chat` action; the SPA parses `data:` JSON lines and maps `event.type` to UI and navigation.
- Replace `demoHotels` in `actions/recommend/index.ts` with your own data sources per deployment.
