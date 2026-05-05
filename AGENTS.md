# Agent instructions — `aem-llm-app-boilerplate`

> **Naming:** `AGENTS.md` is the canonical repo-root file for coding-agent context.  
> **`CLAUDE.md`** exists as a thin pointer for Claude Code and other tools that look for that filename by default.
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
     driven by `brand.toolRoutes`.

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
└── shared/
    ├── action.ts        runAction(): wraps OPTIONS, errors, response normalize
    ├── http.ts          jsonResponse / textResponse / sseStreamResponse / parseJsonBody
    ├── openwhisk-http.ts normalizeOpenWhiskWebResponse() — drops hop-by-hop headers
    ├── llm-config.ts    readOpenAiApiKey / readOpenAiModel / readBrandDisplayName
    ├── ui-blocks.ts     UIBlock + RecommendToolResponse types
    ├── config.ts        ConfigError class
    └── types.ts         RuntimeParams / RuntimeResponse

web-src/src/
├── app.jsx              <App>: applies brand.theme.accent[+Dark] CSS vars
├── index.jsx            createRoot(<App />)
├── router.jsx           "/" → AppShell; ":toolPath" → ToolRoutePage
├── brand.json           Per-brand identity + tool route map (see below)
├── styles.css           CSS variables (--bg --fg --accent …) + light/dark
├── layout/AppShell.jsx  Header + split chat|experience + ToolParallelStack
├── pages/
│   ├── Chat.jsx         SSE consumer; opens sessions per function_call
│   ├── ExperienceHome.jsx  Default right-pane content
│   └── ToolRoutePage.jsx   Bookmarkable per-tool view (uses same sessions)
├── components/
│   └── ToolParallelStack.jsx  Renders all active sessions; fetches blocks
├── context/
│   └── ExperienceSessionsContext.jsx  Reducer: skeleton → fetching → ready/error
├── lib/
│   └── toolRouting.js   listToolRoutes / toolRouteByName / toolNameFromPath
├── renderers/
│   └── uiRenderer.jsx   renderUI(blocks): text | card | table
└── services/
    └── api.js           apiUrl(); chatStream(); recommend(); spotlight()

app.config.yaml          Runtime manifest (actions, APIs, env inputs)
package.json             Workspace root + aio scripts
tsconfig.json            `noEmit: true` — `npm run build` / `tsc --noEmit` only (no `.js` in actions/)
tsconfig.test.json       emits compiled tests under `.cache/test` for `npm test`
tsconfig.webpack.json    `noEmit: false` + `sourceMap` — ts-loader for `aio app build` only
webpack-config.cjs       Webpack merge for App Builder; ts-loader `configFile` → tsconfig.webpack.json
test/                    node:test suites for action handlers
```

### TypeScript: CLI typecheck vs App Builder emit

The root **`tsconfig.json`** intentionally sets **`noEmit: true`** so **`npm run build`** runs **`tsc --noEmit`** and never writes compiled `.js` next to your `.ts` sources under **`actions/`**.

**`aio app build`** uses **webpack** + **ts-loader** with the merged **`webpack-config.cjs`**. If ts-loader used that same `tsconfig.json`, the compiler would emit no JS and ts-loader would error with *“TypeScript emitted no output for …”*. Trying to fix that with **`compilerOptions: { noEmit: false }`** only in the loader is fragile (AIO/webpack merges vary).

**Fix:** **`tsconfig.webpack.json`** extends the root file and overrides **`noEmit`** to **`false`** and sets **`sourceMap: true`** (matching **`devtool: "inline-source-map"`**). **`webpack-config.cjs`** passes **`configFile: path.resolve(__dirname, "tsconfig.webpack.json")`** to ts-loader. Keep **`npm run build`** unchanged against the root **`tsconfig.json`**.

When adding new **`compilerOptions`** for actions, put shared rules in **`tsconfig.json`** so both CLI and webpack inherit them; override emit-related flags only in **`tsconfig.webpack.json`** if needed.

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
SPA's `readSseStream()` (in `services/api.js`) parses by `\n\n` chunk
boundary and `data:` prefix.

## The UI-block contract (shared)

`actions/shared/ui-blocks.ts` defines exactly three block kinds today:

```ts
type UIBlock =
  | { type: "text";  content: string;                       skeleton?: boolean }
  | { type: "card";  title: string; body: string;           skeleton?: boolean }
  | { type: "table"; columns: string[]; rows: string[][];   skeleton?: boolean };

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
  "apiVersionPath": "/v1",                     // prefix for every action call
  "toolRoutes": {                              // tool-name → { path, label }
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
  `recommendation` becomes `/recommendation`, served by
  `pages/ToolRoutePage.jsx`.
- `theme.accent[+Dark]` are JS-applied to `:root` as `--accent` in
  `app.jsx`. **All other colour tokens** (`--bg`, `--fg`, `--panel`,
  `--line`, `--muted`, `--code`) live only in `styles.css` — to
  override them per brand, write an additional `tokens.css` imported
  after `styles.css` in `index.jsx` (or extend `app.jsx` to inject
  more JS-driven properties).

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

7. **(optional)** `test/chat-recommend.test.ts` style coverage for
   the new action.

If any of steps 1–6 is missed, the SPA either fails to open a
session (step 6 mismatched), opens a session that never resolves
(step 4/5 missing), or shows an error toast (step 1/2 broken).

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
- Never set hop-by-hop headers (`connection`,
  `transfer-encoding`, …). `normalizeOpenWhiskWebResponse` drops
  them, but it's better not to set them.

## Client-side conventions

- The `Chat` component owns the SSE consumption; the
  `ToolParallelStack` owns tool-action HTTP. Don't move SSE parsing
  out of `Chat.jsx` — it relies on local refs (`streamBuf`,
  `idByOutputIndex`) for stable session ids.
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
npm run build           # tsc --noEmit (root tsconfig.json — no emit to actions/)
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

## When this guide gets out of date

This file ships in the repo *with* the contracts it describes —
agents that scaffold from this branch should re-read it on every
new project. If the contracts change (new event type, new UIBlock
variant, restructured shared/), update this file in the same PR.
The Studio orchestrator caches this file's contents per app on
scaffold, so users get the new guide automatically the next time
they re-scaffold.
