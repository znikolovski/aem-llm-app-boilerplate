import { runAction } from "../shared/action";
import { getConfig } from "../shared/config";
import { getMethod, jsonResponse, readQueryString, textResponse } from "../shared/http";
import { getProductDetail } from "../shared/site";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "GET") {
      return textResponse("Method not allowed.", 405);
    }

    const config = getConfig(params);
    const id = readQueryString(params, "id") || readPathId(params);
    const path = readQueryString(params, "path");
    const detail = await getProductDetail(config, { id, path });
    return jsonResponse(detail);
  });
}

function readPathId(params: RuntimeParams): string | undefined {
  if (typeof params.id === "string" && params.id.trim()) {
    return params.id.trim();
  }

  if (typeof params.__ow_path === "string") {
    return params.__ow_path.split("/").filter(Boolean).pop();
  }

  return undefined;
}
