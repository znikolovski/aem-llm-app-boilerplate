/*
 * ChatGPT / MCP Apps: associate boilerplate tools with an HTML widget and webapp tool-invocation hints.
 * @see https://developers.openai.com/apps-sdk/reference/
 */

'use strict'

const resolveWebBase = require('./resolve-web-base.js')
const { zodToJsonSchema } = require('zod-to-json-schema')
const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')

const LLM_APP_EXPERIENCE_WIDGET_URI = 'ui://widget/llm-app-experience.html'

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
 * ChatGPT needs `_meta.ui.resourceUri` on the tool descriptor to mount the widget.
 * @param {any} mcpServer - McpServer instance
 */
function patchToolsListForLlmAppWebapp (mcpServer) {
  const proto = mcpServer.server
  proto.removeRequestHandler('tools/list')
  proto.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(mcpServer._registeredTools)
      .filter(([, t]) => t.enabled)
      .map(([name, tool]) => {
        const def = toolDescriptorFromRegistered(name, tool)
        const w = WEBAPP_TOOL_STATUS[name]
        if (w) {
          def._meta = {
            ui: { resourceUri: LLM_APP_EXPERIENCE_WIDGET_URI },
            'openai/outputTemplate': LLM_APP_EXPERIENCE_WIDGET_URI,
            'openai/toolInvocation/invoking': w.invoking,
            'openai/toolInvocation/invoked': w.invoked
          }
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
      let domains = []
      try {
        domains = typeof resolveFrameDomains === 'function' ? resolveFrameDomains(runtimeParams) : []
      } catch {
        domains = []
      }
      if (!Array.isArray(domains) || !domains.length) {
        domains = [
          'http://localhost:9080',
          'https://localhost:9080',
          'http://127.0.0.1:9080',
          'https://127.0.0.1:9080',
          'http://localhost:9090',
          'https://localhost:9090',
          'http://127.0.0.1:9090',
          'https://127.0.0.1:9090'
        ]
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
                  frameDomains: domains
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

module.exports = {
  LLM_APP_EXPERIENCE_WIDGET_URI,
  mergeOpenAiWebappResultMeta,
  patchToolsListForLlmAppWebapp,
  registerLlmAppExperienceWidgetResource
}
