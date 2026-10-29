import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  shop: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => (table === "shop_memberships" ? mocks.membership() : mocks.shop()),
      };
      return builder;
    },
  }),
}));
import { getUserContext, requireApiContext, requireShop } from "../src/lib/auth";

const active = {
  shop_id: "test-shop",
  user_id: "test-user",
  role: "staff",
  is_active: true,
  revoked_at: null,
};
beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { id: "test-user", email: "test@example.test" } },
    error: null,
  });
  mocks.membership.mockReset().mockResolvedValue({ data: active, error: null });
  mocks.shop.mockReset().mockResolvedValue({
    data: { id: "test-shop", name: "Test shop", currency: "USD", time_zone: "UTC" },
    error: null,
  });
  mocks.redirect.mockReset();
});
describe("verified membership context and revocation handling", () => {
  it("loads shop data only for an active membership", async () => {
    const context = await getUserContext();
    expect(context.shop?.id).toBe("test-shop");
    expect(context.membership?.is_active).toBe(true);
    expect(mocks.shop).toHaveBeenCalledOnce();
  });
  it("does not fetch shop data for a retained inactive membership and rejects API bootstrap too", async () => {
    mocks.membership.mockResolvedValue({
      data: { ...active, is_active: false, revoked_at: "2026-10-28T00:00:00Z" },
      error: null,
    });
    expect((await getUserContext()).shop).toBeNull();
    expect(mocks.shop).not.toHaveBeenCalled();
    await expect(requireApiContext(true)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("revoked"),
    });
    await expect(requireShop()).rejects.toThrow("REDIRECT:/access-revoked");
  });
  it("handles revocation committed between membership and shop reads without a spurious database failure", async () => {
    mocks.membership.mockResolvedValueOnce({ data: active, error: null }).mockResolvedValueOnce({
      data: { ...active, is_active: false, revoked_at: "2026-10-28T00:00:00Z" },
      error: null,
    });
    mocks.shop.mockResolvedValueOnce({ data: null, error: null });
    const context = await getUserContext();
    expect(context.membership?.is_active).toBe(false);
    expect(context.shop).toBeNull();
    expect(mocks.membership).toHaveBeenCalledTimes(2);
  });
  it("allows a genuinely new authenticated account to reach onboarding, not the revoked screen", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    const context = await requireApiContext(true);
    expect(context.shop).toBeNull();
    expect(context.membership).toBeNull();
    await expect(requireShop()).rejects.toThrow("REDIRECT:/onboarding");
    expect(mocks.shop).not.toHaveBeenCalled();
  });
});
