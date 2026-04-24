import { runAction } from "../shared/action";
import { getConfig } from "../shared/config";
import { getMethod, jsonResponse, textResponse } from "../shared/http";
import { getHomepageSummary } from "../shared/site";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "GET") {
      return textResponse("Method not allowed.", 405);
    }

    const config = getConfig(params);
    return jsonResponse(await getHomepageSummary(config));
  });
}
