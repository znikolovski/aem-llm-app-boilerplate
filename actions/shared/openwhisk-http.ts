import { RuntimeResponse } from "./types";

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
 * OpenWhisk web actions require a top-level JSON object with optional
 * `statusCode`, `headers`, and `body`. Header values must be string, number,
 * boolean, or an array of those types. Non-string values and hop-by-hop
 * headers can cause: "Response is not valid 'message/http'."
 */
export function normalizeOpenWhiskWebResponse(response: RuntimeResponse): RuntimeResponse {
  let statusCode = Number(response.statusCode);
  if (!Number.isFinite(statusCode) || statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }
  statusCode = Math.trunc(statusCode);

  const headers: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(response.headers || {})) {
    if (!rawKey || typeof rawKey !== "string") {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (rawVal === undefined || rawVal === null) {
      continue;
    }
    if (HOP_BY_HOP.has(key)) {
      continue;
    }
    const value = typeof rawVal === "string" ? rawVal : String(rawVal);
    if (!value.length) {
      continue;
    }
    headers[key] = value;
  }

  const out: RuntimeResponse = { statusCode, headers };
  if (response.body !== undefined && response.body !== null) {
    out.body = typeof response.body === "string" ? response.body : String(response.body);
  }
  return out;
}
