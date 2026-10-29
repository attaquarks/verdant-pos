import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireApiContext: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireApiContext: mocks.requireApiContext }));
import { POST } from "../src/app/api/actions/[action]/route";
import { AppError } from "../src/lib/errors";

const request_id = "00000000-0000-4000-8000-000000000001";
const shop_id = "00000000-0000-4000-8000-000000000002";
const product_id = "00000000-0000-4000-8000-000000000003";
const payload = {
  request_id,
  items: [{ product_id, quantity: "1", unit_price: "1.25", discount: "0" }],
  payment_method: "cash",
  customer_name: null,
  customer_contact: null,
  note: null,
};
function call(action: string, data: unknown, origin = "https://shop.example") {
  const request = new Request(`https://shop.example/api/actions/${action}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return POST(request, { params: Promise.resolve({ action }) });
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://shop.example");
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { id: "saved-sale", total: "1.25" }, error: null });
  mocks.requireApiContext.mockReset().mockResolvedValue({
    supabase: { rpc: mocks.rpc },
    user: { id: "verified-user" },
    membership: { role: "owner" },
    shop: { id: shop_id, time_zone: "UTC" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated mutation routes", () => {
  it("derives shop authorization server-side and passes decimal strings and the original key to SQL", async () => {
    const response = await call("sale", payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: "saved-sale", total: "1.25" } });
    expect(mocks.rpc).toHaveBeenCalledWith("post_sale", {
      p_shop_id: shop_id,
      p_request_id: request_id,
      p_items: payload.items,
      p_payment_method: "cash",
      p_customer_name: null,
      p_customer_contact: null,
      p_note: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects forged shop IDs, unknown actions and cross-origin attempts before SQL", async () => {
    expect((await call("sale", { ...payload, shop_id: "forged" })).status).toBe(400);
    expect((await call("delete", payload)).status).toBe(400);
    expect((await call("sale", payload, "https://evil.example")).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires verified authentication and does not return success on a database failure", async () => {
    mocks.requireApiContext.mockRejectedValueOnce(new AppError("Sign in to continue.", 401));
    expect((await call("sale", payload)).status).toBe(401);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "Insufficient stock for Tea" },
    });
    const response = await call("sale", payload);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Insufficient stock for Tea" });
  });
  it("does not expose provider error details on unexpected failures", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "08006", message: "sensitive internal connection detail" },
    });
    const response = await call("sale", payload);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive");
  });
  it("validates every import row before issuing the atomic import RPC", async () => {
    expect((await call("import", { request_id, csv: "name,selling_price\nTea,abc" })).status).toBe(
      400,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await call("import", { request_id, csv: "name,selling_price\nTea,2.50" })).status).toBe(
      200,
    );
    expect(mocks.rpc.mock.calls[0][0]).toBe("import_products");
    expect(mocks.rpc.mock.calls[0][1].p_products[0]).toMatchObject({
      name: "Tea",
      selling_price: "2.50",
      cost_price: null,
    });
  });
  it("bootstraps only the authenticated user's first shop, without a client shop ID", async () => {
    mocks.requireApiContext.mockResolvedValueOnce({ supabase: { rpc: mocks.rpc }, shop: null });
    await call("shop", {
      request_id,
      mode: "create",
      name: "Retail Shop",
      currency: "USD",
      time_zone: "UTC",
    });
    expect(mocks.requireApiContext).toHaveBeenCalledWith(true);
    expect(mocks.rpc).toHaveBeenCalledWith("create_shop", {
      p_request_id: request_id,
      p_name: "Retail Shop",
      p_currency: "USD",
      p_time_zone: "UTC",
    });
  });
  it("retries shop bootstrap as the same create operation even after membership now exists", async () => {
    const body = {
      request_id,
      mode: "create",
      name: "Retail Shop",
      currency: "USD",
      time_zone: "UTC",
    };
    // The default mock context already has a shop, as it would after a committed
    // create whose original HTTP response did not reach the browser.
    expect((await call("shop", body)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("create_shop", {
      p_request_id: request_id,
      p_name: "Retail Shop",
      p_currency: "USD",
      p_time_zone: "UTC",
    });
  });
  it("does not report success without a confirmed RPC result", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await call("sale", payload);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it("rejects future-dated expenses at the HTTP boundary", async () => {
    const result = await call("expense", {
      request_id,
      description: "Shop rent",
      category: "Rent",
      amount: "10.00",
      method: "cash",
      occurred_on: "9999-12-31",
    });
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
