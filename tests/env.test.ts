import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig } from "../src/lib/env";

afterEach(() => vi.unstubAllEnvs());
function configure(url: string, key: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
}
describe("public Supabase configuration boundary", () => {
  it("rejects secret keys at build-config load before Next can inline them", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ["sb", "secret", "fixture-not-real"].join("_"),
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.resetModules();
    await expect(import("../next.config")).rejects.toThrow(
      /must be a publishable or legacy anon key/,
    );
  });
  it("also rejects a hidden service-role fallback even when the primary key is public", async () => {
    const body = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture-not-real");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `eyJhbGciOiJIUzI1NiJ9.${body}.fixture`);
    vi.resetModules();
    await expect(import("../next.config")).rejects.toThrow(
      /must be a publishable or legacy anon key/,
    );
  });
  it("accepts public keys over HTTPS, or a local Supabase development URL", () => {
    configure("https://test.supabase.co", "sb_publishable_fixture-not-real");
    expect(getSupabaseConfig()).toEqual({
      url: "https://test.supabase.co",
      key: "sb_publishable_fixture-not-real",
    });
    configure("http://127.0.0.1:54321", "sb_publishable_fixture-not-real");
    expect(getSupabaseConfig()).not.toBeNull();
  });
  it("rejects missing, placeholder, insecure remote, secret and service-role keys", () => {
    configure("https://your-project.supabase.co", "your-publishable-key");
    expect(getSupabaseConfig()).toBeNull();
    configure("http://remote.example", "sb_publishable_fixture");
    expect(getSupabaseConfig()).toBeNull();
    configure("https://test.supabase.co", ["sb", "secret", "fixture"].join("_"));
    expect(getSupabaseConfig()).toBeNull();
    const body = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    configure("https://test.supabase.co", `eyJhbGciOiJIUzI1NiJ9.${body}.fixture`);
    expect(getSupabaseConfig()).toBeNull();
  });
  it("supports a legacy anon JWT key without accepting malformed tokens", () => {
    const body = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    configure("https://test.supabase.co", `eyJhbGciOiJIUzI1NiJ9.${body}.fixture`);
    expect(getSupabaseConfig()).not.toBeNull();
    configure("https://test.supabase.co", "eyJ.not-json.fixture");
    expect(getSupabaseConfig()).toBeNull();
  });
});
