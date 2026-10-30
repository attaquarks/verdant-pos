/** Supabase's browser client needs readable cookies; HTTPS must still mark them Secure.
 * Permit non-Secure cookies only for explicit HTTP loopback development/test origins.
 * Missing or malformed origins fail closed, without consulting untrusted forwarded headers.
 */
export function authCookiesSecure(origin?: string): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return !(
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return true;
  }
}
