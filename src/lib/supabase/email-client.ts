"use client";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/** Email links must work without the requesting browser's PKCE verifier.
 * Never share this client with the cookie-backed application client.
 */
export function createEmailSupabase() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Authentication is not configured.");
  return createClient(config.url, config.key, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Disable BroadcastChannel sharing with the application client too.
      storageKey: "verdant-email-only",
    },
  });
}
