import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/env";

/** Compatibility only: a legacy PKCE link still needs its original browser.
 * Exchange using the old verifier, but NEVER write an application session cookie.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const failure = () =>
    NextResponse.json({ error: "Link could not be verified." }, { status: 400, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure();
  try {
    const { code } = await request.json();
    if (typeof code !== "string" || code.length > 2048 || !code) return failure();
    const config = getSupabaseConfig();
    if (!config) return failure();
    const jar = await cookies();
    const verifier = jar.getAll().filter(({ name }) => /-code-verifier(?:\.\d+)?$/.test(name));
    if (!verifier.length) return failure();
    const client = createServerClient(config.url, config.key, {
      cookies: { getAll: () => verifier, setAll: () => {} },
    });
    const result = await client.auth.exchangeCodeForSession(code);
    if (result.error || !result.data.session) return failure();
    const { access_token, refresh_token } = result.data.session;
    return NextResponse.json({ access_token, refresh_token }, { headers });
  } catch {
    return failure();
  }
}
