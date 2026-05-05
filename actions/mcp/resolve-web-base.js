'use strict'

const experienceRoutes = require('./experience-routes.json')

function pickParamOrEnv (params, key) {
  const v = params[key] ?? process.env[key]
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

function pickEnv (key) {
  const v = process.env[key]
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/** e.g. adobeioruntime.net → https://adobeioruntime.net */
function normalizeOpenWhiskApiOrigin (raw) {
  if (!raw) return ''
  const t = raw.replace(/\/$/, '')
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

/**
 * From the incoming web activation: .../api/v1/web/<ns>/<pkg>/<action> → base through <pkg>/.
 * Works for aio app dev (localhost) and many deployed gateways that preserve this path shape.
 */
function baseFromActivationRequest (params = {}) {
  const pathRaw = params.__ow_path || params.__OW_PATH || ''
  const path = (typeof pathRaw === 'string' ? pathRaw : '').split('?')[0]
  const headers = params.__ow_headers || params.__OW_HEADERS || {}
  const hostCombined =
    headers['x-forwarded-host'] ||
    headers['X-Forwarded-Host'] ||
    headers.host ||
    headers.Host ||
    ''
  const host = String(Array.isArray(hostCombined) ? hostCombined[0] : hostCombined)
    .split(',')[0]
    .trim()
  if (!path || !host) return ''

  const m = path.match(/^(.*\/api\/v1\/web\/[^/]+\/[^/]+)\/[^/]+$/)
  if (!m) return ''

  const protoHeader = String(
    headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase()
  let scheme = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : ''
  if (!scheme) {
    scheme = /^localhost(?::|$)|^127\./i.test(host) ? 'http' : 'https'
  }

  return `${scheme}://${host}${m[1]}/`
}

function parseNsPkgFromOwActionName (nameRaw) {
  const name = String(nameRaw || '').replace(/^\//, '')
  const parts = name.split('/').filter(Boolean)
  if (parts.length >= 3) {
    return { ns: parts[0], pkg: parts[1] }
  }
  return null
}

/**
 * Adobe I/O Runtime sets __OW_ACTION_NAME (often /ns/pkg/action when deployed) and __OW_API_HOST.
 */
function baseFromOpenWhiskEnv () {
  const origin = normalizeOpenWhiskApiOrigin(
    pickEnv('__OW_API_HOST') || pickEnv('AIO_runtime_apihost')
  )
  if (!origin) return ''

  const rawName = pickEnv('__OW_ACTION_NAME')
  const parts = rawName.replace(/^\//, '').split('/').filter(Boolean)
  let ns
  let pkg

  const parsed = parseNsPkgFromOwActionName(rawName)
  if (parsed) {
    ns = parsed.ns
    pkg = parsed.pkg
  } else if (parts.length === 1) {
    ns = pickEnv('__OW_NAMESPACE').replace(/^\//, '') || pickEnv('AIO_runtime_namespace')
    pkg = pickEnv('LLM_APP_OW_PACKAGE')
    if (!ns || !pkg) return ''
  } else {
    return ''
  }

  return `${origin}/api/v1/web/${ns}/${pkg}/`
}

/**
 * Base URL for sibling web actions (trailing slash).
 */
function resolveLlmAppWebBase (params = {}) {
  let base =
    pickParamOrEnv(params, 'LLM_APP_BASE_URL') ||
    pickParamOrEnv(params, '__LLM_APP_BASE_URL')
  if (base) {
    return base.replace(/\/$/, '') + '/'
  }

  base = baseFromActivationRequest(params)
  if (base) return base

  base = baseFromOpenWhiskEnv()
  if (base) return base

  const apihost = pickParamOrEnv(params, 'AIO_runtime_apihost')
  const ns = pickParamOrEnv(params, 'AIO_runtime_namespace')
  const pkg = pickParamOrEnv(params, 'LLM_APP_OW_PACKAGE')
  if (apihost && ns && pkg) {
    return `${normalizeOpenWhiskApiOrigin(apihost)}/api/v1/web/${ns}/${pkg}/`
  }
  return ''
}

/** Case-insensitive header read (OpenWhisk may send mixed-case keys). */
function readHeaderCi (headers, name) {
  if (!headers || typeof headers !== 'object') return ''
  const want = String(name).toLowerCase()
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === want) {
      const v = headers[k]
      return String(Array.isArray(v) ? v[0] : v)
    }
  }
  return ''
}

/**
 * Public browser-facing origin from this request’s Host / X-Forwarded-* (what ChatGPT / the gateway
 * used). Does not depend on __ow_path. Use when __OW_API_HOST is an internal Adobe facade host.
 */
function originFromForwardedRequestHeaders (params = {}) {
  const headers = params.__ow_headers || params.__OW_HEADERS || {}
  const hostCombined =
    readHeaderCi(headers, 'x-forwarded-host') ||
    readHeaderCi(headers, 'host') ||
    readHeaderCi(headers, 'Host')
  const host = String(hostCombined || '')
    .split(',')[0]
    .trim()
  if (!host) return ''

  const protoHeader = readHeaderCi(headers, 'x-forwarded-proto').split(',')[0].trim().toLowerCase()
  let scheme = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : ''
  if (!scheme) {
    scheme = /^localhost(?::|$)|^127\./i.test(host) ? 'http' : 'https'
  }
  try {
    return new URL(`${scheme}://${host}`).origin
  } catch {
    return ''
  }
}

/**
 * Public SPA root (scheme + host, no path). Must match the URL clients use to reach your app — not
 * the internal `__OW_API_HOST` runtime facade. Precedence:
 * 1) LLM_EXPERIENCE_ORIGIN (first comma-separated entry; normalized to origin when URL-shaped)
 * 2) Origin of LLM_APP_BASE_URL (public deploy URL)
 * 3) Origin from X-Forwarded-Host / Host on the incoming MCP request
 * 4) Origin from this activation’s __ow_path + Host (see baseFromActivationRequest)
 * 5) Any other non-internal origin from the same sources as {@link resolveLlmPublicWebActionOrigin}
 *    (e.g. later comma entries in LLM_EXPERIENCE_ORIGIN)
 * 6) Origin of resolveLlmAppWebBase() only if not an internal Adobe gateway host — otherwise ''
 */
function resolveLlmExperienceOrigin (params = {}) {
  const explicitRaw = pickParamOrEnv(params, 'LLM_EXPERIENCE_ORIGIN')
  if (explicitRaw) {
    const first = explicitRaw.split(',')[0].trim().replace(/\/$/, '')
    if (first) {
      try {
        return new URL(first).origin
      } catch {
        return first
      }
    }
  }

  const fromBaseUrl = pickParamOrEnv(params, 'LLM_APP_BASE_URL') || pickParamOrEnv(params, '__LLM_APP_BASE_URL')
  if (fromBaseUrl) {
    try {
      const o = new URL(fromBaseUrl.replace(/\/$/, '')).origin
      if (!isInternalAdobeIoruntimeFacadeHost(new URL(o).hostname)) {
        return o
      }
    } catch {
      /* fall through */
    }
  }

  const fromForwarded = originFromForwardedRequestHeaders(params)
  if (fromForwarded) {
    try {
      if (!isInternalAdobeIoruntimeFacadeHost(new URL(fromForwarded).hostname)) {
        return fromForwarded
      }
    } catch {
      /* fall through */
    }
  }

  const fromActivation = baseFromActivationRequest(params)
  if (fromActivation) {
    try {
      const o = new URL(fromActivation)
      if (!isInternalAdobeIoruntimeFacadeHost(o.hostname)) {
        return o.origin
      }
    } catch {
      /* fall through */
    }
  }

  const pub = resolveLlmPublicWebActionOrigin(params)
  if (pub) return pub

  const apiBase = resolveLlmAppWebBase(params)
  if (!apiBase) return ''
  try {
    const o = new URL(apiBase)
    if (isInternalAdobeIoruntimeFacadeHost(o.hostname)) return ''
    return o.origin
  } catch {
    return ''
  }
}

/**
 * Adobe may expose sibling actions via an internal gateway hostname (__OW_API_HOST) such as
 * *.ethos.adobe.net. That host cannot be iframe'd by ChatGPT; the real SPA lives on the public
 * workspace URL (*.adobeioruntime.net). Never put internal facades in widget CSP frameDomains.
 */
function isInternalAdobeIoruntimeFacadeHost (hostname) {
  const h = String(hostname || '').toLowerCase()
  if (!h) return false
  if (h.endsWith('.ethos.adobe.net')) return true
  if (h.includes('.int.ethos') && h.includes('adobe')) return true
  if (h.includes('controller-gw-') && h.includes('ioruntime')) return true
  if (h.includes('delivery-facade') && h.includes('adobe')) return true
  if (h.includes('ioruntime-prd-delivery')) return true
  return false
}

/**
 * Origin clients should use for /api/v1/web/... (ChatGPT, browsers). Never the internal
 * __OW_API_HOST gateway. Same sources as the SPA, with adobeioruntime.net preferred over
 * adobeio-static when both are listed in LLM_EXPERIENCE_ORIGIN (static often does not host web actions).
 */
function resolveLlmPublicWebActionOrigin (params = {}) {
  const expRaw = pickParamOrEnv(params, 'LLM_EXPERIENCE_ORIGIN')
  if (expRaw) {
    const parts = expRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const preferRuntime = parts.find((p) => /adobeioruntime\.net/i.test(p))
    const ordered = preferRuntime
      ? [preferRuntime, ...parts.filter((p) => p !== preferRuntime)]
      : parts
    for (const part of ordered) {
      try {
        const origin = new URL(part.replace(/\/$/, '')).origin
        if (!isInternalAdobeIoruntimeFacadeHost(new URL(origin).hostname)) {
          return origin
        }
      } catch {
        /* next */
      }
    }
  }

  const fromBaseUrl = pickParamOrEnv(params, 'LLM_APP_BASE_URL') || pickParamOrEnv(params, '__LLM_APP_BASE_URL')
  if (fromBaseUrl) {
    try {
      const o = new URL(fromBaseUrl.replace(/\/$/, '')).origin
      if (!isInternalAdobeIoruntimeFacadeHost(new URL(o).hostname)) {
        return o
      }
    } catch {
      /* fall through */
    }
  }

  const fromForwarded = originFromForwardedRequestHeaders(params)
  if (fromForwarded) {
    try {
      if (!isInternalAdobeIoruntimeFacadeHost(new URL(fromForwarded).hostname)) {
        return fromForwarded
      }
    } catch {
      /* fall through */
    }
  }

  const fromActivation = baseFromActivationRequest(params)
  if (fromActivation) {
    try {
      const o = new URL(fromActivation).origin
      if (!isInternalAdobeIoruntimeFacadeHost(o.hostname)) {
        return o
      }
    } catch {
      /* fall through */
    }
  }

  return ''
}

/**
 * Public base URL for web actions (trailing slash) — used in MCP metadata (`recommendHttpPostUrl`,
 * `spotlightHttpPostUrl`). Rewrites internal Adobe gateway hosts to {@link resolveLlmPublicWebActionOrigin}.
 * Server-side `fetch` from the action should keep using {@link resolveLlmAppWebBase}.
 */
function resolveLlmClientWebBase (params = {}) {
  const explicit = pickParamOrEnv(params, 'LLM_APP_BASE_URL') || pickParamOrEnv(params, '__LLM_APP_BASE_URL')
  if (explicit) {
    return explicit.replace(/\/$/, '') + '/'
  }

  const raw = resolveLlmAppWebBase(params)
  if (!raw) return ''

  let u
  try {
    u = new URL(raw)
  } catch {
    return raw.endsWith('/') ? raw : `${raw}/`
  }

  if (!isInternalAdobeIoruntimeFacadeHost(u.hostname)) {
    return raw.replace(/\/$/, '') + '/'
  }

  const publicOrigin = resolveLlmPublicWebActionOrigin(params)
  if (!publicOrigin) {
    return raw.replace(/\/$/, '') + '/'
  }

  const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`
  return `${publicOrigin.replace(/\/$/, '')}${path}`.replace(/\/$/, '') + '/'
}

/**
 * Origins ChatGPT may load inside the experience widget iframe (`_meta.ui.csp.frameDomains`).
 * Never includes internal Adobe I/O API gateway hosts — only public origins (SPA / LLM_APP_BASE_URL /
 * X-Forwarded-Host / LLM_CHATGPT_FRAME_DOMAINS).
 */
function resolveChatgptFrameDomains (params = {}) {
  const origins = new Set()
  const addOrigin = (raw) => {
    if (!raw || typeof raw !== 'string') return
    const t = raw.trim()
    if (!t) return
    try {
      const o = /^https?:\/\//i.test(t) ? t : `https://${t}`
      const url = new URL(o)
      if (isInternalAdobeIoruntimeFacadeHost(url.hostname)) return
      origins.add(url.origin)
    } catch {
      /* ignore */
    }
  }

  const experienceOriginsRaw = pickParamOrEnv(params, 'LLM_EXPERIENCE_ORIGIN')
  if (experienceOriginsRaw) {
    for (const part of experienceOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      addOrigin(part)
    }
  }

  addOrigin(resolveLlmExperienceOrigin(params))
  addOrigin(originFromForwardedRequestHeaders(params))

  const apiBase = resolveLlmAppWebBase(params)
  if (apiBase) {
    try {
      const u = new URL(apiBase)
      if (!isInternalAdobeIoruntimeFacadeHost(u.hostname)) {
        origins.add(u.origin)
      }
    } catch {
      /* ignore */
    }
  }

  const extra = pickParamOrEnv(params, 'LLM_CHATGPT_FRAME_DOMAINS')
  if (extra) {
    for (const part of extra.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
      addOrigin(part)
    }
  }

  const list = [...origins]
  if (!list.length) {
    list.push('http://localhost:9080', 'http://127.0.0.1:9080')
  }
  return list
}

/**
 * Deep link into the App Builder SPA.
 * - Default: **path** URLs (`/recommendation?location=…`) — matches `BrowserRouter` in `web-src`.
 * - Optional: set `LLM_EXPERIENCE_USE_HASH_ROUTES=1` (params or env) for `/#/segment?…` when the host
 *   serves the SPA only from `index.html` without history fallback (some static hosts).
 * Paths must match experience-routes.json and `brand.json` `toolRoutes[*].path`.
 */
function buildExperienceViewUrl (toolName, queryRecord, params = {}) {
  const originRaw = resolveLlmExperienceOrigin(params)
  if (!originRaw) return ''
  const pathSeg = experienceRoutes[toolName]
  if (!pathSeg) return ''

  let baseOrigin
  try {
    const trimmed = String(originRaw).trim().replace(/\/$/, '')
    baseOrigin = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).origin
  } catch {
    return ''
  }

  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(queryRecord || {})) {
    if (v != null && String(v).trim()) {
      sp.set(k, String(v).trim())
    }
  }
  const qs = sp.toString()
  const useHash =
    pickParamOrEnv(params, 'LLM_EXPERIENCE_USE_HASH_ROUTES') === '1' ||
    /^true$/i.test(pickParamOrEnv(params, 'LLM_EXPERIENCE_USE_HASH_ROUTES'))
  if (useHash) {
    const hash = qs ? `#/${pathSeg}?${qs}` : `#/${pathSeg}`
    return `${baseOrigin}/${hash}`
  }
  const path = `/${String(pathSeg).replace(/^\/+/, '')}`
  return qs ? `${baseOrigin}${path}?${qs}` : `${baseOrigin}${path}`
}

/**
 * POST JSON to a sibling web action (`recommend` or `spotlight` segment only).
 */
async function callJsonEndpoint (actionSegment, body, params = {}) {
  const base = resolveLlmAppWebBase(params)
  if (!base) {
    throw new Error(
      'Could not derive the web actions base URL. Set LLM_APP_BASE_URL, or ensure this activation ' +
        'includes __ow_path like .../api/v1/web/<ns>/<pkg>/mcp (aio app dev), or deploy to Runtime so ' +
        '__OW_ACTION_NAME and __OW_API_HOST are set. As a last resort set AIO_runtime_apihost, ' +
        'AIO_runtime_namespace, and LLM_APP_OW_PACKAGE.'
    )
  }

  const url = new URL(actionSegment.replace(/^\//, ''), base).toString()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body || {})
  })

  const status = res.status
  let data = null
  try {
    data = await res.json()
  } catch (e) {
    // Non-JSON body – treat as hard failure
    throw new Error(`Non-JSON response with HTTP ${status}`)
  }

  return { status, data }
}


module.exports = {
  pickParamOrEnv,
  pickEnv,
  normalizeOpenWhiskApiOrigin,
  baseFromActivationRequest,
  parseNsPkgFromOwActionName,
  baseFromOpenWhiskEnv,
  resolveLlmAppWebBase,
  readHeaderCi,
  originFromForwardedRequestHeaders,
  resolveLlmExperienceOrigin,
  isInternalAdobeIoruntimeFacadeHost,
  resolveLlmPublicWebActionOrigin,
  resolveLlmClientWebBase,
  resolveChatgptFrameDomains,
  buildExperienceViewUrl,
  callJsonEndpoint
}
