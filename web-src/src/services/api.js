import brand from "../brand.json";

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
 * Prefix for Runtime **web actions** (same host as the SPA under `aio app dev` / deploy).
 * Optional absolute URL when the API is on another origin.
 *
 * Optional `window.__LLM_API_BASE__`: only honored when it targets a **different origin** than the
 * SPA. Same-origin values are ignored so broken injections cannot override `webActionsBase` with
 * path-shaped garbage.
 */
export function apiBaseUrl() {
  const win = typeof window !== "undefined" ? window : undefined;
  if (win && win.__LLM_API_BASE__) {
    const normalized = normalizeApiBase(String(win.__LLM_API_BASE__), win);
    if (normalized) {
      try {
        const abs = new URL(normalized, win.location.href);
        if (abs.origin !== win.location.origin) {
          return normalized.replace(/\/$/, "");
        }
      } catch {
        /* invalid — fall through to webActionsBase */
      }
    }
  }
  const raw =
    typeof brand.webActionsBase === "string" && brand.webActionsBase.trim() ? brand.webActionsBase.trim() : "";
  if (!raw || !win) {
    return "";
  }
  const normalized = normalizeApiBase(raw, win);
  if (/^https?:\/\//i.test(normalized)) {
    return normalized.replace(/\/$/, "");
  }
  let path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  path = stripAllDuplicateHostPathPrefixes(path, win);
  return `${win.location.origin}${path}`.replace(/\/$/, "");
}

export function apiUrl(segment) {
  const win = typeof window !== "undefined" ? window : undefined;
  const base = apiBaseUrl();
  if (base) {
    const joined = `${base}/${segment}`.replace(/\/+/g, "/");
    return win ? canonicalizeRequestUrl(joined, win) : joined;
  }
  const path = `${brand.apiVersionPath}/${segment}`.replace(/\/+/g, "/");
  return win ? canonicalizeRequestUrl(path, win) : path;
}

/**
 * POST /v1/chat — SSE stream of OpenAI Responses events (JSON `data:` lines).
 */
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

/**
 * Parse SSE records (split on blank line). Normalizes CRLF so dev proxies / runtimes that emit
 * `\r\n` still delimit events correctly.
 */
function splitSseRecords(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n\n");
  return { records: parts.slice(0, -1), rest: parts[parts.length - 1] ?? "" };
}

/** One SSE event may contain multiple `data:` lines joined with `\n` (spec). */
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
