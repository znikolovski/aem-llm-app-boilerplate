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
 * App Builder workspace hosts look like `28538-llmappstudio.adobeioruntime.net` while some gateways
 * expose paths as `/api/v1/web/<workspace-id>/<package-id>/…`. Browsers must POST to the public
 * shape `/api/v1/web/<package-id>/…` (one segment after `web`). When the first segment after `web`
 * equals the **first hostname label**, drop that duplicate workspace segment.
 */
function collapseDuplicateWorkspaceSegmentAfterWeb (absoluteUrl) {
  if (!absoluteUrl || typeof absoluteUrl !== 'string') return absoluteUrl
  const wantTrailing = /\/$/.test(absoluteUrl.trim())
  let s = absoluteUrl.trim().replace(/\/$/, '')
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`)
    const hostFirst = String(u.hostname || '').split('.')[0].toLowerCase()
    if (!hostFirst) return absoluteUrl
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 5 || parts[0] !== 'api' || parts[1] !== 'v1' || parts[2] !== 'web') {
      return absoluteUrl
    }
    if (String(parts[3] || '').toLowerCase() !== hostFirst) {
      return absoluteUrl
    }
    const tail = parts.slice(4)
    u.pathname = `/${['api', 'v1', 'web', ...tail].join('/')}`
    const out = u.toString().replace(/\/$/, '')
    return wantTrailing ? `${out}/` : out
  } catch {
    return absoluteUrl
  }
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
 * App Builder serves the SPA from `*.adobeio-static.net` and Runtime web actions from
 * `*.adobeioruntime.net`. Deep links must target the static host; otherwise `/` + hash on Runtime
 * often redirects to unrelated Adobe pages. When resolution would yield a workspace
 * `*.adobeioruntime.net` origin, map to the sibling `*.adobeio-static.net` origin (same subdomain
 * prefix). Does not alter `resolveLlmPublicWebActionOrigin` / API bases — only SPA experience roots.
 */
function mapWorkspaceAdobeRuntimeToStaticSpaOrigin (origin) {
  if (!origin || typeof origin !== 'string') return origin
  const trimmed = origin.trim().replace(/\/$/, '')
  if (!trimmed) return origin
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const host = u.hostname.toLowerCase()
    if (host === 'adobeioruntime.net') {
      u.hostname = 'adobeio-static.net'
      return u.origin
    }
    if (host.endsWith('.adobeioruntime.net')) {
      const prefix = host.slice(0, -'.adobeioruntime.net'.length)
      u.hostname = `${prefix}.adobeio-static.net`
      return u.origin
    }
  } catch {
    return origin
  }
  return origin
}

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
 * `aio app dev` (`@adobe/aio-cli-plugin-app-dev`) serves the dev server with `https.createServer`
 * and a self-signed certificate (default port **9080**). Plain `http://` to that port hits a TLS
 * socket, so browsers show a generic connection error. Upgrade only `http://localhost|127.0.0.1:9080`.
 */
function upgradeLocalAioDevTlsOrigin (originStr) {
  if (!originStr || typeof originStr !== 'string') return originStr
  try {
    const u = new URL(/^https?:\/\//i.test(originStr) ? originStr : `https://${originStr}`)
    if (u.protocol !== 'http:') return originStr
    const host = (u.hostname || '').toLowerCase()
    const local = host === 'localhost' || host === '127.0.0.1'
    if (!local || String(u.port || '') !== '9080') return originStr
    u.protocol = 'https:'
    return u.origin
  } catch {
    return originStr
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
  let out = ''

  const explicitRaw = pickParamOrEnv(params, 'LLM_EXPERIENCE_ORIGIN')
  if (explicitRaw) {
    const first = explicitRaw.split(',')[0].trim().replace(/\/$/, '')
    if (first) {
      try {
        out = new URL(first).origin
      } catch {
        out = first
      }
    }
  }

  if (!out) {
    const fromBaseUrl = pickParamOrEnv(params, 'LLM_APP_BASE_URL') || pickParamOrEnv(params, '__LLM_APP_BASE_URL')
    if (fromBaseUrl) {
      try {
        const o = new URL(fromBaseUrl.replace(/\/$/, '')).origin
        if (!isInternalAdobeIoruntimeFacadeHost(new URL(o).hostname)) {
          out = o
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!out) {
    const fromForwarded = originFromForwardedRequestHeaders(params)
    if (fromForwarded) {
      try {
        if (!isInternalAdobeIoruntimeFacadeHost(new URL(fromForwarded).hostname)) {
          out = fromForwarded
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!out) {
    const fromActivation = baseFromActivationRequest(params)
    if (fromActivation) {
      try {
        const o = new URL(fromActivation)
        if (!isInternalAdobeIoruntimeFacadeHost(o.hostname)) {
          out = o.origin
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!out) {
    const pub = resolveLlmPublicWebActionOrigin(params)
    if (pub) out = pub
  }

  if (!out) {
    const apiBase = resolveLlmAppWebBase(params)
    if (apiBase) {
      try {
        const o = new URL(apiBase)
        if (!isInternalAdobeIoruntimeFacadeHost(o.hostname)) {
          out = o.origin
        }
      } catch {
        /* fall through */
      }
    }
  }

  return upgradeLocalAioDevTlsOrigin(mapWorkspaceAdobeRuntimeToStaticSpaOrigin(out))
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
    return collapseDuplicateWorkspaceSegmentAfterWeb(explicit.replace(/\/$/, '') + '/')
  }

  const raw = resolveLlmAppWebBase(params)
  if (!raw) return ''

  let u
  try {
    u = new URL(raw)
  } catch {
    return collapseDuplicateWorkspaceSegmentAfterWeb(raw.endsWith('/') ? raw : `${raw}/`)
  }

  if (!isInternalAdobeIoruntimeFacadeHost(u.hostname)) {
    return collapseDuplicateWorkspaceSegmentAfterWeb(raw.replace(/\/$/, '') + '/')
  }

  const publicOrigin = resolveLlmPublicWebActionOrigin(params)
  if (!publicOrigin) {
    return collapseDuplicateWorkspaceSegmentAfterWeb(raw.replace(/\/$/, '') + '/')
  }

  const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`
  const merged = `${publicOrigin.replace(/\/$/, '')}${path}`.replace(/\/$/, '') + '/'
  return collapseDuplicateWorkspaceSegmentAfterWeb(merged)
}

/**
 * Workspace SPA is served from `*.adobeio-static.net` while web actions use `*.adobeioruntime.net`.
 * ChatGPT widget CSP lists allowed iframe origins explicitly; include both siblings whenever one
 * appears so `experienceUrl` (often static) matches `frameDomains`.
 */
function addAdobeWorkspaceRuntimeStaticSiblingOrigins (originList) {
  const out = new Set()
  for (const raw of originList) {
    if (!raw || typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t) continue
    try {
      const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
      if (isInternalAdobeIoruntimeFacadeHost(u.hostname)) continue
      out.add(u.origin)
      const h = String(u.hostname || '').toLowerCase()
      if (h.endsWith('.adobeio-static.net')) {
        const prefix = h.slice(0, -'.adobeio-static.net'.length)
        if (prefix) {
          const clone = new URL(u.toString())
          clone.hostname = `${prefix}.adobeioruntime.net`
          out.add(clone.origin)
        }
      } else if (h.endsWith('.adobeioruntime.net')) {
        const prefix = h.slice(0, -'.adobeioruntime.net'.length)
        if (prefix) {
          const clone = new URL(u.toString())
          clone.hostname = `${prefix}.adobeio-static.net`
          out.add(clone.origin)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...out]
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

  let list = addAdobeWorkspaceRuntimeStaticSiblingOrigins([...origins])
  if (!list.length) {
    list.push(
      'http://localhost:9080',
      'https://localhost:9080',
      'http://127.0.0.1:9080',
      'https://127.0.0.1:9080',
      'http://localhost:9090',
      'https://localhost:9090',
      'http://127.0.0.1:9090',
      'https://127.0.0.1:9090'
    )
  }
  return list
}

/**
 * Last path segment after `/api/v1/web/…` from a Runtime web-actions base URL (the OpenWhisk package key).
 */
function extractWebActionPackageKeyFromBaseUrl (baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return ''
  try {
    const normalized = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://x${baseUrl}`
    const u = new URL(normalized.endsWith('/') ? normalized : `${normalized}/`)
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean)
    const w = parts.indexOf('web')
    if (w < 0 || w >= parts.length - 1) return ''
    return parts[parts.length - 1] || ''
  } catch {
    return ''
  }
}

/**
 * URL path prefix for the static SPA on the experience host (e.g. `/frescopa-d779c0088196`), aligned
 * with the Runtime package key so multiple apps can share one `*.adobeio-static.net` origin.
 * Override with `LLM_SPA_BASENAME` (leading slash, no trailing slash) when inference is wrong.
 * Set **`LLM_STATIC_WEB_AT_ROOT=1`** only when **one** SPA intentionally lives at the **origin root**
 * and MCP must omit the **`/<package>/`** prefix. **Leave unset** when multiple apps share one static host
 * and require **`/<package>/`** isolation (separate `index.html` + bundles per Runtime package).
 */
function resolveLlmSpaBasename (params = {}) {
  const rootFlag = pickParamOrEnv(params, 'LLM_STATIC_WEB_AT_ROOT')
  if (rootFlag === '1' || /^true$/i.test(String(rootFlag || ''))) {
    return ''
  }
  const explicit = pickParamOrEnv(params, 'LLM_SPA_BASENAME')
  if (explicit) {
    const t = explicit.trim().replace(/\/+$/, '')
    if (!t) return ''
    return t.startsWith('/') ? t : `/${t}`
  }
  const base = resolveLlmAppWebBase(params)
  const key = extractWebActionPackageKeyFromBaseUrl(base)
  if (!key) return ''
  return `/${key}`
}

/**
 * Under `aio app dev`, Express on the main port (default **9080**) serves `express.static(web.distDev)`.
 * With namespaced **`distDir`** (`./dist/<package>`), `index.html` and chunks live under **`distDev/<package>/`**, so **`/<package>/index.html`** resolves when the static root is **`distDev`**. Parcel’s dev server (default **9090**) also resolves **`publicUrl`** paths such as **`https://localhost:9090/<package>/index.html`**. For **hash** links with a non-empty SPA basename, the document URL must target that Parcel origin locally or the path 404s on :9080 if Express is not serving the namespaced folder.
 *
 * Override the Parcel port with **`LLM_EXPERIENCE_DEV_PORT`** (params or env) when aio prints
 * “Could not use bundler port 9090, using port …”.
 */
function resolveLocalAioParcelDevOrigin (originNoSlash, spaTrimmed, params = {}) {
  if (!spaTrimmed || !originNoSlash) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(originNoSlash) ? originNoSlash : `https://${originNoSlash}`)
    const host = (u.hostname || '').toLowerCase()
    if (host !== 'localhost' && host !== '127.0.0.1') return ''
    if (String(u.port || '') !== '9080') return ''
    const raw = pickParamOrEnv(params, 'LLM_EXPERIENCE_DEV_PORT')
    const devPort =
      raw && /^\d+$/.test(String(raw).trim()) ? String(raw).trim() : '9090'
    u.port = devPort
    return u.origin.replace(/\/$/, '')
  } catch {
    return ''
  }
}

/**
 * Deep link into the App Builder SPA.
 * - Default: **path** URLs (`/recommendation?location=…`) — matches `BrowserRouter` in `web-src`.
 * - Optional: set `LLM_EXPERIENCE_USE_HASH_ROUTES=1` (params or env) for `/#/segment?…` when the host
 *   serves the SPA only from `index.html` without history fallback (some static hosts).
 * Paths must match experience-routes.json and `brand.json` `toolRoutes[*].path`.
 * When the Runtime package is namespaced under `/api/v1/web/<pkg>/`, the same `<pkg>` is used as
 * the SPA path prefix (`resolveLlmSpaBasename`) so deep links match `HashRouter` / `BrowserRouter` basename.
 * **Hash routes:** the fragment is not sent to the server, so the URL must name a real HTML document.
 * We always emit `…/index.html#/…` (with optional `/<package>/` before `index.html`) so hosts like
 * Adobe `*.adobeio-static.net` serve the SPA shell instead of 404 on `/pkg#/` or bare `/#/`.
 * **Local `aio app dev` + hash + package basename:** the HTML shell is served from Parcel’s dev port
 * (see {@link resolveLocalAioParcelDevOrigin}) — not the Express :9080 static root alone.
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
  const spaBase = resolveLlmSpaBasename(params)
  const originRoot = `${baseOrigin.replace(/\/$/, '')}${spaBase}`
  const useHash =
    pickParamOrEnv(params, 'LLM_EXPERIENCE_USE_HASH_ROUTES') === '1' ||
    /^true$/i.test(pickParamOrEnv(params, 'LLM_EXPERIENCE_USE_HASH_ROUTES'))
  if (useHash) {
    const hash = qs ? `#/${pathSeg}?${qs}` : `#/${pathSeg}`
    const originNoSlash = baseOrigin.replace(/\/$/, '')
    const spaTrimmed =
      spaBase && String(spaBase).trim() ? String(spaBase).replace(/\/$/, '') : ''
    const parcelOrigin = resolveLocalAioParcelDevOrigin(originNoSlash, spaTrimmed, params)
    const docOrigin = parcelOrigin || originNoSlash
    const docBase = spaTrimmed
      ? `${docOrigin}${spaTrimmed}/index.html`
      : `${docOrigin}/index.html`
    return `${docBase}${hash}`
  }
  const path = `/${String(pathSeg).replace(/^\/+/, '')}`
  return qs ? `${originRoot}${path}?${qs}` : `${originRoot}${path}`
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
  mapWorkspaceAdobeRuntimeToStaticSpaOrigin,
  upgradeLocalAioDevTlsOrigin,
  resolveLlmExperienceOrigin,
  isInternalAdobeIoruntimeFacadeHost,
  resolveLlmPublicWebActionOrigin,
  resolveLlmClientWebBase,
  collapseDuplicateWorkspaceSegmentAfterWeb,
  resolveChatgptFrameDomains,
  buildExperienceViewUrl,
  resolveLlmSpaBasename,
  resolveLocalAioParcelDevOrigin,
  callJsonEndpoint
}
