import { describe, it, expect, beforeAll } from "vitest";
import { GET as searchGET } from "../../src/app/api/products/search/route";
import { GET as showGET } from "../../src/app/api/products/[id]/route";
import { GET as contactGET } from "../../src/app/api/products/[id]/contact/route";

// Small helper so we can invoke both shapes:
//   - (req: Request)
//   - (req: Request, ctx: { params: { id: string } })
async function callRoute(fn: unknown, req: Request, ctx?: { params?: Record<string, string> }) {
  const handler = fn as (r: Request, c?: any) => Promise<Response>;
  // If the function is declared with 2 params we pass ctx; otherwise just req.
  // (length is a runtime hint; cast keeps TS quiet.)
  //ts-expect-error: we intentionally allow both signatures here 
  return handler.length >= 2 ? handler(req, ctx) : handler(req);
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: { ...(init?.headers || {}), "content-type": "application/json" }
  });
}

describe("Products API (integration)", () => {
  beforeAll(() => {
    expect(
      process.env["DATABASE_URL"],
      "DATABASE_URL must be set for integration tests"
    ).toBeTruthy();
  });

  it("search returns envelope", async () => {
    const req = makeReq("http://localhost/api/products/search?q=phone&page=1&pageSize=5");
    const res = await callRoute(searchGET, req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("items");
    expect(Array.isArray(json.items)).toBe(true);
  });

  it("show returns a single product", async () => {
    const reqSearch = makeReq("http://localhost/api/products/search?page=1&pageSize=1");
    const resSearch = await callRoute(searchGET, reqSearch);
    const list = await resSearch.json();
    const first = list.items?.[0];
    expect(first?.id).toBeTruthy();

    const req = makeReq(`http://localhost/api/products/${encodeURIComponent(first.id)}`);
    const res = await callRoute(showGET, req, { params: { id: String(first.id) } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("id", first.id);
  });

  it("contact endpoint responds (may require auth depending on your guard)", async () => {
    const reqSearch = makeReq("http://localhost/api/products/search?page=1&pageSize=1");
    const resSearch = await callRoute(searchGET, reqSearch);
    const list = await resSearch.json();
    const first = list.items?.[0];
    expect(first?.id).toBeTruthy();

    const req = makeReq(`http://localhost/api/products/${encodeURIComponent(first.id)}/contact`);
    const res = await callRoute(contactGET, req, { params: { id: String(first.id) } });
    expect([200, 401, 403]).toContain(res.status);
  });
});
