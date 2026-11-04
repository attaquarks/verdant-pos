"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";
import { authCookiesSecure } from "@/lib/auth-cookie-options";

export function createBrowserSupabase() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Configure the Supabase project URL and publishable key first.");
  return createBrowserClient(config.url, config.key, {
    // Email callbacks belong exclusively to the isolated memory client. Even a
    // provider redirect fallback must not silently install/switch an app session.
    auth: { detectSessionInUrl: false },
    cookieOptions: {
      secure: authCookiesSecure(typeof window === "undefined" ? undefined : window.location.origin),
    },
  });
}
