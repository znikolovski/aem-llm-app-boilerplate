import { runAction } from "../shared/action";
import { getConfig } from "../shared/config";
import { getMethod, jsonResponse, readInteger, readQueryString, textResponse } from "../shared/http";
import { listProducts } from "../shared/site";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "GET") {
      return textResponse("Method not allowed.", 405);
    }

    const config = getConfig(params);
    const products = await listProducts(config, {
      category: readQueryString(params, "category"),
      query: readQueryString(params, "q") || readQueryString(params, "query"),
      limit: readInteger(params, "limit", 24)
    });

    return jsonResponse({ data: products, count: products.length });
  });
}
