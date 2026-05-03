import assert from "node:assert/strict";
import { test } from "node:test";
import { main as chatMain } from "../actions/chat/index";
import { main as recommendMain } from "../actions/recommend/index";
import { RuntimeParams } from "../actions/shared/types";
import { runtimeJsonBody } from "./runtime-json-body";

function params(extra: RuntimeParams = {}): RuntimeParams {
  return {
    __ow_method: "POST",
    __ow_body: JSON.stringify({}),
    BRAND_DISPLAY_NAME: "TestBrand",
    ...extra
  };
}

test("chat rejects empty message before OpenAI key check", async () => {
  const response = await chatMain(params({ __ow_body: JSON.stringify({ message: "   " }) }));
  assert.equal(response.statusCode, 400);
});

test("chat returns 503 when OPENAI_API_KEY is missing", async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const response = await chatMain(
    params({
      __ow_body: JSON.stringify({ message: "hello" })
    })
  );
  if (prev !== undefined) {
    process.env.OPENAI_API_KEY = prev;
  }
  assert.equal(response.statusCode, 503);
  const body = runtimeJsonBody(response) as { error?: string };
  assert.ok(String(body.error || "").includes("OPENAI_API_KEY"));
});

test("chat rejects GET", async () => {
  const response = await chatMain(params({ __ow_method: "GET" }));
  assert.equal(response.statusCode, 405);
});

test("recommend returns UI blocks", async () => {
  const response = await recommendMain(
    params({
      __ow_body: JSON.stringify({ location: "Fiji" })
    })
  );
  assert.equal(response.statusCode, 200);
  const body = runtimeJsonBody(response) as { ui: Array<{ type: string }> };
  assert.ok(Array.isArray(body.ui));
  assert.ok(body.ui.some((b) => b.type === "card"));
});

test("recommend rejects missing location", async () => {
  const response = await recommendMain(params({ __ow_body: JSON.stringify({}) }));
  assert.equal(response.statusCode, 400);
});

test("recommend rejects GET", async () => {
  const response = await recommendMain(params({ __ow_method: "GET" }));
  assert.equal(response.statusCode, 405);
});
