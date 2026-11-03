import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authCookiesSecure } from "../src/lib/auth-cookie-options";
vi.mock("server-only", () => ({}));
const factories = vi.hoisted(() => ({ browser: vi.fn(), server: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: factories.browser,
  createServerClient: factories.server,
}));
vi.mock("@/lib/env", () => ({
  getSupabaseConfig: () => ({ url: "https://example.supabase.co", key: "public-test-key" }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
import { createBrowserSupabase } from "../src/lib/supabase/client";
import { createServerSupabase } from "../src/lib/supabase/server";
import { proxy } from "../src/proxy";
beforeEach(() => {
  factories.browser.mockReset().mockReturnValue({});
  factories.server
    .mockReset()
    .mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("HTTPS session cookie hardening", () => {
  it.each([
    "https://shop.example",
    "http://shop.example",
    undefined,
    "",
    "not-a-url",
    "https://localhost",
  ])("fails closed to Secure for %s", (origin) => {
    expect(authCookiesSecure(origin)).toBe(true);
  });
  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "keeps explicit HTTP loopback development working for %s",
    (origin) => {
      expect(authCookiesSecure(origin)).toBe(false);
    },
  );
  it("sets Secure in the browser factory on an HTTPS origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://shop.example" } });
    createBrowserSupabase();
    expect(factories.browser.mock.calls[0][2].cookieOptions.secure).toBe(true);
  });
  it("allows browser loopback cookies for the isolated test harness", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:3000" } });
    createBrowserSupabase();
    expect(factories.browser.mock.calls[0][2].cookieOptions.secure).toBe(false);
  });
  it("uses the configured canonical HTTPS origin for server writes", async () => {
    vi.stubEnv("APP_URL", "https://shop.example");
    await createServerSupabase();
    expect(factories.server.mock.calls[0][2].cookieOptions.secure).toBe(true);
  });
  it("keeps Secure on proxy refresh and preserves private no-store", async () => {
    vi.stubEnv("APP_URL", "https://shop.example");
    const response = await proxy(new NextRequest("https://shop.example/inventory"));
    expect(factories.server.mock.calls[0][2].cookieOptions.secure).toBe(true);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not force HttpOnly on the browser-SDK session mechanism", () => {
    vi.stubGlobal("window", { location: { origin: "https://shop.example" } });
    createBrowserSupabase();
    expect(factories.browser.mock.calls[0][2].cookieOptions.httpOnly).toBeUndefined();
  });
});
