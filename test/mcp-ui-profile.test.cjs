'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { main: mcpMain } = require('../actions/mcp/index.js')
const {
  LLM_APP_EXPERIENCE_WIDGET_URI,
  LLM_MCP_APPS_EXPERIENCE_WIDGET_URI
} = require('../actions/mcp/chatgpt-webapp-support.js')
const { resolveMcpUiProfile, MCP_APPS_HTML_MIME } = require('../actions/mcp/mcp-ui-profile.js')

function parseJsonBody (r) {
  const b = r.body
  if (typeof b === 'string') {
    return JSON.parse(b.length ? b : '{}')
  }
  return b && typeof b === 'object' ? b : {}
}

function mcpPost (method, params, extra = {}) {
  return mcpMain({
    __ow_method: 'POST',
    __ow_body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: params || {}
    }),
    __ow_headers: {
      host: 'localhost',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    __ow_path: '/v1/mcp',
    BRAND_DISPLAY_NAME: 'TestBrand',
    LOG_LEVEL: 'error',
    ...extra
  })
}

test('resolveMcpUiProfile: explicit MCP_UI_PROFILE', () => {
  assert.equal(resolveMcpUiProfile({ MCP_UI_PROFILE: 'mcp_apps' }), 'mcp_apps')
  assert.equal(resolveMcpUiProfile({ MCP_UI_PROFILE: 'markdown' }), 'markdown')
  assert.equal(resolveMcpUiProfile({ MCP_UI_PROFILE: 'OpenAI' }), 'openai')
})

test('resolveMcpUiProfile: DISABLE_OPENAI_WIDGET maps to markdown only', () => {
  assert.equal(resolveMcpUiProfile({ DISABLE_OPENAI_WIDGET: 'true' }), 'markdown')
  assert.equal(resolveMcpUiProfile({ DISABLE_OPENAI_WIDGET: '1' }), 'markdown')
  assert.equal(resolveMcpUiProfile({ DISABLE_OPENAI_WIDGET: true }), 'markdown')
})

test('resolveMcpUiProfile: MCP_UI_PROFILE wins over DISABLE_OPENAI_WIDGET', () => {
  assert.equal(
    resolveMcpUiProfile({ MCP_UI_PROFILE: 'mcp_apps', DISABLE_OPENAI_WIDGET: 'true' }),
    'mcp_apps'
  )
})

test('resolveMcpUiProfile: MCP_UI_PROFILE from __ow_query only (gateway web action shape)', () => {
  assert.equal(resolveMcpUiProfile({ __ow_query: 'MCP_UI_PROFILE=markdown' }), 'markdown')
  assert.equal(resolveMcpUiProfile({ __ow_query: 'foo=1&MCP_UI_PROFILE=mcp_apps&bar=2' }), 'mcp_apps')
})

test('resolveMcpUiProfile: MCP_UI_PROFILE from x-mcp-ui-profile header', () => {
  assert.equal(
    resolveMcpUiProfile({
      __ow_headers: { 'x-mcp-ui-profile': 'markdown' }
    }),
    'markdown'
  )
})

test('resolveMcpUiProfile: top-level param wins over __ow_query', () => {
  assert.equal(
    resolveMcpUiProfile({ MCP_UI_PROFILE: 'openai', __ow_query: 'MCP_UI_PROFILE=markdown' }),
    'openai'
  )
})

test('tools/list markdown when only __ow_query sets MCP_UI_PROFILE', async () => {
  const r = await mcpPost('tools/list', {}, { __ow_query: 'MCP_UI_PROFILE=markdown' })
  assert.equal(r.statusCode, 200)
  const j = parseJsonBody(r)
  const tool = j.result.tools.find((t) => t.name === 'recommend')
  assert.ok(tool)
  assert.equal(tool._meta, undefined)
})

test('tools/list openai profile includes OpenAI widget metadata on recommend', async () => {
  const r = await mcpPost('tools/list', {}, { MCP_UI_PROFILE: 'openai' })
  assert.equal(r.statusCode, 200)
  const j = parseJsonBody(r)
  const tool = j.result.tools.find((t) => t.name === 'recommend')
  assert.ok(tool, 'recommend missing')
  assert.equal(tool._meta?.ui?.resourceUri, LLM_APP_EXPERIENCE_WIDGET_URI)
  assert.equal(tool._meta?.['openai/outputTemplate'], LLM_APP_EXPERIENCE_WIDGET_URI)
})

test('tools/list markdown profile omits _meta on recommend', async () => {
  const r = await mcpPost('tools/list', {}, { MCP_UI_PROFILE: 'markdown' })
  assert.equal(r.statusCode, 200)
  const j = parseJsonBody(r)
  const tool = j.result.tools.find((t) => t.name === 'recommend')
  assert.ok(tool)
  assert.equal(tool._meta, undefined)
})

test('tools/list mcp_apps profile uses MCP Apps URI and CSP without openai keys', async () => {
  const r = await mcpPost('tools/list', {}, { MCP_UI_PROFILE: 'mcp_apps' })
  assert.equal(r.statusCode, 200)
  const j = parseJsonBody(r)
  const tool = j.result.tools.find((t) => t.name === 'recommend')
  assert.ok(tool)
  assert.equal(tool._meta?.ui?.resourceUri, LLM_MCP_APPS_EXPERIENCE_WIDGET_URI)
  assert.ok(Array.isArray(tool._meta?.ui?.csp?.connectDomains))
  assert.ok(tool._meta.ui.csp.connectDomains.includes('https://cdn.jsdelivr.net'))
  assert.equal(tool._meta['openai/outputTemplate'], undefined)
})

test('resources/list: openai registers OpenAI widget only', async () => {
  const r = await mcpPost('resources/list', {}, { MCP_UI_PROFILE: 'openai' })
  const j = parseJsonBody(r)
  const uris = (j.result.resources || []).map((x) => x.uri)
  assert.ok(uris.includes(LLM_APP_EXPERIENCE_WIDGET_URI))
  assert.equal(uris.includes(LLM_MCP_APPS_EXPERIENCE_WIDGET_URI), false)
})

test('resources/list: markdown registers no ui:// widget', async () => {
  const r = await mcpPost('resources/list', {}, { MCP_UI_PROFILE: 'markdown' })
  const j = parseJsonBody(r)
  const uris = (j.result.resources || []).map((x) => x.uri)
  assert.equal(uris.includes(LLM_APP_EXPERIENCE_WIDGET_URI), false)
  assert.equal(uris.includes(LLM_MCP_APPS_EXPERIENCE_WIDGET_URI), false)
})

test('resources/list: mcp_apps registers MCP Apps widget only', async () => {
  const r = await mcpPost('resources/list', {}, { MCP_UI_PROFILE: 'mcp_apps' })
  const j = parseJsonBody(r)
  const uris = (j.result.resources || []).map((x) => x.uri)
  assert.ok(uris.includes(LLM_MCP_APPS_EXPERIENCE_WIDGET_URI))
  assert.equal(uris.includes(LLM_APP_EXPERIENCE_WIDGET_URI), false)
})

test('resources/read mcp_apps: MIME profile=mcp-app and no openai resource _meta', async () => {
  const r = await mcpPost(
    'resources/read',
    { uri: LLM_MCP_APPS_EXPERIENCE_WIDGET_URI },
    { MCP_UI_PROFILE: 'mcp_apps' }
  )
  const j = parseJsonBody(r)
  const c = j.result.contents[0]
  assert.equal(c.mimeType, MCP_APPS_HTML_MIME)
  assert.equal(c._meta?.['openai/widgetPrefersBorder'], undefined)
  assert.ok(c.text.includes('@modelcontextprotocol/ext-apps'))
  assert.ok(c.text.includes('import { App }'))
})
