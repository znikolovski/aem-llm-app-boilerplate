/*
 * OpenWhisk / Adobe I/O Runtime web action response normalization.
 * See apache/openwhisk WebActions resultAsHttp — JSON bodies as structured JSON
 * avoid "Response is not valid 'message/http'" for many deployments.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "transfer-encoding",
  "upgrade",
  "keep-alive",
  "proxy-connection",
  "trailer",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "sec-websocket-key",
  "sec-websocket-extensions",
  "sec-websocket-accept"
]);

/**
 * @param {{ statusCode?: unknown; headers?: Record<string, unknown>; body?: unknown }} response
 */
function normalizeOpenWhiskWebResponse(response) {
  let statusCode = Number(response.statusCode);
  if (!Number.isFinite(statusCode) || statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }
  statusCode = Math.trunc(statusCode);

  /** @type {Record<string, string>} */
  const headers = {};
  for (const [rawKey, rawVal] of Object.entries(response.headers || {})) {
    if (!rawKey || typeof rawKey !== "string") {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    if (!key || rawVal === undefined || rawVal === null || HOP_BY_HOP.has(key)) {
      continue;
    }
    const value = typeof rawVal === "string" ? rawVal : String(rawVal);
    if (!value.length) {
      continue;
    }
    headers[key] = value;
  }

  const contentType = headers["content-type"] ?? "";
  const isJsonFamily =
    contentType.includes("application/json") || contentType.includes("+json");

  let body = undefined;
  if (response.body !== undefined && response.body !== null) {
    if (typeof response.body === "string") {
      const s = response.body;
      if (s.length === 0) {
        body = undefined;
      } else if (isJsonFamily) {
        try {
          body = JSON.parse(s);
        } catch {
          body = s;
        }
      } else {
        body = s;
      }
    } else if (typeof response.body === "object") {
      body = response.body;
    } else {
      body = String(response.body);
    }
  }

  /** @type {{ statusCode: number; headers: Record<string, string>; body?: unknown }} */
  const out = { statusCode, headers };
  if (body !== undefined && body !== null) {
    out.body = body;
  }
  return out;
}

module.exports = { normalizeOpenWhiskWebResponse };
