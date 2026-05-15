/*
 * ChatGPT OpenAI Apps SDK widget + standard MCP Apps (e.g. Claude) experience shell.
 * @see https://developers.openai.com/apps-sdk/reference/
 * @see https://modelcontextprotocol.io/docs/extensions/apps.md
 */

'use strict'

const resolveWebBase = require('./resolve-web-base.js')
const { zodToJsonSchema } = require('zod-to-json-schema')
const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const { resolveMcpUiProfile, MCP_APPS_HTML_MIME } = require('./mcp-ui-profile.js')

const LLM_APP_EXPERIENCE_WIDGET_URI = 'ui://widget/llm-app-experience.html'
/** MCP Apps profile: `text/html;profile=mcp-app` resource URI (not OpenAI-specific). */
const LLM_MCP_APPS_EXPERIENCE_WIDGET_URI = 'ui://widget/llm-app-mcp-app.html'

/** Pinned ESM entry for @modelcontextprotocol/ext-apps (iframe; host CSP must allow this origin). */
const MCP_APPS_EXT_APPS_ESM = 'https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@1.7.1/+esm'

const EMPTY_OBJECT_JSON_SCHEMA = {
  type: 'object',
  properties: {}
}

const WEBAPP_TOOL_STATUS = {
  recommend: {
    invoking: 'Loading recommendations…',
    invoked: 'Recommendations ready'
  },
  spotlight: {
    invoking: 'Loading spotlight…',
    invoked: 'Spotlight ready'
  }
}

const DEFAULT_LOCAL_FRAME_ORIGINS = [
  'http://localhost:9080',
  'https://localhost:9080',
  'http://127.0.0.1:9080',
  'https://127.0.0.1:9080',
  'http://localhost:9090',
  'https://localhost:9090',
  'http://127.0.0.1:9090',
  'https://127.0.0.1:9090'
]

/** Origins the MCP App iframe may import scripts from (ext-apps ESM bundle). */
const MCP_APPS_SCRIPT_ORIGINS = ['https://cdn.jsdelivr.net']

/**
 * @param {string} [experienceUrl]
 * @param {string} [spaToolPath]
 * @returns {Record<string, unknown>}
 */
function mergeOpenAiWebappResultMeta (experienceUrl, spaToolPath) {
  if (!experienceUrl) return {}
  const inv = {
    type: 'webapp',
    experienceUrl,
    method: 'GET'
  }
  if (spaToolPath) inv.spaToolPath = spaToolPath
  return { 'openai/toolInvocation': inv }
}

/**
 * @param {object} runtimeParams
 * @param {(p?: object) => string[]} resolveFrameDomains
 * @returns {{ connectDomains: string[], resourceDomains: string[], frameDomains: string[] }}
 */
function computeExperienceWidgetCsp (runtimeParams, resolveFrameDomains) {
  let domains = []
  try {
    domains = typeof resolveFrameDomains === 'function' ? resolveFrameDomains(runtimeParams) : []
  } catch {
    domains = []
  }
  if (!Array.isArray(domains) || !domains.length) {
    domains = [...DEFAULT_LOCAL_FRAME_ORIGINS]
  }
  let apiOrigins = []
  try {
    const client = resolveWebBase.resolveLlmClientWebBase(runtimeParams).trim().replace(/\/$/, '')
    if (client) {
      const u = new URL(/^https?:\/\//i.test(client) ? client : `https://${client}`)
      apiOrigins.push(u.origin)
    }
  } catch {
    apiOrigins = []
  }
  const connectDomains = [...new Set([...domains, ...apiOrigins].filter(Boolean))]
  const resourceDomains = [...new Set([...domains, ...apiOrigins].filter(Boolean))]
  return { connectDomains, resourceDomains, frameDomains: domains }
}

function buildExperienceEmbedWidgetHtml () {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>App experience</title>
<style>
html,body{margin:0;height:100%;background:#0b0b0c;}
#iframe{position:fixed;inset:0;width:100%;height:100%;border:0;}
#pending{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:14px/1.4 system-ui,sans-serif;color:#e8e8ea;background:#0b0b0c;}
</style>
</head>
<body>
<div id="pending" role="status">Loading experience…</div>
<iframe id="iframe" title="Experience" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style="display:none"></iframe>
<script>
(function () {
  var iframe = document.getElementById('iframe');
  var pending = document.getElementById('pending');
  function showFrame() {
    if (pending) pending.style.display = 'none';
    if (iframe) iframe.style.display = 'block';
  }
  function applyUrl(url) {
    if (!url || !iframe) return;
    iframe.src = url;
    showFrame();
  }
  var o = typeof window !== 'undefined' ? window.openai : undefined;
  function fromOutput() {
    try {
      var out = o && o.toolOutput;
      if (out && typeof out.experienceUrl === 'string' && out.experienceUrl) return out.experienceUrl;
    } catch (e) {}
    return '';
  }
  function fromMeta() {
    try {
      var m = o && o.toolResponseMetadata;
      var inv = m && m['openai/toolInvocation'];
      if (inv && typeof inv.experienceUrl === 'string') return inv.experienceUrl;
    } catch (e) {}
    return '';
  }
  var url = fromOutput() || fromMeta();
  if (url) applyUrl(url);
  if (typeof window !== 'undefined') {
    window.addEventListener('openai:set_globals', function () {
      var next = fromOutput() || fromMeta();
      if (next && iframe && iframe.src !== next) applyUrl(next);
    });
  }
})();
</script>
</body>
</html>`.trim()
}

/**
 * Standard MCP Apps HTML: App from ext-apps + iframe to `experienceUrl` from tool results.
 */
function buildMcpAppsExperienceEmbedHtml () {
  const extImport = JSON.stringify(MCP_APPS_EXT_APPS_ESM)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>App experience</title>
<style>
html,body{margin:0;height:100%;background:#0b0b0c;}
#iframe{position:fixed;inset:0;width:100%;height:100%;border:0;}
#pending{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:14px/1.4 system-ui,sans-serif;color:#e8e8ea;background:#0b0b0c;}
</style>
</head>
<body>
<div id="pending" role="status">Loading experience…</div>
<iframe id="iframe" title="Experience" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style="display:none"></iframe>
<script type="module">
import { App } from ${extImport};
var iframe = document.getElementById('iframe');
var pending = document.getElementById('pending');
function showFrame() {
  if (pending) pending.style.display = 'none';
  if (iframe) iframe.style.display = 'block';
}
function applyUrl(url) {
  if (!url || !iframe) return;
  iframe.src = url;
  showFrame();
}
function experienceUrlFromToolResult(params) {
  if (!params || params.isError) return '';
  var sc = params.structuredContent;
  if (sc && typeof sc.experienceUrl === 'string' && sc.experienceUrl) return sc.experienceUrl;
  try {
    var meta = params._meta;
    if (meta && typeof meta.experienceUrl === 'string' && meta.experienceUrl) return meta.experienceUrl;
  } catch (e) {}
  return '';
}
var app = new App({ name: 'llm-app-mcp-app', version: '0.1.0' }, {}, { autoResize: true });
app.ontoolresult = function (params) {
  var url = experienceUrlFromToolResult(params);
  if (url) applyUrl(url);
};
await app.connect();
</script>
</body>
</html>`.trim()
}

function toolDescriptorFromRegistered (name, tool) {
  const toolDefinition = {
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema
      ? zodToJsonSchema(tool.inputSchema, { strictUnions: true })
      : EMPTY_OBJECT_JSON_SCHEMA,
    annotations: tool.annotations
  }
  if (tool.outputSchema) {
    toolDefinition.outputSchema = zodToJsonSchema(tool.outputSchema, { strictUnions: true })
  }
  return toolDefinition
}

/**
 * ChatGPT: `_meta.ui.resourceUri` + OpenAI keys. MCP Apps: `_meta.ui` + standard resource URI (no `openai/*`).
 * @param {any} mcpServer - McpServer instance
 * @param {object} [params]
 * @param {(p?: object) => string[]} resolveFrameDomains
 */
function patchToolsListForLlmAppWebapp (mcpServer, params = {}, resolveFrameDomains) {
  const proto = mcpServer.server
  const profile = resolveMcpUiProfile(params)
  proto.removeRequestHandler('tools/list')
  proto.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(mcpServer._registeredTools)
      .filter(([, t]) => t.enabled)
      .map(([name, tool]) => {
        const def = toolDescriptorFromRegistered(name, tool)
        const w = WEBAPP_TOOL_STATUS[name]
        if (!w) return def

        if (profile === 'markdown') {
          return def
        }

        const csp = computeExperienceWidgetCsp(params, resolveFrameDomains)
        if (profile === 'mcp_apps') {
          const connectDomains = [...new Set([...csp.connectDomains, ...MCP_APPS_SCRIPT_ORIGINS])]
          const resourceDomains = [...new Set([...csp.resourceDomains, ...MCP_APPS_SCRIPT_ORIGINS])]
          def._meta = {
            ui: {
              resourceUri: LLM_MCP_APPS_EXPERIENCE_WIDGET_URI,
              csp: {
                connectDomains,
                resourceDomains,
                frameDomains: csp.frameDomains
              }
            }
          }
          return def
        }

        def._meta = {
          ui: { resourceUri: LLM_APP_EXPERIENCE_WIDGET_URI },
          'openai/outputTemplate': LLM_APP_EXPERIENCE_WIDGET_URI,
          'openai/toolInvocation/invoking': w.invoking,
          'openai/toolInvocation/invoked': w.invoked
        }
        return def
      })
  }))
}

/**
 * @param {any} server - McpServer instance
 * @param {object} runtimeParams - Adobe I/O activation params
 * @param {(p?: object) => string[]} resolveFrameDomains
 */
function registerLlmAppExperienceWidgetResource (server, runtimeParams, resolveFrameDomains) {
  const resourceMeta = {
    name: 'LLM App Builder experience shell',
    description: 'Embeds the branded web-src tool route; reads experienceUrl from tool structured output / metadata.',
    mimeType: 'text/html'
  }
  server.resource(
    'llm-app-experience-widget',
    LLM_APP_EXPERIENCE_WIDGET_URI,
    resourceMeta,
    async () => {
      const { connectDomains, resourceDomains, frameDomains } = computeExperienceWidgetCsp(
        runtimeParams,
        resolveFrameDomains
      )
      const html = buildExperienceEmbedWidgetHtml()
      return {
        contents: [
          {
            uri: LLM_APP_EXPERIENCE_WIDGET_URI,
            mimeType: 'text/html',
            text: html,
            _meta: {
              ui: {
                prefersBorder: true,
                csp: {
                  connectDomains,
                  resourceDomains,
                  frameDomains
                }
              },
              'openai/widgetPrefersBorder': true,
              'openai/widgetDescription':
                'Branded App Builder experience. The iframe URL comes from tool output (experienceUrl).'
            }
          }
        ]
      }
    }
  )
}

/**
 * Standard MCP Apps resource (no `openai/*` keys on the resource).
 * @param {any} server
 * @param {object} runtimeParams
 * @param {(p?: object) => string[]} resolveFrameDomains
 */
function registerMcpAppsExperienceWidgetResource (server, runtimeParams, resolveFrameDomains) {
  const resourceMeta = {
    name: 'LLM App MCP Apps experience shell',
    description: 'MCP Apps iframe shell; reads experienceUrl from tool structuredContent / _meta.',
    mimeType: MCP_APPS_HTML_MIME
  }
  server.resource(
    'llm-app-mcp-app-experience-widget',
    LLM_MCP_APPS_EXPERIENCE_WIDGET_URI,
    resourceMeta,
    async () => {
      const base = computeExperienceWidgetCsp(runtimeParams, resolveFrameDomains)
      const connectDomains = [...new Set([...base.connectDomains, ...MCP_APPS_SCRIPT_ORIGINS])]
      const resourceDomains = [...new Set([...base.resourceDomains, ...MCP_APPS_SCRIPT_ORIGINS])]
      const html = buildMcpAppsExperienceEmbedHtml()
      return {
        contents: [
          {
            uri: LLM_MCP_APPS_EXPERIENCE_WIDGET_URI,
            mimeType: MCP_APPS_HTML_MIME,
            text: html,
            _meta: {
              ui: {
                csp: {
                  connectDomains,
                  resourceDomains,
                  frameDomains: base.frameDomains
                }
              }
            }
          }
        ]
      }
    }
  )
}

/**
 * @param {any} server
 * @param {object} runtimeParams
 * @param {(p?: object) => string[]} resolveFrameDomains
 * @param {'openai'|'mcp_apps'|'markdown'} profile
 */
function registerExperienceWidgetsForProfile (server, runtimeParams, resolveFrameDomains, profile) {
  const p = profile || resolveMcpUiProfile(runtimeParams)
  if (p === 'openai') {
    registerLlmAppExperienceWidgetResource(server, runtimeParams, resolveFrameDomains)
  } else if (p === 'mcp_apps') {
    registerMcpAppsExperienceWidgetResource(server, runtimeParams, resolveFrameDomains)
  }
}

module.exports = {
  LLM_APP_EXPERIENCE_WIDGET_URI,
  LLM_MCP_APPS_EXPERIENCE_WIDGET_URI,
  MCP_APPS_EXT_APPS_ESM,
  mergeOpenAiWebappResultMeta,
  patchToolsListForLlmAppWebapp,
  registerLlmAppExperienceWidgetResource,
  registerMcpAppsExperienceWidgetResource,
  registerExperienceWidgetsForProfile,
  computeExperienceWidgetCsp
}
