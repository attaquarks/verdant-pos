import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("@/lib/env", () => ({
  getSupabaseConfig: () => ({ url: "https://fixture.test", key: "sb_publishable_fixture" }),
}));
import { createEmailSupabase } from "../src/lib/supabase/email-client";
it("creates fresh implicit email-only clients without URL detection, storage, cookies, refresh or broadcast sharing", () => {
  createEmailSupabase();
  createEmailSupabase();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenLastCalledWith("https://fixture.test", "sb_publishable_fixture", {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "verdant-email-only",
    },
  });
});
