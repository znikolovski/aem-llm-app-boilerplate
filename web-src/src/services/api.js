import brand from "../brand.json";
import { LLM_WEB_ACTIONS_BASE_PATH } from "../llmWebActionsBase.generated.js";

/**
 * Strips a duplicated **first path segment** when it repeats the SPA’s own host identity:
 * - `/host:port/…` when `host:port` matches `location.origin` (any host/port).
 * - `/hostname/…` when the segment matches `location.hostname` (any FQDN or `localhost`).
 * Uses `win.location` only; no environment-specific literals.
 * @param {string} path
 * @param {Window} win
 */
function stripLeadingDuplicateHostPath(path, win) {
  if (!path || path[0] !== "/") return path;
  const m = path.match(/^\/([A-Za-z0-9.-]+):(\d+)(\/.*)?$/);
  if (m) {
    const host = m[1].toLowerCase();
    const port = m[2];
    const rest = m[3] && m[3].length > 0 ? m[3] : "/";
    try {
      const candidate = new URL(`${win.location.protocol}//${host}:${port}`);
      if (candidate.origin === win.location.origin) {
        return rest.startsWith("/") ? rest : `/${rest}`;
      }
    } catch {
      /* ignore */
    }
  }
  if (win && typeof win.location?.hostname === "string" && win.location.hostname) {
    const h = path.match(/^\/([^/]+)(\/.*)?$/);
    if (h) {
      const seg = h[1].toLowerCase();
      const rest = h[2] || "";
      if (seg === win.location.hostname.toLowerCase()) {
        if (!rest) {
          return "/";
        }
        return rest.startsWith("/") ? rest : `/${rest}`;
      }
    }
  }
  return path;
}

/** Repeat until stable — chains like `…/host/…/host/api/…` at any deployment origin. */
function stripAllDuplicateHostPathPrefixes(path, win) {
  let p = path;
  let next = stripLeadingDuplicateHostPath(p, win);
  while (next !== p) {
    p = next;
    next = stripLeadingDuplicateHostPath(p, win);
  }
  return p;
}

/**
 * @param {string} urlStr
 * @param {Window} win
 */
function canonicalizeRequestUrl(urlStr, win) {
  try {
    const u = new URL(urlStr, win.location.href);
    if (u.origin !== win.location.origin) {
      return urlStr;
    }
    const path = stripAllDuplicateHostPathPrefixes(u.pathname, win);
    if (path !== u.pathname) {
      u.pathname = path;
      return u.toString();
    }
  } catch {
    /* keep */
  }
  return urlStr;
}

/**
 * Normalizes injected API bases so `fetch()` never receives a string that the browser resolves as
 * a path under the current origin (which duplicates the host).
 * @param {string} raw
 * @param {Window | undefined} win
 */
function normalizeApiBase(raw, win) {
  let s = String(raw).trim().replace(/\/$/, "");
  if (!s) return "";
  if (
    !/^https?:\/\//i.test(s) &&
    !s.startsWith("/") &&
    /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(s)
  ) {
    s = `https://${s}`;
  }
  if (win && s[0] === "/") {
    const stripped = stripLeadingDuplicateHostPath(s, win);
    if (stripped !== s) {
      s = stripped.replace(/\/$/, "") || "/";
    }
  }
  if (/^https?:\/\//i.test(s)) {
    if (!win) return s;
    try {
      const u = new URL(s);
      const newPath = stripAllDuplicateHostPathPrefixes(u.pathname, win);
      if (newPath !== u.pathname) {
        u.pathname = newPath;
        return u.toString().replace(/\/$/, "");
      }
    } catch {
      /* keep s */
    }
    return s;
  }
  if (/^[a-z0-9.-]+:\d+(\/|$)/i.test(s)) {
    if (win) {
      try {
        return new URL(`${win.location.protocol}//${s}`).href.replace(/\/$/, "");
      } catch {
        /* fall through */
      }
    }
    return `https://${s}`;
  }
  return s;
}

/**
 * When the SPA is served from Parcel (explicit port other than the actions port under `aio app dev`),
 * `fetch("/api/v1/web/…")` would hit Parcel (**405**). Remap loopback only.
 *
 * @param {Window | undefined} win
 * @returns {string} e.g. `https://localhost:9080`, or `""` when no remap applies
 */
function localAioParcelUiToActionsOrigin(win) {
  if (!win?.location) return "";
  try {
    const cur = new URL(win.location.href);
    const h = cur.hostname.toLowerCase();
    const loopback = h === "localhost" || h === "127.0.0.1" || h === "::1";
    if (!loopback) return "";
    const uiPort = cur.port || "";
    if (uiPort === "") return "";
    const actionsPortRaw =
      win && typeof win.__LLM_DEV_ACTIONS_PORT__ === "string" && /^[1-9][0-9]{0,4}$/.test(win.__LLM_DEV_ACTIONS_PORT__.trim())
        ? win.__LLM_DEV_ACTIONS_PORT__.trim()
        : "9080";
    if (uiPort === actionsPortRaw) return "";
    const out = new URL(`${cur.protocol}//${cur.hostname}`);
    out.port = actionsPortRaw;
    return out.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * @param {string} href
 * @param {Window} win
 */
function rewriteLoopbackWebActionsUrlToActionsServer(href, win) {
  const ao = localAioParcelUiToActionsOrigin(win);
  if (!ao) return href;
  try {
    const u = new URL(href, win.location.href);
    if (u.origin !== win.location.origin) return href;
    if (!/^\/api\/v1\/web\//i.test(u.pathname)) return href;
    const fixed = new URL(`${u.pathname}${u.search}`, ao);
    return fixed.toString().replace(/\/$/, "");
  } catch {
    return href;
  }
}

/**
 * Resolution order: `window.__LLM_API_BASE__`, `brand.webActionsBase`, generated `LLM_WEB_ACTIONS_BASE_PATH`.
 * Under local `aio app dev` + Parcel, relative `/api/v1/web/…` is rewritten to the Express actions port.
 */
export function apiBaseUrl() {
  const win = typeof window !== "undefined" ? window : undefined;
  if (win && win.__LLM_API_BASE__) {
    const normalized = normalizeApiBase(String(win.__LLM_API_BASE__), win);
    if (normalized) {
      try {
        const abs = new URL(normalized, win.location.href);
        const crossOrigin = abs.origin !== win.location.origin;
        const p = abs.pathname.replace(/\/$/, "") || "/";
        const sameOriginWebActions = !crossOrigin && /^\/api\/v1\/web\//i.test(p);
        if (crossOrigin || sameOriginWebActions) {
          const href = /^https?:\/\//i.test(normalized) ? normalized : abs.href;
          return rewriteLoopbackWebActionsUrlToActionsServer(href.replace(/\/$/, ""), win).replace(/\/$/, "");
        }
      } catch {
        /* fall through */
      }
    }
  }
  const brandBase = typeof brand.webActionsBase === "string" && brand.webActionsBase.trim() ? brand.webActionsBase.trim() : "";
  const generatedBase =
    typeof LLM_WEB_ACTIONS_BASE_PATH === "string" && LLM_WEB_ACTIONS_BASE_PATH.trim()
      ? LLM_WEB_ACTIONS_BASE_PATH.trim()
      : "";
  const raw = brandBase || generatedBase;
  if (!raw || !win) {
    return "";
  }
  const normalized = normalizeApiBase(raw, win);
  if (/^https?:\/\//i.test(normalized)) {
    return rewriteLoopbackWebActionsUrlToActionsServer(normalized.replace(/\/$/, ""), win).replace(/\/$/, "");
  }
  let path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  path = stripAllDuplicateHostPathPrefixes(path, win);
  const actionsOrigin = localAioParcelUiToActionsOrigin(win);
  const origin = (actionsOrigin || win.location.origin).replace(/\/$/, "");
  const joined = `${origin}${path}`.replace(/\/$/, "");
  return rewriteLoopbackWebActionsUrlToActionsServer(joined, win).replace(/\/$/, "");
}

export function apiUrl(segment) {
  const win = typeof window !== "undefined" ? window : undefined;
  const base = apiBaseUrl();
  if (base) {
    const seg = String(segment).replace(/^\/+/, "");
    let joined;
    try {
      const baseWithSlash = base.replace(/\/?$/, "/");
      joined = new URL(seg, baseWithSlash).href;
    } catch {
      joined = `${base}/${segment}`.replace(/([^:]\/)\/+/g, "$1");
    }
    return win ? canonicalizeRequestUrl(joined, win) : joined;
  }
  const path = `${brand.apiVersionPath}/${segment}`.replace(/([^:]\/)\/+/g, "$1");
  return win ? canonicalizeRequestUrl(path, win) : path;
}

export async function chatStream(message, { signal, onEvent } = {}) {
  const res = await fetch(apiUrl("chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ message }),
    signal,
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error || text;
    } catch {
      // keep text
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }

  await readSseStream(res.body, onEvent);
}

export async function spotlight(params, { signal } = {}) {
  const res = await fetch(apiUrl("spotlight"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
    signal
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Spotlight response was not JSON.");
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function recommend(params, { signal } = {}) {
  const res = await fetch(apiUrl("recommend"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
    signal
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Recommend response was not JSON.");
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function splitSseRecords(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n\n");
  return { records: parts.slice(0, -1), rest: parts[parts.length - 1] ?? "" };
}

function dataPayloadFromRecord(record) {
  const lines = record.split("\n");
  const dataLines = [];
  for (const line of lines) {
    const t = line.trimEnd();
    if (t.startsWith("data:")) {
      dataLines.push(t.slice(5).trimStart());
    }
  }
  if (!dataLines.length) {
    return "";
  }
  return dataLines.join("\n").trim();
}

async function readSseStream(body, onEvent) {
  if (!body || typeof body.getReader !== "function") {
    throw new Error("Streaming response body is not readable.");
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const { records, rest } = splitSseRecords(buffer);
    buffer = rest;

    for (const record of records) {
      const raw = dataPayloadFromRecord(record);
      if (!raw || raw === "[DONE]") {
        continue;
      }
      try {
        onEvent(JSON.parse(raw));
      } catch {
        // ignore malformed SSE payloads
      }
    }

    if (done) {
      const tail = dataPayloadFromRecord(buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
      if (tail && tail !== "[DONE]") {
        try {
          onEvent(JSON.parse(tail));
        } catch {
          /* ignore */
        }
      }
      break;
    }
  }
}
