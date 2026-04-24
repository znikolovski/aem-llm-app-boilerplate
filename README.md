# Adobe App Builder LLM App Boilerplate

This is a greenfield Adobe App Builder boilerplate for exposing an Edge Delivery Services website to LLM hosts. It provides:

- A public read-only MCP endpoint for portable MCP Apps-compatible hosts.
- ChatGPT-compatible rich UI metadata for product lists, product details, and homepage summaries.
- REST and OpenAPI fallbacks for hosts that do not speak MCP.
- A small normalization layer that turns an EDS-style site index into product and homepage data.

## Requirements

- Node.js 22 or newer.
- Adobe AIO CLI configured for App Builder deployment.
- A site index endpoint, usually an EDS `query-index.json` style response.

## Configure

Copy `.env.example` to `.env` and set:

```bash
SITE_INDEX_URL=https://main--repo--owner.aem.page/query-index.json
SITE_BASE_URL=https://www.example.com
HOMEPAGE_PATH=/
INDEX_CACHE_TTL_SECONDS=300
CONVERSATION_URL_TEMPLATE=
```

`SITE_INDEX_URL` may be any configured HTTP(S) index endpoint. Product and homepage page fetches are restricted to the same origin as `SITE_BASE_URL`.

## Run

```bash
npm install
npm test
npm run build
npm run app:dev
```

Deploy with:

```bash
aio login
aio app use path/to/workspace-config.json
npm run app:deploy
```

App Builder API Gateway routes are configured under the `v1` base path:

- `POST /v1/mcp`
- `GET /v1/products?category=&q=&limit=`
- `GET /v1/products/{id}`
- `GET /v1/whats-new`
- `GET /v1/openapi.json`

Depending on how the route is served locally or deployed, App Builder may prefix those paths with its runtime/API namespace.

## MCP Tools

- `website.list_products`: discover products from the site index, optionally filtered by category or text query.
- `website.get_product_details`: fetch one product page and extract details, key facts, CTA links, and deep links.
- `website.get_homepage_summary`: fetch the configured homepage and return a structured "what's new" summary.
- `website.render_product_list`: render product cards in an MCP Apps UI iframe.
- `website.render_product_detail`: render a rich product detail view.
- `website.render_whats_new`: render the homepage summary.

The render tools advertise `_meta.ui.resourceUri` for MCP Apps portability and `_meta["openai/outputTemplate"]` for ChatGPT compatibility.

## Index Shape

The index may be either:

```json
[{ "path": "/products/card", "title": "Example Card" }]
```

or:

```json
{ "data": [{ "path": "/products/card", "title": "Example Card" }] }
```

Useful fields include `path`, `url`, `title`, `description`, `category`, `tags`, `image`, and `lastModified`. If the index does not clearly mark product pages, the boilerplate falls back to all titled, non-homepage records.

## Security Notes

- V1 is public and read-only.
- Runtime actions do not require Adobe auth.
- The backend fetches only the configured index URL and same-origin website pages derived from `SITE_BASE_URL`.
- No LLM API calls are made by the backend; summarization is structured extraction for the host model to narrate.
