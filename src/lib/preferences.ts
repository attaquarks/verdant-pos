/** Presentation preferences only. Never used for shop currency, timestamps, or accounting. */
export type Locale = "en" | "ur";
export type Theme = "light" | "night";
export const LOCALE_COOKIE = "verdant-locale";
export const THEME_COOKIE = "verdant-theme";
export const NEW_SHOP_DEFAULTS = { currency: "PKR", timeZone: "Asia/Karachi" } as const;
export function parseLocale(value: unknown): Locale {
  return value === "ur" ? "ur" : "en";
}
export function parseTheme(value: unknown): Theme {
  return value === "night" ? "night" : "light";
}
export function direction(locale: Locale) {
  return locale === "ur" ? "rtl" : "ltr";
}
export function preferenceCookie(
  name: typeof LOCALE_COOKIE | typeof THEME_COOKIE,
  value: Locale | Theme,
  secure: boolean,
) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
