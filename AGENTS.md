# Agent instructions — `aem-llm-app-boilerplate`

> **Naming:** `AGENTS.md` is the canonical repo-root file for coding-agent context.  
> **`CLAUDE.md`** exists as a thin pointer for Claude Code and other tools that look for that filename by default.  
> Older forks (e.g. [SecurBank LLM app](https://github.com/znikolovski/securbank-llm-app)) may still ship `AGENT_GUIDE.md`; treat **`AGENTS.md` here** as the merged, up-to-date guide.
>
> This file is read by AI coding agents (e.g. Studio's chat
> orchestrator) **after they scaffold a new app from this repo**. It
> describes the contracts between the server actions, the streaming
> chat protocol, and the React SPA — enough that an agent can add a
> new tool, swap data sources, or re-theme the app **without
> re-deriving the architecture from the source files every time.**
>
> Humans should still read `README.md` first. This file is the
> machine-friendly summary of the same system.

## What this app is

A self-contained **Adobe App Builder** project that ships:

1. **Streaming chat** powered by the OpenAI Responses API, exposed as
   a Runtime web action that emits **Server-Sent Events**
   (`text/event-stream`).
2. **Tool actions** (`recommend`, `spotlight`, …) that return a
   **structured UI-block contract** as JSON — never HTML, never
   model-formatted markup.
3. A **React SPA** with a split *chat | experience* layout that:
   - Parses the SSE stream from `chat`,
   - Opens a UI **session** for every `function_call` the model emits,
   - Fetches blocks from the matching tool action in parallel,
   - Renders blocks via `renderers/uiRenderer.jsx`,
   - Mirrors the same sessions on bookmarkable per-tool routes
     driven by `brand.toolRoutes`,
   - Supports **deep links** (path style `/recommendation?location=…` or hash style `/#/recommendation?location=…` when `HashRouter` is enabled) and an optional **ChatGPT Apps** bridge (`lib/mcpAppsBridge.js`) for `callTool` from embedded iframes.
4. An **MCP** web action (`actions/mcp/`) exposing `recommend` / `spotlight` as MCP tools that **POST** to the same REST actions as the SPA, returning Markdown plus `structuredContent` (UI blocks, URLs, optional `next_actions` for follow-up `spotlight` calls).

The whole thing is themable from `web-src/src/brand.json` plus the
CSS variables in `web-src/src/styles.css`. The boilerplate is meant
to be cloned per-brand; agents customising it should change *those*
two surfaces first and write code only when behaviour needs to differ.

## Project layout

```
actions/                 OpenWhisk web action handlers (TypeScript)
├── chat/index.ts        SSE streaming chat — wraps openai.responses.stream()
├── recommend/index.ts   Example tool action — returns { ui: UIBlock[] }
├── spotlight/index.ts   Second example tool action — same shape
├── mcp/                 Streamable HTTP MCP server + ChatGPT widget metadata
│   ├── index.js         MCP transport + capability registration
│   ├── tools.js         registerTools / resources / prompts + tools/list patch
│   ├── llm-boilerplate-tools.js   MCP tools recommend + spotlight (HTTP to sibling actions)
│   ├── resolve-web-base.js        LLM_APP_BASE_URL, experience origin, client base, deep links
│   ├── experience-routes.json     tool name → SPA path segment (sync with brand.toolRoutes.path)
│   ├── markdown-ui.js             Markdown for tool content; next_actions for spotlight
│   ├── mcp-ui-profile.js          MCP_UI_PROFILE: openai | mcp_apps | markdown (+ legacy DISABLE_OPENAI_WIDGET)
│   └── chatgpt-webapp-support.js  OpenAI widget, MCP Apps shell, tools/list patches
└── shared/
    ├── action.ts        runAction(): wraps OPTIONS, errors, response normalize
    ├── http.ts          jsonResponse / textResponse / sseStreamResponse / parseJsonBody
    ├── openwhisk-http.ts normalizeOpenWhiskWebResponse() — drops hop-by-hop headers
    ├── llm-config.ts    readOpenAiApiKey / readOpenAiModel / readBrandDisplayName
    ├── ui-blocks.ts     UIBlock + RecommendToolResponse types
    ├── config.ts        ConfigError class
    └── types.ts         RuntimeParams / RuntimeResponse

web-src/src/
├── app.jsx              `BrowserRouter` or `HashRouter` (from `brand.useHashRouter`) + theme CSS vars; warmupMcpAppsBridge()
├── index.jsx            createRoot(<App />); redirects Runtime → static host when needed
├── llmWebActionsBase.generated.js  `/api/v1/web/<pkg>/` from `app.config.yaml` (see `npm run sync:web-actions-base`)
├── router.jsx           "/" → AppShell; ":toolPath" → ToolRoutePage
├── brand.json           Per-brand identity + tool route map (see below)
├── styles.css           CSS variables + `ub-*` structured card layouts
├── layout/AppShell.jsx  Header + split chat|experience; **full-width experience-only** embed on any `brand.toolRoutes` path
├── pages/
│   ├── Chat.jsx         SSE consumer; opens sessions per function_call
│   ├── ExperienceHome.jsx  Default right-pane content
│   └── ToolRoutePage.jsx   Bookmarkable per-tool view (uses same sessions)
├── components/
│   ├── ToolParallelStack.jsx   Renders sessions; fetches tool actions
│   ├── DeepLinkSessionSync.jsx Query-driven sessions (location / topic)
│   └── RecommendSpotlightCta.jsx  Recommend → spotlight (in-app + host callTool)
├── context/
│   └── ExperienceSessionsContext.jsx  Reducer: skeleton → fetching → ready/error
├── lib/
│   ├── toolRouting.js   listToolRoutes / toolRouteByName / toolNameFromPath
│   ├── adobeSpaHost.js  App Builder: redirect *.adobeioruntime.net → *.adobeio-static.net at SPA boot
│   └── mcpAppsBridge.js ChatGPT / MCP Apps postMessage + callTool helpers
├── renderers/
│   └── uiRenderer.jsx   renderUI(blocks): text | card | table (+ variants)
└── services/
    └── api.js           apiBaseUrl / apiUrl; generated web-actions path; SSE; tool POST helpers

app.config.yaml          Runtime manifest (actions, APIs, env inputs)
package.json             Workspace root + aio scripts (+ postinstall sync for SPA web-actions path)
scripts/
└── sync-web-actions-base.mjs  derives `/api/v1/web/<package>/` from app.config.yaml → llmWebActionsBase.generated.js
test/                    node:test suites (actions + MCP)
```

## End-to-end request flow

```
User types into <Chat />
  └─> chatStream(message)        web-src/src/services/api.js
       └─> POST /v1/chat         (SSE)
            └─> actions/chat/index.ts
                 └─> openai.responses.stream({ tools: [...], … })
                      └─> yields response.* events as `data: <json>\n\n`
  ┌──────────────────────────────────────────────────────────────────┐
  │ Chat.jsx.handleEvent()                                           │
  │   response.output_text.delta  → append to streaming bubble       │
  │   response.output_item.added (function_call, known tool)         │
  │     → beginSession(id, tool)  // adds {phase:"skeleton"}         │
  │   response.output_item.done   (function_call)                    │
  │     → setSessionParams(id, tool, JSON.parse(item.arguments))     │
  │       // flips phase to "fetching"                                │
  │   response.completed          → backstop reconciliation           │
  └──────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │ ToolParallelStack (effect on sessions array)                     │
  │   for any session with phase==="fetching" and unique id:         │
  │     fetch /v1/<tool>  with the session's params                  │
  │     → setSessionResult(id, blocks | null, error?)                │
  │       // flips phase to "ready" or "error"                        │
  └──────────────────────────────────────────────────────────────────┘
```

## Streaming protocol — exact event shapes the SPA relies on

`actions/chat/index.ts` forwards every event from `openai.responses.stream()`
verbatim, one per SSE `data:` line. The SPA ignores events it doesn't
recognise. The four it cares about:

| Event type | Used for | Required fields |
| --- | --- | --- |
| `response.output_text.delta` | streamed assistant text | `delta: string` |
| `response.output_item.added` | open a UI session for a tool | `item.type === "function_call"`, `item.name`, `item.call_id`, `output_index` |
| `response.output_item.done` | hand the call's parsed args to the session | `item.type === "function_call"`, `item.arguments: string`, `item.call_id` |
| `response.completed` | backstop reconciliation if any items missed `.done` | `response.output: Array<{ type, name, call_id, arguments }>` |
| `stream.error` | terminal error, bubbled into chat error banner | `error: string` |

Session ids are resolved as: `item.call_id` if present, otherwise a
stable id keyed on `output_index` (see `Chat.jsx.resolveSessionId`).
Two `function_call` items with the same `call_id` collapse to a single
session — that's the "stable identity per tool invocation" guarantee
the reducer leans on.

**Do not change the server-side wrapping** (`data: <json>\n\n`) — the
SPA's `readSseStream()` (in `services/api.js`) joins **multi-line `data:`**
records per the SSE spec and normalizes `\r\n`, so proxies that chunk
differently still work.

## Multi-host interaction requirement (MCP)

Every MCP-exposed tool that drives structured UI **must** remain usable under **all three** delivery modes below. When you add or change a tool, update **OpenAI widget + `tools/list` metadata**, **MCP Apps resource + patches** (where applicable), and **markdown** in **`actions/mcp/markdown-ui.js`** together, and extend **`test/mcp-ui-profile.test.cjs`** (or equivalent) so profiles do not drift.

1. **`openai`** (default) — ChatGPT / OpenAI Apps SDK: `ui://widget/llm-app-experience.html`, **`openai/toolInvocation`** on tool results where the host expects it (`actions/mcp/chatgpt-webapp-support.js`).
2. **`mcp_apps`** — Hosts implementing [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps.md): `text/html;profile=mcp-app` resource at **`ui://widget/llm-app-mcp-app.html`**, **`@modelcontextprotocol/ext-apps`** in the shell (jsdelivr); tool results **omit** **`openai/*`** keys; **`structuredContent`** still carries **`experienceUrl`**, **`ui`**, etc.
3. **`markdown`** — Text-only / widget-less clients: **no** `ui://` resources, **no** OpenAI **`_meta`** on tools; tool **`content`** markdown must still describe **how to continue in chat** (exact tool names and JSON fields, e.g. **`spotlight`** with **`topic`** from **`structuredContent.next_actions`**) with optional deep links as a supplement, not the only path.

Profile resolution (see **`actions/mcp/mcp-ui-profile.js`**): top-level **`params.MCP_UI_PROFILE`**, then **`__ow_query`** (e.g. `…/mcp?MCP_UI_PROFILE=markdown`), then headers **`x-mcp-ui-profile`** / **`mcp-ui-profile`**, then **`process.env`** / **`app.config.yaml`** `inputs`. Legacy: **`DISABLE_OPENAI_WIDGET`** (and **`x-disable-openai-widget`**) maps to **`markdown`** only — use **`MCP_UI_PROFILE=mcp_apps`** explicitly for the MCP Apps iframe.

## MCP server, deep links, and ChatGPT Apps

- **`actions/mcp/llm-boilerplate-tools.js`** registers MCP tools **`recommend`** (`location`) and **`spotlight`** (`topic`) that mirror the REST handlers. Resolution of public bases and safe client-facing URLs lives in **`resolve-web-base.js`**; **`experience-routes.json`** maps each tool name to the SPA segment (must stay aligned with **`brand.toolRoutes[*].path`**).
- **`buildExperienceViewUrl`** (same module family) builds deep links into the SPA. **Default:** path URLs (`https://host/recommendation?location=…`) for **`BrowserRouter`**. If the static host cannot serve `index.html` for arbitrary paths (typical **Adobe App Builder** static delivery), set **`LLM_EXPERIENCE_USE_HASH_ROUTES=1`** on the MCP action (OpenWhisk **`params` / env**, often via **`app.config.yaml`** `inputs`) so links are `https://host/#/recommendation?…`. **Keep the SPA in sync:** set **`useHashRouter`: true** in **`web-src/src/brand.json`** so **`app.jsx`** wraps the tree in **`HashRouter`**. When the SPA is also namespaced under **`/<package>/`** (synced **`LLM_SPA_BASENAME`**), hash deep links use **`https://host/<package>/index.html#/…`** so **`*.adobeio-static.net`** serves a real document instead of 404 on **`/<package>#/`** (the fragment is not sent to the server). If MCP emits path URLs while the SPA uses `HashRouter`, bookmark and widget links will not match the router.
- **`app.config.yaml`** passes through optional **`LLM_APP_BASE_URL`**, **`LLM_EXPERIENCE_ORIGIN`**, **`LLM_APP_OW_PACKAGE`**, **`LLM_CHATGPT_FRAME_DOMAINS`**, **`MCP_UI_PROFILE`**, **`DISABLE_OPENAI_WIDGET`**, and (when used) **`LLM_EXPERIENCE_USE_HASH_ROUTES`** for the MCP action — see the env table below.
- **`web-src/src/components/DeepLinkSessionSync.jsx`** opens sessions from the query string: **`location`** (recommend) and **`topic`** (spotlight). Legacy aliases **`productType`** / **`product`** still work for older bookmarks.
- **`mcpAppsBridge.js`** + **`RecommendSpotlightCta`**: in an embedded ChatGPT-style iframe, the CTA tries **`window.openai.callTool('spotlight', { topic })`** (or MCP **`tools/call`**) and always **`navigate`**s to the in-app spotlight route so **`POST /spotlight`** runs via **`ToolParallelStack`** even if the host bridge is a no-op.
- **MCP UI profile** (`actions/mcp/mcp-ui-profile.js`, **`registerExperienceWidgetsForProfile`** / **`patchToolsListForLlmAppWebapp`** in **`chatgpt-webapp-support.js`**): see **Multi-host interaction requirement** above.

## SPA routing and experience layout

### Hash routes (`HashRouter` + MCP deep links)

- **When to use:** Static hosts that do **not** rewrite unknown paths to `index.html` need **hash routing** so the SPA path lives in the fragment: `https://origin/#/segment?query=…`. **Adobe App Builder** deployments often behave this way.
- **`web-src/src/brand.json`:** optional boolean **`useHashRouter`**. When true, **`web-src/src/app.jsx`** uses **`HashRouter`** instead of **`BrowserRouter`**. Omit or set false for path-based hosting (local dev behind a dev server that supports SPA fallback, etc.).
- **MCP / markdown links:** Set **`LLM_EXPERIENCE_USE_HASH_ROUTES`** to **`1`** or **`true`** on the **MCP** action (`app.config.yaml` under that action’s **`inputs`**, or the equivalent env) so **`actions/mcp/resolve-web-base.js`** **`buildExperienceViewUrl`** emits **`/#/<segment>?…`** URLs. This must agree with **`useHashRouter`** — mismatched MCP vs SPA breaks deep links and “View in app” CTAs.
- **`RecommendSpotlightCta.jsx`:** the anchor’s **`href`** is built with **`useHref(...)`** from React Router so “open in new tab” and copy-link get the correct hash URL, not a bare path that the static host would 404.
- **`Link` / `navigate()`:** keep using logical paths like **`/spotlight?topic=…`**; React Router rewrites them under **`HashRouter`**.

### Adobe App Builder: static SPA host vs Runtime API host

- **Serve and bookmark the UI from the static workspace host**, typically **`https://<workspace>-<app>.adobeio-static.net/`** (exact hostname is shown in your App Builder / deploy output). That is where **`index.html`** and the Parcel bundle live. With **namespaced** builds (default when the Runtime package key is present and **`LLM_STATIC_WEB_AT_ROOT`** is unset), hash routes look like **`https://…adobeio-static.net/<package>/index.html#/recommendation?…`** so each app under the same origin keeps its own shell and hashed assets. With **`LLM_STATIC_WEB_AT_ROOT=1`** (single SPA per host), links use **`…/index.html#/…`** at the origin root instead — do not use that mode when multiple apps require **`/<package>/`** isolation.
- **`https://<workspace>-<app>.adobeioruntime.net/`** is the **Adobe I/O Runtime web-actions API** surface (`/api/v1/web/<ns>/<pkg>/…`). It is **not** a general-purpose static file host for `/` + client-side routes. Opening **`…adobeioruntime.net/#/…`** (origin + hash only) usually does **not** return your SPA; the gateway often **redirects** to Adobe’s generic Runtime documentation ([`developer.adobe.com/runtime`](https://developer.adobe.com/runtime/)), which breaks experience deep links.
- **Set `LLM_EXPERIENCE_ORIGIN`** (MCP action `inputs` / secrets) to the **same static origin** you use in the browser so **`buildExperienceViewUrl`** in **`resolve-web-base.js`** never emits experience links on **`adobeioruntime.net`** unless that host truly serves your built `index.html` at `/` (unusual for App Builder).
- **Automatic fallback (no env required):** **`resolveLlmExperienceOrigin`** maps any workspace **`*.adobeioruntime.net`** origin it would otherwise return to the matching **`*.adobeio-static.net`** origin via **`mapWorkspaceAdobeRuntimeToStaticSpaOrigin`** (same subdomain prefix). **`resolveLlmPublicWebActionOrigin`** / **`resolveLlmClientWebBase`** are unchanged — Runtime remains the target for **`/api/v1/web/…`** POSTs. The SPA entry **`web-src/src/index.jsx`** calls **`redirectAdobeRuntimeSpaToStaticHost()`** from **`lib/adobeSpaHost.js`** so opening an experience URL on **`adobeioruntime.net`** immediately **`location.replace`**s to the static host (skips paths that already include **`/api/v1/web/`**).

### Tool-route embed (experience-only chrome)

Goal: on **bookmarkable tool URLs**, the user sees **only** the structured tool UI (cards, tables, etc.) — **no** app shell header, **no** chat column, **no** duplicate `ToolRoutePage` outlet under the stack.

- **What counts as a tool route:** the first URL segment (path or hash path) matches **`brand.toolRoutes[*].path`** — resolved with **`toolNameFromPath`** in **`layout/AppShell.jsx`**.
- **`AppShell.jsx` on a tool route:** hides the **shell header**; adds **`tool-route-embed`** on the shell body so CSS hides the **chat** column (see **`styles.css`** `.shell-body.split-chat-experience.tool-route-embed`); applies **`experience-column--embed-bare`** so the experience column has **no** “split pane” subheading and **no** **`<Outlet />`** (the outlet would duplicate the same sessions shown in the stack). **`ToolParallelStack`** is the main surface.
- **`/` (home):** unchanged — full header and **chat | experience** split, **`ExperienceHome`** + outlet for **`ToolRoutePage`** when navigating under the split layout.
- **`ToolParallelStack.jsx`:** reads **`useLocation()`** and **`brand.toolRoutes`** to detect **`routeTool`**. If the user is on a tool route **before** any session exists, renders a short muted **empty state** instead of a blank column. **Minimal stack chrome** (`tool-stack--embed-minimal`: no “Live tools” band; **floating ×** dismiss instead of a panel header row) applies when **`routeTool`** is set **or** when **every** open session’s **`tool`** name is in **`Object.keys(brand.toolRoutes)`** (so the home split view also drops redundant panel chrome when only branded tools are active). Panels that use the floating dismiss include **`tool-panel--experience-embed`** for **`position: relative`** (see **`styles.css`**).
- **Wiring:** **`brand.toolRoutes`** declares routes; **`ToolParallelStack`** **`fetchBlocksForTool`** and **`services/api.js`** must still implement **`POST /v1/<tool>`** for each tool the model can call — layout embed does not replace those steps.

## The UI-block contract (shared)

`actions/shared/ui-blocks.ts` defines the block kinds the SPA renderer understands (extend the union and **`uiRenderer.jsx`** together):

```ts
type UIBlock =
  | { type: "text"; content: string; skeleton?: boolean; role?: "sectionHeading" }
  | {
      type: "card";
      title: string;
      body: string;
      skeleton?: boolean;
      variant?: "spotlightHero" | "recommendHero" | "recommendTile";
      badge?: string;
      ctaLabel?: string;
      learnMoreLabel?: string;
      spotlightTopic?: string;   // handoff to spotlight tool + query ?topic=
      spotlightProduct?: string; // deprecated alias
      href?: string;
      kicker?: string;
      imageUrl?: string;
      imageAlt?: string;
    }
  | { type: "table"; columns: string[]; rows: string[][]; skeleton?: boolean };

interface RecommendToolResponse { ui: UIBlock[]; }
```

Tool actions **must** return `{ ui: UIBlock[] }`. The SPA's
`renderers/uiRenderer.jsx` ignores any block whose `type` it doesn't
know — adding a new variant requires editing **both** `ui-blocks.ts`
**and** `uiRenderer.jsx` together.

**Hard rules** (these are what keep brand consistency across
deployments):

- The model never emits HTML. UI styling lives in the SPA, not in
  model output.
- `text` is for short framing prose; long copy goes in `card.body`.
- `card.title` is short; `card.body` may be one paragraph.
- `table` columns and every row must have the same length.
- `skeleton: true` is reserved for loading placeholders rendered by
  the SPA itself; tool actions should not return it.

## `brand.json` contract

```jsonc
{
  "kicker":      "Adobe App Builder",          // small label above appTitle
  "appTitle":    "LLM App Boilerplate",        // <h1> in the header
  "appSubtitle": "…",                          // <p> under appTitle
  "apiVersionPath": "/v1",                     // fallback prefix when neither generated base nor webActionsBase is set
  "webActionsBase": "",                       // optional override: absolute or /api/v1/web/… path (cross-origin prod, etc.)
  "logoUrl": "",                               // optional header logo (omit or empty for text-only header)
  "useHashRouter": false,                      // optional; true → HashRouter in app.jsx (pair with LLM_EXPERIENCE_USE_HASH_ROUTES on MCP)
  "toolRoutes": {                              // tool-name → { path, label } — path must match experience-routes.json
    "recommend":  { "path": "recommendation", "label": "Stays & trips" },
    "spotlight":  { "path": "spotlight",       "label": "Campaign spotlight" }
  },
  "theme": {
    "accent":     "#0f766e",                   // light-mode accent
    "accentDark": "#2dd4bf"                    // dark-mode accent
  }
}
```

Notes for an agent editing this:

- The **key** in `toolRoutes` MUST equal the OpenAI function tool's
  `name` exported from `actions/chat/index.ts`. Mismatched keys are
  silently ignored in the SPA (`toolRouteByName` returns null →
  `Chat.jsx` skips opening a session).
- `toolRoutes[*].path` is also the SPA route segment under `/`. So
  `recommendation` becomes `/recommendation` (or `/#/recommendation` when
  `useHashRouter` is true), served by
  `pages/ToolRoutePage.jsx` when the embed layout is **not** active (see **Tool-route embed** above).
- **`deepLinkParams`** (optional string array on a `toolRoutes` entry): when present, **`DeepLinkSessionSync`** opens a session from the URL when **all** listed query keys are non-empty, and **`ToolParallelStack`** must have a matching **`fetchBlocksForTool`** branch plus **`services/api.js`** helper for that tool name. **`recommend`** / **`spotlight`** use fixed keys (`location` / `topic`) and do not need `deepLinkParams`.
- `theme.accent[+Dark]` are JS-applied to `:root` as `--accent` in
  `app.jsx`. **All other colour tokens** (`--bg`, `--fg`, `--panel`,
  `--line`, `--muted`, `--code`) live only in `styles.css` — to
  override them per brand, write an additional `tokens.css` imported
  after `styles.css` in `index.jsx` (or extend `app.jsx` to inject
  more JS-driven properties).

## Web actions base URL (SPA → OpenWhisk)

- **`web-src/src/llmWebActionsBase.generated.js`** exports **`LLM_WEB_ACTIONS_BASE_PATH`** (e.g. **`/api/v1/web/<package-key>`**, no trailing slash). It is **regenerated** from the **first** package key under **`application.runtimeManifest.packages`** in **`app.config.yaml`** by **`npm run sync:web-actions-base`** (`scripts/sync-web-actions-base.mjs`).
- **`web-src/src/llmSpaBasename.generated.js`** exports **`LLM_SPA_BASENAME`** (e.g. **`/<package-key>`**, no trailing slash) — the same segment as the Runtime package **unless** **`LLM_STATIC_WEB_AT_ROOT=1`** at **`npm run sync:web-actions-base`** time (then **`""`** for an intentional single-SPA-at-root layout). Parcel **`targets.default.publicUrl`** and **`targets.webassets.publicUrl`** are **`/<package>/`** or **`/`** (**`aio app build`** uses the **`webassets`** target); **`distDir`** is **`./dist/<package>`** for local **`parcel build`**. **`aio app build`** flattens output to **`dist/application/web-prod`** then **`post-app-build`** nests it under **`/<package>/`** and can rewrite root **`/web-src.*`** URLs if needed. **`deploy-static`** (`scripts/aio-deploy-static-scoped.cjs` in **`app.config.yaml`**) replaces stock CDN deploy so only **`namespace/<package>/`** is emptied on S3 — otherwise another app’s **`aio app deploy`** in the **same workspace** wipes every sibling’s static tree. **`BrowserRouter`** passes **`LLM_SPA_BASENAME`** as React Router **`basename`** when non-empty; **`HashRouter`** must **omit** **`basename`** (routes live in the hash after `#`; the document URL carries `/<package>/` when namespaced — see **`web-src/src/app.jsx`**). **`actions/mcp/resolve-web-base.js`** **`buildExperienceViewUrl`** and **`resolveLlmSpaBasename`** prefix MCP deep links with that path (override with **`LLM_SPA_BASENAME`** or **`LLM_STATIC_WEB_AT_ROOT`** only when you understand the trade-off for multi-app hosts).
- **`postinstall`**, **`preapp:dev`**, and **`preapp:build`** run that script so the path stays aligned when Adobe renames the package hash. **Commit** both generated files (and the updated **`web-src/package.json`** `targets`) so CI and fresh clones work without an extra step.
- **`brand.json` `webActionsBase`** remains an optional **override** (e.g. absolute Runtime URL when the SPA is on **`adobeio-static.net`** and actions stay on **`adobeioruntime.net`**). If empty, **`services/api.js`** uses **`LLM_WEB_ACTIONS_BASE_PATH`** before falling back to **`apiVersionPath`**.

## Adding a new tool — checklist

To add a tool called `compare` (compares two products, etc.), an
agent must touch **all** of these and nothing else:

1. **`actions/compare/index.ts`** — copy `actions/recommend/index.ts`
   as a template. The handler:
   - Reject non-POST with 405.
   - `parseJsonBody(params)` and validate the expected fields.
   - Return `jsonResponse({ ui: UIBlock[] })`.
   - On bad input, return `jsonResponse({ error }, 400)` — do NOT
     throw past `runAction`.

2. **`app.config.yaml`** — under `application.runtimeManifest.packages.llm-app.actions`
   add a `compare:` block mirroring `recommend`'s. Then under
   `apis.llm-app-api.v1` add a route `compare: { compare: { method: post, response: http } }`.

3. **`actions/chat/index.ts`** — add a `COMPARE_TOOL` `function`
   tool definition (matching the exact `name: "compare"`), include
   it in the `tools: […]` array passed to `client.responses.stream`,
   and extend the `instructions:` prose to mention when to call it.
   Without the prose update the Responses API will know the tool
   exists but never invoke it.

4. **`web-src/src/services/api.js`** — add a `compare(params, opts)`
   function that mirrors `recommend()` (same headers, same error
   handling, same `apiUrl("compare")` shape).

5. **`web-src/src/components/ToolParallelStack.jsx`** — extend
   `fetchBlocksForTool()` with a `tool === "compare"` branch that
   validates params and calls `compare(params, { signal })`.

6. **`web-src/src/brand.json`** — add `"compare": { "path":
   "comparison", "label": "Side-by-side" }` (or whatever path/label
   suits the brand). The route `/comparison` becomes available
   automatically; no router edits.

7. **`actions/mcp/experience-routes.json`** — add `"compare": "comparison"` (same segment as `brand.toolRoutes.compare.path`) so MCP deep links and widget metadata stay aligned.

8. **(optional)** `test/chat-recommend.test.ts` style coverage for
   the new action.

9. **(optional, MCP)** Extend **`actions/mcp/llm-boilerplate-tools.js`** with a `compare` MCP tool (same JSON contract as the REST handler) if ChatGPT/MCP consumers need it. If the tool is MCP-visible, ship **all three UI profiles** (**`openai`**, **`mcp_apps`**, **`markdown`**) per **Multi-host interaction requirement** — widget registration, **`tools/list`** patches, chat-complete markdown, and **`test/mcp-ui-profile.test.cjs`** coverage.

If any of steps 1–7 is missed, the SPA either fails to open a
session (step 6 mismatched), opens a session that never resolves
(step 4/5 missing), shows an error toast (step 1/2 broken), or MCP
deep links point at the wrong route (step 7).

## Theming — Figma / brand customisation

Two layers, in increasing intrusiveness:

1. **`brand.json` overrides** — text + accent + tool list. No code
   edits. This is what most per-brand deploys should do.

2. **`web-src/src/tokens.css`** *(new file, optional)* — extra CSS
   variables overriding `--bg`, `--fg`, `--panel`, `--line`,
   `--muted`, `--code`. Import it after `styles.css` in `index.jsx`:

   ```js
   import "./styles.css";
   import "./tokens.css"; // brand overrides
   ```

   Keep the variable names identical to `styles.css` so the
   light/dark `@media` block in `styles.css` continues to work.

3. **Beyond colours** — if a brand needs new layout primitives
   (radii, shadows, type ramp), extend `styles.css` directly rather
   than overloading `tokens.css`. `tokens.css` is for token swaps
   only, so an automated theme pipeline (e.g. Studio's Figma
   ingestion) can rewrite it deterministically.

**Things to avoid when re-theming:**

- Inline styles with hard-coded colours in JSX. Use the CSS
  variables. The few inline styles that *do* exist (font sizes,
  margins) are intentionally non-brand.
- New CSS files outside `styles.css` / `tokens.css` — there's no
  bundler convention here for them.

## Server-side conventions

- All handlers run inside `runAction()`. Don't write your own
  `try/catch` for top-level errors — `runAction` maps `ConfigError`
  → 400, `Error` containing "not found" → 404, "fetch failed" → 502,
  default → 500.
- Build responses **only** through the helpers in `shared/http.ts`
  (`jsonResponse` / `textResponse` / `htmlResponse` /
  `sseStreamResponse` / `noContentResponse` / `errorResponse`).
  They emit CORS headers, content-type, and OpenWhisk-friendly
  shapes.
- Read configuration via `shared/llm-config.ts` helpers, never
  `process.env` directly. The helpers fall back to `params[key]`
  first, which is how `app.config.yaml`'s `inputs:` map plumbs env
  vars into the action.
- **`parseJsonBody`** (`shared/http.ts`): under **`aio app dev`**, JSON fields are often **flattened onto `params`** (no `__ow_body`). The helper merges those fields (skipping `__ow_*`, `body`, and ALL_CAPS keys) when the body is empty — same pattern as hardened production apps.
- Never set hop-by-hop headers (`connection`,
  `transfer-encoding`, …). `normalizeOpenWhiskWebResponse` drops
  them, but it's better not to set them.

## Client-side conventions

- The `Chat` component owns the SSE consumption; the
  `ToolParallelStack` owns tool-action HTTP. Don't move SSE parsing
  out of `Chat.jsx` — it relies on local refs (`streamBuf`,
  `idByOutputIndex`) for stable session ids. `Chat.jsx` also handles
  extra Responses event shapes (`response.output_text.done`, reasoning
  deltas, `response.failed`, top-level `error`) for newer API streams.
- **`services/api.js`**: normalizes **`webActionsBase`** / **`window.__LLM_API_BASE__`**, then **`LLM_WEB_ACTIONS_BASE_PATH`** from **`llmWebActionsBase.generated.js`** (synced from **`app.config.yaml`** via **`npm run sync:web-actions-base`**). Under **`aio app dev`**, when the SPA is on **loopback** with an **explicit port other than the actions port** (default **9080**), web-actions URLs are sent to that actions origin so **`POST /api/v1/web/…`** does not hit Parcel (**405**). Optional **`window.__LLM_DEV_ACTIONS_PORT__`** if Express is not on **9080**. Strips duplicated host segments some gateways inject; parses SSE robustly. Prefer this module for all action HTTP.
- On **any** URL segment that matches **`brand.toolRoutes[*].path`**, **`AppShell`** uses the **tool-route embed** layout (header hidden, chat hidden, experience-only — see **SPA routing and experience layout**). Historically this was limited to recommend/spotlight; it now applies to **every** registered tool path.
- Sessions are keyed on the function-call's `call_id`. Re-using the
  same `id` twice is a no-op (`reducer` checks `state.sessions.some`).
- `renderUI` is the only place that translates `UIBlock` → DOM.
  Whenever you add a `UIBlock` variant in `shared/ui-blocks.ts`, add
  the matching `case` in `renderUI` in the same change.
- Routes are derived from `brand.toolRoutes` at runtime. Don't add
  a hand-written `<Route>` for a tool — it'll desync.

## Local dev / deploy

```bash
npm install
npm test                # tsc-then-node:test for actions
npm run build           # tsc --noEmit (type check)
npm run app:dev         # aio app dev — local Runtime + SPA
npm run app:deploy      # aio app deploy — pushes to your AIO workspace
```

Required env (in `.env` for `app:dev`, in App Builder secrets for
deployed envs):

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | yes | — | The Responses API call in `actions/chat`. |
| `OPENAI_MODEL` | no | `gpt-4o` | Override the model id. |
| `BRAND_DISPLAY_NAME` | no | `Your brand` | Injected into the chat system prompt + demo cards. |
| `LLM_APP_BASE_URL` | no | — | Explicit Runtime web-actions base for MCP + deep links (wins over inferred `__ow_path`). |
| `LLM_EXPERIENCE_ORIGIN` | no | — | Public **SPA** origin (scheme + host). On App Builder use **`*.adobeio-static.net`**, not **`*.adobeioruntime.net`**, so MCP deep links open the static app instead of the Runtime gateway (which may redirect to [`developer.adobe.com/runtime`](https://developer.adobe.com/runtime/)). |
| `LLM_APP_OW_PACKAGE` | no | — | Package segment when `__OW_ACTION_NAME` is a single segment (see `resolve-web-base.js`). |
| `LLM_CHATGPT_FRAME_DOMAINS` | no | — | Extra allowed frame origins for ChatGPT widget metadata (comma-separated). |
| `LLM_EXPERIENCE_USE_HASH_ROUTES` | no | — | Set to `1` / `true` on the **MCP** action so `buildExperienceViewUrl` emits hash links with a real **`index.html`** path before `#` (Model B: **`/<package>/index.html#/…`**). Pair with **`useHashRouter`: true** in `brand.json` (`HashRouter` in `app.jsx`). |
| `LLM_EXPERIENCE_DEV_PORT` | no | `9090` | On the **MCP** action: Parcel / bundler port under **`aio app dev`** when aio moved off **9090**; used so Model B **hash** `experienceUrl` targets **`https://localhost:<port>/<package>/index.html`** instead of **9080** (Express static 404). |
| `LLM_SPA_BASENAME` | no | — | Optional SPA path prefix for MCP deep links (e.g. `/my-pkg`) when **`LLM_APP_BASE_URL`** cannot be inferred; must match **`LLM_SPA_BASENAME`** from **`sync:web-actions-base`** / `web-src` generated basename. |
| `LLM_STATIC_WEB_AT_ROOT` | no | — | Set to **`1`** / **`true`** only when **one** SPA owns the whole static origin and MCP must omit the **`/<package>/`** prefix. **Leave unset** when several apps share **`*.adobeio-static.net`** and rely on **`/<package>/`** so bundles and **`index.html`** do not overwrite each other. Run **`npm run sync:web-actions-base`** after changing it. |
| `MCP_UI_PROFILE` | no | `openai` | MCP embedded UI mode: **`openai`** (OpenAI Apps SDK widget + `openai/toolInvocation`), **`mcp_apps`** (MCP Apps `text/html;profile=mcp-app` + ext-apps shell), **`markdown`** (no `ui://` widget; chat-first markdown). |
| `DISABLE_OPENAI_WIDGET` | no | — | Legacy; when `true` / `1` / `yes`, same as **`MCP_UI_PROFILE=markdown`** (does **not** enable `mcp_apps`). |

### Deployed App Builder vs `aio app dev` (production safety)

These deltas are **scoped to localhost** or to **MCP params that only match local dev**; a normal cloud deploy (`LLM_EXPERIENCE_ORIGIN` = `*.adobeio-static.net`, browser on that same host) is unchanged:

| Surface | Local-only condition | In production / on `*.adobeio-static.net` |
| --- | --- | --- |
| **`web-src/src/services/api.js`** `localAioParcelUiToActionsOrigin` | Hostname is **`localhost`**, **`127.0.0.1`**, or **`::1`**, and the page uses an **explicit port** (not default 443/80) **different from** the actions port (default **9080**, override **`window.__LLM_DEV_ACTIONS_PORT__`**). | Deployed hosts / implicit default ports → no remap; `apiBaseUrl()` uses `location.origin` + path, or absolute **`brand.webActionsBase`** / **`window.__LLM_API_BASE__`**. |
| **`actions/mcp/resolve-web-base.js`** `resolveLocalAioParcelDevOrigin` | Experience origin host is **`localhost`/`127.0.0.1`** and port is **`9080`**. | `LLM_EXPERIENCE_ORIGIN` points at static CDN → port is not `9080` → **no** `:9090` swap in `experienceUrl`. |
| **`upgradeLocalAioDevTlsOrigin`** | `http://localhost:9080` / `127.0.0.1:9080` only. | No effect on `https://…adobeio-static.net`. |
| **`web-src/src/app.jsx`** `HashRouter` | Omits **`basename`** whenever **`useHashRouter`** is true (hash paths never include the package prefix). | Same behaviour in prod and dev; **`BrowserRouter`** still uses **`LLM_SPA_BASENAME`**. |
| **`scripts/clean-web-src-dist.mjs`** | Deletes stray **`web-src/dist/`** before **`preapp:dev`** / **`preapp:build`**. | Harmless on CI/deploy (folder should not exist); does not touch **`dist/application/`** outputs. |

**Operational:** Keep **`LLM_EXPERIENCE_ORIGIN`** (MCP + secrets) on the **public static host**, not `localhost`, so MCP `experienceUrl` never picks up Parcel port logic in the cloud.

## Things to NOT do

- **Don't render HTML from the model.** The whole point of the
  UI-block contract is to keep brand identity consistent and
  prevent prompt injection from rewriting the UI. If a tool needs
  to render rich content, extend the `UIBlock` union and
  `renderUI`.
- **Don't bypass `services/api.js`.** All client → action HTTP
  goes through `apiUrl()` so `apiVersionPath` and
  `window.__LLM_API_BASE__` overrides keep working.
- **Don't read `process.env` from action handlers.** Use
  `llm-config.ts` so OpenWhisk-injected `params` take precedence.
- **Don't introduce a UI library** for theming. The CSS-variable
  approach is what allows automated re-theming pipelines (e.g.
  Studio's Figma ingestion) to rewrite tokens deterministically.
- **Don't add a hand-written route for a tool.** Add it to
  `brand.toolRoutes` and `lib/toolRouting.js` does the rest.
- **Don't enable `HashRouter` without aligning MCP.** If `brand.useHashRouter` is true, the MCP action must receive **`LLM_EXPERIENCE_USE_HASH_ROUTES=1`** (or equivalent); otherwise experience URLs from the server will not match the client router.
- **Don't add MCP-visible tools that only target one host.** Keep OpenAI **`_meta`**, MCP Apps resources, and **`markdown-ui.js`** chat-complete copy aligned (see **Multi-host interaction requirement**).

## When this guide gets out of date

This file ships in the repo *with* the contracts it describes —
agents that scaffold from this branch should re-read it on every
new project. If the contracts change (new event type, new UIBlock
variant, restructured shared/), update this file in the same PR.
The Studio orchestrator caches this file's contents per app on
scaffold, so users get the new guide automatically the next time
they re-scaffold.
