"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

export function createBrowserSupabase() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Configure the Supabase project URL and publishable key first.");
  return createBrowserClient(config.url, config.key);
}
