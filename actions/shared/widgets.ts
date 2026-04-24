export const PRODUCT_LIST_WIDGET_URI = "ui://widget/product-list.html";
export const PRODUCT_DETAIL_WIDGET_URI = "ui://widget/product-detail.html";
export const WHATS_NEW_WIDGET_URI = "ui://widget/whats-new.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export interface WidgetResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
  _meta: Record<string, unknown>;
}

export function listWidgetResources(resourceOrigin?: string): WidgetResource[] {
  return [
    createWidgetResource(PRODUCT_LIST_WIDGET_URI, "Product list", "Interactive product listing cards.", "product-list", resourceOrigin),
    createWidgetResource(PRODUCT_DETAIL_WIDGET_URI, "Product detail", "Interactive product detail view.", "product-detail", resourceOrigin),
    createWidgetResource(WHATS_NEW_WIDGET_URI, "What's new", "Interactive homepage summary view.", "whats-new", resourceOrigin)
  ];
}

export function readWidgetResource(uri: string, resourceOrigin?: string): WidgetResource {
  const resource = listWidgetResources(resourceOrigin).find((item) => item.uri === uri);
  if (!resource) {
    throw new Error("Resource not found.");
  }

  return resource;
}

function createWidgetResource(uri: string, name: string, description: string, kind: string, resourceOrigin?: string): WidgetResource {
  return {
    uri,
    name,
    description,
    mimeType: MCP_APP_MIME_TYPE,
    text: buildWidgetHtml(kind),
    _meta: {
      ui: {
        prefersBorder: true,
        csp: {
          connectDomains: [],
          resourceDomains: resourceOrigin ? [resourceOrigin] : []
        }
      }
    }
  };
}

function buildWidgetHtml(kind: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --fg: #171717;
      --muted: #5f6368;
      --line: #d8dce2;
      --panel: #f7f8fa;
      --accent: #0f766e;
      --accent-soft: #d9f4ef;
      --button: #111827;
      --button-fg: #ffffff;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101214;
        --fg: #f4f4f5;
        --muted: #a1a1aa;
        --line: #30343a;
        --panel: #171a1f;
        --accent: #2dd4bf;
        --accent-soft: #123d38;
        --button: #f4f4f5;
        --button-fg: #111827;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-size: 14px;
      line-height: 1.45;
    }
    a { color: inherit; }
    .shell { padding: 16px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .kicker { color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 22px; line-height: 1.12; }
    h2 { font-size: 16px; line-height: 1.2; }
    h3 { font-size: 14px; line-height: 1.2; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
      min-width: 0;
    }
    .card-body { padding: 12px; display: grid; gap: 8px; }
    .thumb { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--line); display: block; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--fg);
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 650;
      max-width: 100%;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 7px 10px;
      border-radius: 6px;
      background: var(--button);
      color: var(--button-fg);
      text-decoration: none;
      font-weight: 700;
    }
    .button.secondary {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--line);
    }
    .stack { display: grid; gap: 12px; }
    .section { border-top: 1px solid var(--line); padding-top: 12px; display: grid; gap: 6px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .fact { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: var(--panel); }
    .fact span { display: block; color: var(--muted); font-size: 12px; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 20px; color: var(--muted); }
    @media (max-width: 520px) {
      .shell { padding: 12px; }
      .header { display: grid; }
      h1 { font-size: 20px; }
      .grid { grid-template-columns: 1fr; }
      .button { width: 100%; }
    }
  </style>
</head>
<body>
  <main id="app" class="shell"></main>
  <script>
    const KIND = ${JSON.stringify(kind)};
    let state = {};

    function html(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function attr(value) {
      return html(value);
    }

    function ingest(payload) {
      const data = payload?.structuredContent || payload?.toolOutput || payload || {};
      state = data;
      render();
    }

    function postUserMessage(text) {
      const message = {
        jsonrpc: "2.0",
        method: "ui/message",
        params: {
          role: "user",
          content: [{ type: "text", text }]
        }
      };
      window.parent?.postMessage(message, "*");
      const openai = window.openai;
      if (openai?.sendFollowUpMessage) {
        openai.sendFollowUpMessage({ prompt: text }).catch(() => {});
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method === "ui/initialize") ingest(message.params);
      if (message.method === "ui/notifications/tool-result") ingest(message.params);
      if (message.method === "ui/notifications/tool-input") ingest(message.params);
    }, { passive: true });

    if (window.openai?.toolOutput) {
      ingest(window.openai.toolOutput);
    } else {
      render();
    }

    function render() {
      if (KIND === "product-list") return renderProductList();
      if (KIND === "product-detail") return renderProductDetail();
      return renderWhatsNew();
    }

    function renderProductList() {
      const products = state.products || state.data || [];
      const filters = state.filters || {};
      const app = document.getElementById("app");
      if (!products.length) {
        app.innerHTML = '<div class="empty">No products matched this request.</div>';
        return;
      }
      const category = filters.category ? '<span class="chip">' + html(filters.category) + '</span>' : "";
      app.innerHTML = [
        '<div class="header"><div><div class="kicker">Products</div><h1>' + products.length + ' result' + (products.length === 1 ? '' : 's') + '</h1></div><div class="chip-row">' + category + '</div></div>',
        '<div class="grid">',
        products.map((product) => [
          '<article class="card">',
          product.image ? '<img class="thumb" src="' + attr(product.image) + '" alt="">' : '',
          '<div class="card-body">',
          '<div class="chip-row"><span class="chip">' + html(product.category || 'General') + '</span></div>',
          '<h2>' + html(product.title) + '</h2>',
          '<p class="muted">' + html(product.description) + '</p>',
          '<div class="actions">',
          '<a class="button" href="' + attr(product.url) + '" target="_blank" rel="noreferrer">Open</a>',
          '<button class="button secondary" type="button" data-ask="' + attr(product.title) + '">Ask</button>',
          '</div></div></article>'
        ].join('')).join(''),
        '</div>'
      ].join('');
      app.querySelectorAll("button[data-ask]").forEach((button) => {
        button.addEventListener("click", () => postUserMessage("Tell me more about " + button.getAttribute("data-ask")));
      });
    }

    function renderProductDetail() {
      const product = state.product || state;
      const app = document.getElementById("app");
      if (!product || !product.title) {
        app.innerHTML = '<div class="empty">Product details are not available.</div>';
        return;
      }
      const facts = product.facts || [];
      const sections = product.sections || [];
      const links = product.deepLinks || product.ctaLinks || [];
      app.innerHTML = [
        '<div class="stack">',
        product.image ? '<img class="thumb" src="' + attr(product.image) + '" alt="">' : '',
        '<div class="header"><div><div class="kicker">' + html(product.category || 'Product') + '</div><h1>' + html(product.title) + '</h1><p class="muted">' + html(product.description) + '</p></div></div>',
        facts.length ? '<div class="facts">' + facts.map((fact) => '<div class="fact"><span>' + html(fact.label) + '</span><strong>' + html(fact.value) + '</strong></div>').join('') + '</div>' : '',
        links.length ? '<div class="links">' + links.map((link, index) => '<a class="button ' + (index ? 'secondary' : '') + '" href="' + attr(link.url) + '" target="_blank" rel="noreferrer">' + html(link.label) + '</a>').join('') + '</div>' : '',
        sections.map((section) => '<section class="section"><h2>' + html(section.title) + '</h2><p class="muted">' + html(section.text) + '</p></section>').join(''),
        '</div>'
      ].join('');
    }

    function renderWhatsNew() {
      const summary = state.summary || state;
      const app = document.getElementById("app");
      if (!summary || !summary.title) {
        app.innerHTML = '<div class="empty">Homepage summary is not available.</div>';
        return;
      }
      const highlights = summary.highlights || [];
      const sections = summary.sections || [];
      app.innerHTML = [
        '<div class="stack">',
        '<div class="header"><div><div class="kicker">What\\'s new</div><h1>' + html(summary.title) + '</h1><p class="muted">' + html(summary.description) + '</p></div></div>',
        highlights.length ? '<div class="links">' + highlights.map((link) => '<a class="button secondary" href="' + attr(link.url) + '" target="_blank" rel="noreferrer">' + html(link.label) + '</a>').join('') + '</div>' : '',
        sections.map((section) => '<section class="section"><h2>' + html(section.title) + '</h2><p class="muted">' + html(section.text) + '</p></section>').join(''),
        '</div>'
      ].join('');
    }
  </script>
</body>
</html>`;
}
