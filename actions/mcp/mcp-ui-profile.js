'use strict'

/**
 * MCP host UI profile: OpenAI Apps SDK widget vs standard MCP Apps (Claude) vs markdown-only.
 *
 * Resolution order (first win): activation **`params.MCP_UI_PROFILE`**, raw query **`__ow_query`**
 * (`?MCP_UI_PROFILE=markdown` on the MCP URL), headers **`x-mcp-ui-profile`** / **`mcp-ui-profile`**,
 * then **`process.env`** (App Builder `inputs` / secrets). Same pattern for **`DISABLE_OPENAI_WIDGET`**
 * (headers **`x-disable-openai-widget`**).
 */

/** @typedef {'openai' | 'mcp_apps' | 'markdown'} McpUiProfile */

const MCP_APPS_HTML_MIME = 'text/html;profile=mcp-app'

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function truthyFlag (raw) {
  if (raw === true) return true
  if (typeof raw !== 'string') return false
  const t = raw.trim().toLowerCase()
  return t === '1' || t === 'true' || t === 'yes'
}

/**
 * @param {object} [params]
 * @param {string} key
 * @returns {string|undefined}
 */
function pickFromQueryString (params, key) {
  const raw = params && params.__ow_query
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  try {
    const q = raw.trim().startsWith('?') ? raw.trim().slice(1) : raw.trim()
    const v = new URLSearchParams(q).get(key)
    return v != null && String(v).trim() !== '' ? String(v).trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * @param {object} [params]
 * @param {string[]} headerNames
 * @returns {string|undefined}
 */
function pickFromHeaders (params, headerNames) {
  const h = params && params.__ow_headers
  if (!h || typeof h !== 'object') return undefined
  for (const name of headerNames) {
    const lower = name.toLowerCase()
    const v = h[lower] ?? h[name]
    if (v === undefined || v === null) continue
    const s = Array.isArray(v) ? v[0] : v
    if (typeof s === 'string' && s.trim()) return s.trim()
  }
  return undefined
}

/**
 * @param {object} [params]
 * @param {string} key
 * @param {string[]} [headerNames]
 * @returns {unknown}
 */
function pickRequestOrEnv (params, key, headerNames = []) {
  if (params && Object.prototype.hasOwnProperty.call(params, key)) {
    const v = params[key]
    if (v !== undefined && v !== null && v !== '') return v
  }
  const fromQuery = pickFromQueryString(params, key)
  if (fromQuery !== undefined) return fromQuery
  if (headerNames.length) {
    const fromHdr = pickFromHeaders(params, headerNames)
    if (fromHdr !== undefined) return fromHdr
  }
  return process.env[key]
}

/**
 * @param {object} [params]
 * @returns {McpUiProfile}
 */
function resolveMcpUiProfile (params = {}) {
  const raw = pickRequestOrEnv(params, 'MCP_UI_PROFILE', ['x-mcp-ui-profile', 'mcp-ui-profile'])
  if (typeof raw === 'string' && raw.trim()) {
    const n = raw.trim().toLowerCase().replace(/-/g, '_')
    if (n === 'mcp_apps' || n === 'mcpapps' || n === 'apps' || n === 'claude') return 'mcp_apps'
    if (n === 'markdown' || n === 'none' || n === 'off' || n === 'text') return 'markdown'
    if (n === 'openai' || n === 'chatgpt') return 'openai'
  }
  if (truthyFlag(pickRequestOrEnv(params, 'DISABLE_OPENAI_WIDGET', ['x-disable-openai-widget']))) {
    return 'markdown'
  }
  return 'openai'
}

module.exports = {
  resolveMcpUiProfile,
  MCP_APPS_HTML_MIME
}
