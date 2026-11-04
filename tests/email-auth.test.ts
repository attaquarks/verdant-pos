import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  captureEmailLink,
  EMAIL_RATE_LIMIT,
  emailAuthError,
  INVALID_EMAIL_LINK,
  validateEmailIdentity,
  validateNewPassword,
  verifyEmailLink,
} from "../src/lib/email-auth";

const now = Math.floor(Date.now() / 1000);
const issuer = "https://fixture.test/auth/v1";
const user = {
  id: "email-user",
  email: "email@fixture.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  recovery_sent_at: new Date((now - 5) * 1000).toISOString(),
  is_anonymous: false,
} as User;
const claims = {
  sub: user.id,
  iss: issuer,
  role: "authenticated",
  aud: "authenticated",
  iat: now,
  exp: now + 3600,
  amr: [{ method: "recovery", timestamp: now }],
};
function mockClient() {
  const auth = {
    getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session: { access_token: "verified", refresh_token: "refresh" } },
      error: null,
    }),
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

describe("isolated email link verification", () => {
  it("scrubs every URL before parsing/validation or outbound calls, even invalid links", () => {
    const scrub = vi.fn();
    const link = captureEmailLink(
      "https://shop.test/auth/callback#access_token=token&refresh_token=refresh&type=recovery",
      scrub,
    );
    expect(scrub).toHaveBeenCalledOnce();
    expect(link).toEqual({
      kind: "tokens",
      access: "token",
      refresh: "refresh",
      purpose: "recovery",
    });
    expect(() => captureEmailLink("https://shop.test/reset-password#type=recovery", scrub)).toThrow(
      INVALID_EMAIL_LINK,
    );
    expect(scrub).toHaveBeenCalledTimes(2);
  });
  it.each([
    "#type=recovery",
    "?code=legacy#refresh_token=partial",
    "?token_hash=query&type=recovery#token_hash=fragment&type=recovery",
    "?token_hash=hash&type=recovery#type=signup",
    "?access_token=query&refresh_token=query&type=recovery",
    "?type=signup#access_token=a&refresh_token=b&type=recovery",
    "#access_token=a&refresh_token=b&type=unknown",
    "#access_token=a&refresh_token=b&type=magiclink",
    "#access_token=a&refresh_token=b&type=invite",
    "#access_token=a&refresh_token=b&type=signup&type=recovery",
    "?code=legacy#access_token=a&refresh_token=b&type=recovery",
    "?token_hash=hash&type=recovery#access_token=a&refresh_token=b&type=recovery",
    "#error=access_denied&error_description=sensitive",
    "?next=https://evil.test",
  ])("rejects unknown/mixed/error credentials %s", (suffix) => {
    expect(() => captureEmailLink(`https://shop.test/auth/callback${suffix}`, vi.fn())).toThrow(
      INVALID_EMAIL_LINK,
    );
  });
  it("supports fragment token hashes without sending bearer secrets to the web server", () => {
    expect(
      captureEmailLink(
        "https://shop.test/reset-password#token_hash=synthetic&type=recovery",
        vi.fn(),
      ),
    ).toEqual({ kind: "hash", hash: "synthetic", purpose: "recovery" });
  });
  it("never uses next to decide purpose or navigate", () => {
    expect(
      captureEmailLink(
        "https://shop.test/auth/callback?next=https://evil.test#access_token=a&refresh_token=b&type=signup",
        vi.fn(),
      ),
    ).toMatchObject({ purpose: "signup" });
  });
  it("requires provider-verified user and claims before accepting confirmation, without signing in", async () => {
    const { auth, client } = mockClient();
    auth.getClaims.mockResolvedValue({
      data: { claims: { ...claims, amr: [{ method: "otp", timestamp: now }] } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          email_confirmed_at: new Date(now * 1000).toISOString(),
          recovery_sent_at: undefined,
        },
      },
      error: null,
    });
    await expect(
      verifyEmailLink(
        client,
        { kind: "tokens", access: "a", refresh: "b", purpose: "signup" },
        issuer,
      ),
    ).resolves.toMatchObject({ purpose: "signup", email: user.email });
    expect(auth.getClaims).toHaveBeenCalledWith("a");
    expect(auth.getUser).toHaveBeenCalledWith("a");
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it("accepts a fresh recovery in a new memory client without reading an application session", async () => {
    const { auth, client } = mockClient();
    await expect(
      verifyEmailLink(
        client,
        { kind: "tokens", access: "a", refresh: "b", purpose: "recovery" },
        issuer,
      ),
    ).resolves.toMatchObject({ purpose: "recovery", userId: user.id });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "b" });
  });
  it.each(["claims", "identity"])(
    "rejects invalid provider %s without installing a session",
    async (which) => {
      const { auth, client } = mockClient();
      (which === "claims" ? auth.getClaims : auth.getUser).mockResolvedValue({
        data: null,
        error: new Error("invalid"),
      });
      await expect(
        verifyEmailLink(
          client,
          { kind: "tokens", access: "a", refresh: "b", purpose: "recovery" },
          issuer,
        ),
      ).rejects.toThrow(INVALID_EMAIL_LINK);
      expect(auth.setSession).not.toHaveBeenCalled();
    },
  );
  it("rejects a substituted identity when installing recovery", async () => {
    const { auth, client } = mockClient();
    auth.setSession.mockResolvedValue({
      data: { user: { ...user, id: "different" } },
      error: null,
    });
    await expect(
      verifyEmailLink(
        client,
        { kind: "tokens", access: "a", refresh: "b", purpose: "recovery" },
        issuer,
      ),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
  });
  it("supports a legacy same-browser code using provider-signed recovery purpose, never URL next", async () => {
    const { auth, client } = mockClient();
    auth.getClaims.mockResolvedValue({
      data: { claims: { ...claims, amr: [{ method: "recovery", timestamp: now }] } },
      error: null,
    });
    const mockedFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "legacy-access",
          refresh_token: "legacy-refresh",
        }),
        { status: 200 },
      ),
    );
    try {
      await expect(
        verifyEmailLink(client, { kind: "code", code: "legacy" }, issuer),
      ).resolves.toMatchObject({ purpose: "recovery", userId: user.id });
      expect(mockedFetch).toHaveBeenCalledWith(
        "/auth/email-code",
        expect.objectContaining({ method: "POST", cache: "no-store" }),
      );
    } finally {
      mockedFetch.mockRestore();
    }
  });
  it("fails legacy codes without the original verifier instead of claiming expiration was repaired", async () => {
    const { auth, client } = mockClient();
    const mockedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 400 }));
    try {
      await expect(
        verifyEmailLink(client, { kind: "code", code: "legacy" }, issuer),
      ).rejects.toThrow(INVALID_EMAIL_LINK);
      expect(auth.setSession).not.toHaveBeenCalled();
    } finally {
      mockedFetch.mockRestore();
    }
  });
  it("does not label a recovery token as a signup confirmation", () => {
    expect(() => validateEmailIdentity("signup", claims, user, issuer, now)).toThrow(
      INVALID_EMAIL_LINK,
    );
  });
  it("uses provider token_hash recovery verification as proof even when AMR is only otp", async () => {
    const { auth, client } = mockClient();
    auth.getClaims.mockResolvedValue({
      data: { claims: { ...claims, amr: [{ method: "otp", timestamp: now }] } },
      error: null,
    });
    await verifyEmailLink(
      client,
      { kind: "hash", hash: "synthetic-hash", purpose: "recovery" },
      issuer,
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "synthetic-hash", type: "recovery" });
  });
  it("rejects provider recovery that confirms an email only after the reset request", async () => {
    const { auth, client } = mockClient();
    auth.getClaims.mockResolvedValue({
      data: { claims: { ...claims, amr: [{ method: "otp", timestamp: now }] } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user: { ...user, email_confirmed_at: new Date(now * 1000).toISOString() } },
      error: null,
    });
    await expect(
      verifyEmailLink(
        client,
        { kind: "hash", hash: "newly-confirmed", purpose: "recovery" },
        issuer,
      ),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "newly-confirmed",
      type: "recovery",
    });
    // The same timestamps on a generic OTP bearer still do not grant recovery authority.
    await expect(
      verifyEmailLink(
        client,
        { kind: "tokens", access: "otp", refresh: "refresh", purpose: "recovery" },
        issuer,
      ),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
  });
  it("allows confirmation exactly at request time only with provider recovery proof", () => {
    const sameTimeUser = { ...user, email_confirmed_at: user.recovery_sent_at } as User;
    expect(validateEmailIdentity("recovery", claims, sameTimeUser, issuer, now)).toBe(user.email);
    expect(() =>
      validateEmailIdentity(
        "recovery",
        { ...claims, amr: [{ method: "otp", timestamp: now }] },
        sameTimeUser,
        issuer,
        now,
      ),
    ).toThrow(INVALID_EMAIL_LINK);
  });
  it("rejects recovery without an existing provider identity", async () => {
    const { auth, client } = mockClient();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    await expect(
      verifyEmailLink(client, { kind: "hash", hash: "synthetic", purpose: "recovery" }, issuer),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it("rejects a generic OTP bearer relabelled recovery even after a recent recovery request", async () => {
    const { auth, client } = mockClient();
    auth.getClaims.mockResolvedValue({
      data: { claims: { ...claims, amr: [{ method: "otp", timestamp: now }] } },
      error: null,
    });
    await expect(
      verifyEmailLink(
        client,
        { kind: "tokens", access: "otp", refresh: "refresh", purpose: "recovery" },
        issuer,
      ),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it("rejects a failed recovery hash verification before accepting any session", async () => {
    const { auth, client } = mockClient();
    auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: new Error("wrong type"),
    } as never);
    await expect(
      verifyEmailLink(client, { kind: "hash", hash: "signup-hash", purpose: "recovery" }, issuer),
    ).rejects.toThrow(INVALID_EMAIL_LINK);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it.each([
    { exp: now - 1 },
    { sub: "other" },
    { iss: "https://wrong.test/auth/v1" },
    { aud: "anon" },
    { role: "anon" },
    { iat: now + 1000 },
    { amr: [{ method: "otp" }] },
    { amr: [{ method: "password" }] },
    { amr: [{ method: "oauth" }] },
    { amr: [{ method: "email/signup" }] },
    { amr: [] },
  ])("rejects expired/modified/wrong-flow claims %j", (change) => {
    expect(() =>
      validateEmailIdentity("recovery", { ...claims, ...change }, user, issuer, now),
    ).toThrow(INVALID_EMAIL_LINK);
  });
  it.each([
    { recovery_sent_at: undefined },
    { recovery_sent_at: "bad" },
    { recovery_sent_at: new Date((now - 4000) * 1000).toISOString() },
    { email_confirmed_at: undefined },
    { email_confirmed_at: "bad" },
    { email_confirmed_at: new Date((now - 4) * 1000).toISOString() },
    { is_anonymous: true },
  ])("rejects missing/stale/unconfirmed recovery identity %j", (change) => {
    expect(() =>
      validateEmailIdentity("recovery", claims, { ...user, ...change } as User, issuer, now),
    ).toThrow(INVALID_EMAIL_LINK);
  });
  it("requires matching new passwords before any update", () => {
    expect(validateNewPassword("short", "short")).toMatch(/8 characters/);
    expect(validateNewPassword("long-password", "different")).toMatch(/don’t match/);
    expect(validateNewPassword("long-password", "long-password")).toBeNull();
  });
  it("maps email limits to friendly non-enumerating copy without retrying", () => {
    expect(emailAuthError({ status: 429 })).toBe(EMAIL_RATE_LIMIT);
    expect(emailAuthError({ code: "over_email_send_rate_limit" })).toBe(EMAIL_RATE_LIMIT);
    expect(emailAuthError(new Error("private provider internals"))).not.toContain("internals");
  });
});
