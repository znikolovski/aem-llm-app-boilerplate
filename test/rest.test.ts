import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main as productsMain } from "../actions/api-products/index";
import { main as detailMain } from "../actions/api-product-detail/index";
import { main as whatsNewMain } from "../actions/api-whats-new/index";
import { main as openApiMain } from "../actions/openapi/index";
import { RuntimeParams } from "../actions/shared/types";

const fixtures = join(process.cwd(), "test", "fixtures");
const indexPayload = readFileSync(join(fixtures, "index.json"), "utf8");
const productHtml = readFileSync(join(fixtures, "product.html"), "utf8");
const homeHtml = readFileSync(join(fixtures, "home.html"), "utf8");

function params(extra: RuntimeParams = {}): RuntimeParams {
  return {
    __ow_method: "GET",
    SITE_INDEX_URL: "https://www.example.com/query-index.json",
    SITE_BASE_URL: "https://www.example.com",
    HOMEPAGE_PATH: "/",
    INDEX_CACHE_TTL_SECONDS: "1",
    ...extra
  };
}

test("REST product list returns data and count", async () => {
  mockFetch({ "https://www.example.com/query-index.json": indexPayload });
  const response = await productsMain(params({ category: "Credit Cards" }));
  const body = JSON.parse(response.body || "{}");
  assert.equal(response.statusCode, 200);
  assert.equal(body.count, 1);
  assert.equal(body.data[0].title, "Platinum Rewards Card");
});

test("REST product detail returns product detail", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": indexPayload,
    "https://www.example.com/products/platinum-rewards-card": productHtml
  });
  const response = await detailMain(params({ id: "platinum-rewards-card" }));
  const body = JSON.parse(response.body || "{}");
  assert.equal(response.statusCode, 200);
  assert.equal(body.id, "platinum-rewards-card");
  assert.ok(body.ctaLinks.some((link: { label: string }) => link.label === "Apply now"));
});

test("REST what's new returns homepage summary", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": indexPayload,
    "https://www.example.com/": homeHtml
  });
  const response = await whatsNewMain(params());
  const body = JSON.parse(response.body || "{}");
  assert.equal(response.statusCode, 200);
  assert.equal(body.title, "SecurBank");
});

test("OpenAPI route returns product paths", async () => {
  const response = await openApiMain(params());
  const body = JSON.parse(response.body || "{}");
  assert.equal(response.statusCode, 200);
  assert.ok(body.paths["/v1/products"]);
  assert.equal(body.openapi, "3.1.0");
});

function mockFetch(routes: Record<string, string>): void {
  globalThis.fetch = async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    const body = routes[url];
    if (body == null) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200 });
  };
}
