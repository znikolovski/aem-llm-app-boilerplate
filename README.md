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

The **`mcp`** action is the **JavaScript implementation from [Adobe’s `generator-app-remote-mcp-server-generic`](https://github.com/adobe/generator-app-remote-mcp-server-generic)** (`index.js` + `tools.js` pattern), pinned to **`@modelcontextprotocol/sdk@1.17.4`** and **`@adobe/aio-sdk`** like that template so the **StreamableHTTPServerTransport + OpenWhisk req/res shim** matches what Adobe ships and tests.

- **`POST /v1/mcp`**: JSON-RPC over Streamable HTTP with **`enableJsonResponse: true`**, fresh server/transport per request (generator behavior).
- **`GET /v1/mcp`**: health JSON, or a short **SSE error** when `Accept: text/event-stream` (generator’s serverless stance). **Token/tool streaming for the LLM** stays in the **`chat`** action (SSE), not MCP GET.
- **Boilerplate extensions**: `actions/mcp/llm-boilerplate-tools.js` registers **`recommend`** and **`spotlight`** (same structured UI contract as the REST actions). Generator demo tools remain in `actions/mcp/tools.js`; edit or replace them as needed.

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

## TypeScript: root config vs webpack

- **`tsconfig.json`** sets **`"noEmit": true`** so **`npm run build`** can run **`tsc --noEmit`** without writing `.js` files into **`actions/`**.
- **`aio app build`** bundles actions with **webpack** + **ts-loader**. With the root config, TypeScript emits nothing and ts-loader fails with *“TypeScript emitted no output for …/index.ts”*. Overriding **`noEmit`** only inside the loader is unreliable depending on how AIO merges webpack.
- **`tsconfig.webpack.json`** extends the root config and sets **`noEmit: false`** and **`sourceMap: true`** (aligned with **`devtool: "inline-source-map"`** in **`webpack-config.cjs`**). ts-loader is pointed at that file via **`configFile`**.

## Notes

- **AI coding agents:** project architecture and contracts are in **`AGENTS.md`**; **`CLAUDE.md`** points there for tools that expect that filename.
- Streaming uses **Server-Sent Events** (`text/event-stream`) from the `chat` action; the SPA parses `data:` JSON lines and maps `event.type` to UI and navigation.
- Replace demo UI in `actions/shared/demo-payloads.ts` (and wire real services from `recommend` / `spotlight` / MCP tool handlers).
