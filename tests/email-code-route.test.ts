import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookies: vi.fn(), exchange: vi.fn(), create: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({
  getSupabaseConfig: () => ({ url: "https://fixture.test", key: "sb_publishable_fixture" }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
import { POST } from "../src/app/auth/email-code/route";
function request(origin = "https://shop.test", body = { code: "fixture-code" }) {
  return new Request("https://shop.test/auth/email-code", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({
    getAll: () => [
      { name: "sb-fixture-auth-token-code-verifier", value: "verifier" },
      { name: "sb-fixture-auth-token", value: "unrelated-app-session" },
    ],
  });
  mocks.exchange.mockResolvedValue({
    data: { session: { access_token: "synthetic", refresh_token: "synthetic-refresh" } },
    error: null,
  });
  mocks.create.mockReturnValue({ auth: { exchangeCodeForSession: mocks.exchange } });
});
describe("legacy PKCE compatibility exchange", () => {
  it("exchanges only with the verifier, never reads/writes the existing app session", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    const options = mocks.create.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([
      { name: "sb-fixture-auth-token-code-verifier", value: "verifier" },
    ]);
    expect(options.cookies.setAll([{ name: "app", value: "replacement" }])).toBeUndefined();
    expect(mocks.exchange).toHaveBeenCalledWith("fixture-code");
  });
  it("rejects another origin before touching auth", async () => {
    expect((await POST(request("https://other.test"))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("fails accurately in another browser with no original verifier", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [] });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not leak provider errors or tokens on an expired/used code", async () => {
    mocks.exchange.mockResolvedValue({
      data: { session: null },
      error: new Error("sensitive provider detail"),
    });
    const result = await POST(request());
    expect(result.status).toBe(400);
    expect(await result.text()).not.toContain("sensitive");
  });
});
