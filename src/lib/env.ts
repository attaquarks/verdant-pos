export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("your-project") || key.includes("your-publishable")) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
    )
      return null;
    if (key.startsWith("sb_secret_")) return null;
    // Legacy JWT anon keys are supported, but a service-role key is never acceptable.
    if (key.startsWith("eyJ")) {
      const body = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
        role?: string;
      };
      if (body.role !== "anon") return null;
    } else if (!key.startsWith("sb_publishable_")) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
