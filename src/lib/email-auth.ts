import type { SupabaseClient, User } from "@supabase/supabase-js";

export const INVALID_EMAIL_LINK =
  "This link could not be verified. It may be invalid, used, or expired. Request a new link. Older links may need the original browser.";
export const EMAIL_RATE_LIMIT =
  "Too many emails requested. Please wait before requesting another link. Check your inbox and spam folder first.";
export type EmailPurpose = "signup" | "recovery";
export type EmailLink =
  | { kind: "tokens"; purpose: EmailPurpose; access: string; refresh: string }
  | { kind: "hash"; purpose: EmailPurpose; hash: string }
  | { kind: "code"; code: string };

/** Capture once, then scrub BOTH query and fragment BEFORE any provider request.
 * Do not log the URL or tokens, or retain them in history/storage.
 */
export function captureEmailLink(href: string, scrub: () => void): EmailLink {
  scrub();
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  for (const params of [url.searchParams, fragment]) {
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      throw new Error(INVALID_EMAIL_LINK);
    if (params.has("error") || params.has("error_code")) throw new Error(INVALID_EMAIL_LINK);
  }
  // Reject credentials in unsupported locations, including partial mixed flows.
  if (
    ["access_token", "refresh_token", "token"].some((key) => url.searchParams.has(key)) ||
    ["code", "token"].some((key) => fragment.has(key))
  )
    throw new Error(INVALID_EMAIL_LINK);
  // Reject ambiguous/mixed credentials, never infer recovery from `next`.
  const code = url.searchParams.get("code");
  const queryHash = url.searchParams.get("token_hash");
  const fragmentHash = fragment.get("token_hash");
  if (queryHash && fragmentHash) throw new Error(INVALID_EMAIL_LINK);
  const hash = queryHash || fragmentHash;
  const access = fragment.get("access_token");
  if ([code, hash, access].filter(Boolean).length !== 1) throw new Error(INVALID_EMAIL_LINK);
  if (code) {
    if (fragment.has("refresh_token") || fragment.has("type") || url.searchParams.has("type"))
      throw new Error(INVALID_EMAIL_LINK);
    return { kind: "code", code };
  }
  if (
    hash &&
    (fragment.has("refresh_token") ||
      (queryHash && fragment.has("type")) ||
      (fragmentHash && url.searchParams.has("type")))
  )
    throw new Error(INVALID_EMAIL_LINK);
  if (access && url.searchParams.has("type")) throw new Error(INVALID_EMAIL_LINK);
  const purpose = queryHash ? url.searchParams.get("type") : fragment.get("type");
  if (purpose !== "signup" && purpose !== "recovery") throw new Error(INVALID_EMAIL_LINK);
  if (hash) return { kind: "hash", purpose, hash };
  const refresh = fragment.get("refresh_token");
  if (!access || !refresh) throw new Error(INVALID_EMAIL_LINK);
  return { kind: "tokens", purpose, access, refresh };
}

export function emailAuthError(
  error: unknown,
): typeof EMAIL_RATE_LIMIT | "Authentication could not be completed. Please try again later." {
  if (
    error &&
    typeof error === "object" &&
    (("status" in error && error.status === 429) ||
      ("code" in error &&
        ["over_email_send_rate_limit", "over_request_rate_limit"].includes(String(error.code))))
  )
    return EMAIL_RATE_LIMIT;
  return "Authentication could not be completed. Please try again later.";
}

/** Claims must come from auth.getClaims (signature/server verified), NOT JWT decoding.
 * `otp` is NOT recovery proof: magic links and recovery links can share that AMR.
 * Only a successful verifyOtp(type: recovery) exchange in this isolated client,
 * or an explicitly provider-signed recovery AMR, authorizes the recovery form.
 * Provider user timestamps and URL type are never a substitute for that proof.
 */
export function validateEmailIdentity(
  purpose: EmailPurpose,
  claims: Record<string, unknown>,
  user: User,
  issuer: string,
  now = Date.now() / 1000,
  recoveryVerifiedByProvider = false,
) {
  const amr = claims.amr as { method?: string; timestamp?: number }[] | undefined;
  const methods = Array.isArray(amr) ? amr.map((entry) => entry.method) : [];
  const expected = purpose === "recovery" ? "recovery" : "email/signup";
  if (
    claims.iss !== issuer ||
    claims.sub !== user.id ||
    claims.role !== "authenticated" ||
    !(
      claims.aud === "authenticated" ||
      (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))
    ) ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.iat !== "number" ||
    claims.iat > now + 60 ||
    !user.email ||
    !user.email_confirmed_at ||
    user.is_anonymous ||
    !(methods.includes(expected) || methods.includes("otp")) ||
    methods.some((method) => method !== "otp" && method !== expected)
  )
    throw new Error(INVALID_EMAIL_LINK);
  if (purpose === "signup") {
    const confirmed = Date.parse(user.email_confirmed_at) / 1000;
    const recovery = Date.parse(user.recovery_sent_at ?? "") / 1000;
    if (
      !Number.isFinite(confirmed) ||
      Math.abs(confirmed - claims.iat) > 60 ||
      recovery > confirmed
    )
      throw new Error(INVALID_EMAIL_LINK);
  }
  if (purpose === "recovery") {
    if (!recoveryVerifiedByProvider && !methods.includes("recovery"))
      throw new Error(INVALID_EMAIL_LINK);
    // Business policy: signup confirmation must precede the reset request.
    // Provider recovery may confirm an email itself, but that is not eligible.
    // This ordering is additional policy, never a substitute for recovery proof.
    const sent = Date.parse(user.recovery_sent_at ?? "") / 1000;
    const confirmed = Date.parse(user.email_confirmed_at) / 1000;
    if (
      !Number.isFinite(confirmed) ||
      !Number.isFinite(sent) ||
      confirmed > sent ||
      sent > claims.iat + 1 ||
      now - sent > 3600 ||
      now - claims.iat > 900
    )
      throw new Error(INVALID_EMAIL_LINK);
  }
  return user.email;
}

export async function verifyEmailLink(client: SupabaseClient, link: EmailLink, issuer: string) {
  let purpose: EmailPurpose;
  let access: string;
  let refresh: string;
  let recoveryVerifiedByProvider = false;
  if (link.kind === "code") {
    const response = await fetch("/auth/email-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: link.code }),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(INVALID_EMAIL_LINK);
    const result = await response.json();
    access = result.access_token;
    refresh = result.refresh_token;
    // Legacy codes are accepted only when the provider signs a distinct purpose.
    // Generic `otp` cannot be safely classified from `next` or a verifier suffix.
    const verified = await client.auth.getClaims(access);
    if (verified.error || !verified.data) throw new Error(INVALID_EMAIL_LINK);
    const amr = verified.data.claims.amr;
    if (amr?.some((entry) => typeof entry !== "string" && entry.method === "recovery"))
      purpose = "recovery";
    else if (amr?.some((entry) => typeof entry !== "string" && entry.method === "email/signup"))
      purpose = "signup";
    else throw new Error(INVALID_EMAIL_LINK);
  } else if (link.kind === "hash") {
    purpose = link.purpose;
    const result = await client.auth.verifyOtp({ token_hash: link.hash, type: purpose });
    if (result.error || !result.data.session) throw new Error(INVALID_EMAIL_LINK);
    // This proof originates from a provider exchange, never from URL claims.
    recoveryVerifiedByProvider = purpose === "recovery";
    access = result.data.session.access_token;
    refresh = result.data.session.refresh_token;
  } else {
    purpose = link.purpose;
    access = link.access;
    refresh = link.refresh;
  }
  const verified = await client.auth.getClaims(access);
  const identity = await client.auth.getUser(access);
  if (verified.error || !verified.data || identity.error || !identity.data.user)
    throw new Error(INVALID_EMAIL_LINK);
  const email = validateEmailIdentity(
    purpose,
    verified.data.claims,
    identity.data.user,
    issuer,
    Date.now() / 1000,
    recoveryVerifiedByProvider,
  );
  // Don't let setSession refresh an expired token into an accepted recovery context.
  if (purpose === "recovery") {
    const result = await client.auth.setSession({ access_token: access, refresh_token: refresh });
    if (result.error || result.data.user?.id !== identity.data.user.id)
      throw new Error(INVALID_EMAIL_LINK);
  }
  return {
    purpose,
    email,
    userId: identity.data.user.id,
    expiresAt: Math.min(Number(verified.data.claims.exp), Number(verified.data.claims.iat) + 900),
    recoveryVerifiedByProvider,
  };
}

export function validateNewPassword(password: string, confirm: string) {
  if (password.length < 8) return "Use a password with at least 8 characters.";
  if (password !== confirm) return "The passwords don’t match. Please enter them again.";
  return null;
}
