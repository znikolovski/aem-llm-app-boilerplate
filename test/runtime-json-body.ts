import type { RuntimeResponse } from "../actions/shared/types";

/**
 * Read JSON from a web action response after `normalizeOpenWhiskWebResponse` (via `runAction`),
 * which may expose `body` as a structured value for OpenWhisk compatibility.
 */
export function runtimeJsonBody(r: RuntimeResponse): unknown {
  const b = r.body;
  if (b === undefined || b === null) {
    return {};
  }
  if (typeof b === "string") {
    return JSON.parse(b.length ? b : "{}");
  }
  return b;
}
