import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { PreferencesProvider } from "@/components/preferences";
import { direction, LOCALE_COOKIE, THEME_COOKIE, parseLocale, parseTheme } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Verdant POS", template: "%s · Verdant POS" },
  description: "Clear stock. Reliable sales. A focused retail workspace for your shop.",
  robots: { index: false, follow: false },
};
export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: parseTheme(jar.get(THEME_COOKIE)?.value) === "night" ? "#080d0b" : "#176b55",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const locale = parseLocale(jar.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} dir={direction(locale)} data-theme={theme} data-scroll-behavior="smooth">
      <body>
        <PreferencesProvider initialLocale={locale} initialTheme={theme}>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
