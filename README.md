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

- **Endpoints (after deploy)**: **`POST https://<your-runtime-host>/v1/mcp`** carries JSON-RPC over Streamable HTTP with **`enableJsonResponse: true`** and a **fresh transport per request** (same serverless choices as [Adobe’s `generator-app-remote-mcp-server-generic`](https://github.com/adobe/generator-app-remote-mcp-server-generic)). This repo uses the SDK’s **`WebStandardStreamableHTTPServerTransport`** for POST because **`StreamableHTTPServerTransport`** in current `@modelcontextprotocol/sdk` builds on `@hono/node-server` and expects a full Node `IncomingMessage`; the generator’s minimal req/res shim does not receive responses correctly on SDK 1.29+.
- **`GET /v1/mcp`** (second API mapping in `app.config.yaml`, same path as POST) returns a **health JSON** payload; if the client sends **`Accept: text/event-stream`**, the action returns a short **SSE error** explaining that SSE is not supported server-side—again matching the official generator’s serverless pattern.
- The **`mcp`** action uses **`raw-http: true`**, **`limits`** (timeout / memory), and optional **`LOG_LEVEL`** like the generator’s `app.config.yaml`.
- Tools exposed today: **`recommend`** (location → UI blocks), **`spotlight`** (topic → UI blocks). Extend `actions/mcp/create-server.ts` when you add actions.

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
