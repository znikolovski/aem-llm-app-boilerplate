# Adobe App Builder — MVP MCP server

Minimal **Model Context Protocol** server for [Adobe I/O Runtime](https://developer.adobe.com/runtime/docs/), based on Adobe’s official template **[generator-app-remote-mcp-server-generic](https://github.com/adobe/generator-app-remote-mcp-server-generic)**.

## Features

- **Streamable HTTP** via `@modelcontextprotocol/sdk` (`StreamableHTTPServerTransport`, JSON mode).
- **OpenWhisk-safe responses** (normalized headers + structured JSON bodies for `resultAsHttp`).
- **Hono-compatible** request/response shims (`rawHeaders`, `Host`, `end` lifecycle) for current SDK + Node 22.
- **OpenAI Apps–style rich UI**: `demo_rich_card` returns `structuredContent` and `_meta` (`openai/outputTemplate`, `ui.resourceUri`); HTML widget at `ui://widget/hello.html` with `text/html;profile=mcp-app`.

## Scripts

```bash
npm test           # Jest
aio app dev        # Local dev
aio app deploy     # Deploy to your workspace
```

Web action URL (after deploy):

`https://<namespace>.adobeioruntime.net/api/v1/web/<org>-<project>/mcp-app/mcp-server`

(Exact host/path comes from `aio app get-url` / deploy output.)

## Cursor (streamable HTTP)

```json
{
  "mcpServers": {
    "adobe-mcp-mvp": {
      "url": "https://<your-web-action-url>",
      "type": "streamable-http"
    }
  }
}
```

Use **POST** with JSON-RPC and headers `Accept: application/json, text/event-stream` and `Content-Type: application/json`.

## License

Apache-2.0
