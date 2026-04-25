import { ConfigError } from "./config";
import { errorResponse, getMethod, noContentResponse } from "./http";
import { normalizeOpenWhiskWebResponse } from "./openwhisk-http";
import { RuntimeParams, RuntimeResponse } from "./types";

export async function runAction(
  params: RuntimeParams,
  handler: () => Promise<RuntimeResponse>
): Promise<RuntimeResponse> {
  if (getMethod(params) === "OPTIONS") {
    return normalizeOpenWhiskWebResponse(noContentResponse());
  }

  try {
    return normalizeOpenWhiskWebResponse(await handler());
  } catch (error) {
    return normalizeOpenWhiskWebResponse(errorResponse(error, statusFromError(error)));
  }
}

export function statusFromError(error: unknown): number {
  if (error instanceof ConfigError) {
    return 400;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) {
      return 404;
    }
    if (message.includes("required") || message.includes("valid") || message.includes("blocked")) {
      return 400;
    }
    if (message.includes("fetch failed")) {
      return 502;
    }
  }

  return 500;
}
