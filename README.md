# Adobe App Builder LLM App Boilerplate

Greenfield App Builder project for **streaming LLM orchestration** (OpenAI Responses API), **tool actions** that return a **shared UI-block contract**, a **React SPA** that consumes SSE and routes on tool intent, and an **MCP (Model Context Protocol)** endpoint so hosts like **ChatGPT** can call the same tools over Streamable HTTP.

## Stack

- **Actions**: `chat` (SSE Responses stream), `recommend` / `spotlight` (JSON `{ ui: UIBlock[] }` demos), **`mcp`** (Streamable HTTP MCP server exposing those tools).
- **Web**: React + React Router with a **split chat | experience** layout, **parallel tool panels**, **dynamic routes** from `brand.toolRoutes`, and `renderers/uiRenderer.jsx` for the UI contract.
- **APIs**: `POST /v1/chat`, `POST /v1/recommend`, `POST /v1/spotlight`, **`POST /v1/mcp`** (see `app.config.yaml`).

## Requirements

- Node.js 22+.
- Adobe I/O CLI (`aio`) for `app:dev` / `app:build` / `app:deploy`.

## Configure

Copy `.env.example` to `.env` and set at least `OPENAI_API_KEY`. Optional: `OPENAI_MODEL`, `BRAND_DISPLAY_NAME`.

Per-brand theming: edit `web-src/src/brand.json` (titles, accent colors, `toolRoutes`, `apiVersionPath`). For cross-origin APIs, set `window.__LLM_API_BASE__` before the bundle loads. `aio app build` may generate `web-src/src/config.json` with action URLs; that file is gitignored—defaults use same-origin `/v1/...` paths suitable for `aio app dev`.

## MCP and ChatGPT

- **Endpoints (after deploy)**: `POST https://<your-runtime-host>/v1/mcp` for JSON-RPC requests, and **`GET https://<your-runtime-host>/v1/mcp`** for the Streamable HTTP **SSE** stream (same path; second API mapping in `app.config.yaml`, per Adobe’s action-apis pattern).
- The **`mcp`** action uses **`raw-http: true`** so JSON-RPC stays in `__ow_body`, per Adobe’s pattern for Streamable HTTP MCP.
- Tools exposed today: **`recommend`** (location → UI blocks), **`spotlight`** (topic → UI blocks). Extend `actions/mcp/create-server.ts` when you add actions.
- **POST / DELETE** responses are buffered with `response.text()` (including SSE-framed JSON-RPC) so OpenWhisk gets a string body. **`GET` SSE** is returned as a Node **`Readable`** stream (not fully buffered) so long-lived MCP streams do not block the action.

### If you cannot use MCP

For **Custom GPT** “Actions” style integrations, OpenAI’s other path is an **OpenAPI** description of REST tools (no MCP). This repo does not ship that YAML by default; you can describe `POST /v1/recommend` and `POST /v1/spotlight` (and auth) in an OpenAPI file and attach it to a Custom GPT instead of MCP.

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
- Replace demo UI in `actions/shared/demo-payloads.ts` (and wire real services from `recommend` / `spotlight` / MCP tool handlers).
