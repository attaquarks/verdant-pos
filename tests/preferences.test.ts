import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PreferencesProvider, PreferenceControls } from "../src/components/preferences";
import {
  parseLocale,
  parseTheme,
  preferenceCookie,
  direction,
  LOCALE_COOKIE,
  THEME_COOKIE,
  NEW_SHOP_DEFAULTS,
} from "../src/lib/preferences";
import { ur, translate, translateMessage } from "../src/lib/translations";

describe("safe persisted presentation preferences", () => {
  it("uses conservative, allowlisted defaults for absent or untrusted cookies", () => {
    for (const value of [undefined, null, "UR", "<script>", "system"]) {
      expect(parseLocale(value)).toBe("en");
      expect(parseTheme(value)).toBe("light");
    }
    expect(parseLocale("ur")).toBe("ur");
    expect(parseTheme("night")).toBe("night");
    expect(direction("ur")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
  });
  it("writes year-long, same-site, path-wide preference cookies, secure on HTTPS", () => {
    expect(preferenceCookie(LOCALE_COOKIE, "ur", true)).toBe(
      "verdant-locale=ur; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(preferenceCookie(THEME_COOKIE, "night", false)).toBe(
      "verdant-theme=night; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
  it("server-renders language/theme controls in the requested locale, without window or storage", () => {
    const html = renderToStaticMarkup(
      createElement(PreferencesProvider, {
        initialLocale: "ur",
        initialTheme: "night",
        children: createElement(PreferenceControls),
      }),
    );
    expect(html).toContain("English");
    expect(html).toContain("رات کا رنگ");
    expect(html).toContain('aria-pressed="true"');
  });
  it("renders root lang, direction and theme from cookies before paint, without a bootstrap script", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("await cookies()");
    expect(layout).toContain("dir={direction(locale)}");
    expect(layout).toContain("data-theme={theme}");
    expect(layout).not.toContain("suppressHydrationWarning");
    expect(layout).not.toContain("dangerouslySetInnerHTML");
  });
  it("applies Pakistan defaults only when creating a new shop; existing settings remain shop-owned", () => {
    expect(NEW_SHOP_DEFAULTS).toEqual({ currency: "PKR", timeZone: "Asia/Karachi" });
    const onboarding = readFileSync("src/components/onboarding-view.tsx", "utf8");
    const settings = readFileSync("src/components/settings-view.tsx", "utf8");
    expect(onboarding).toContain("NEW_SHOP_DEFAULTS.currency");
    expect(onboarding).toContain("NEW_SHOP_DEFAULTS.timeZone");
    expect(settings).toContain("useState(shop.currency)");
    expect(settings).toContain("useState(shop.time_zone)");
    expect(settings).not.toContain("NEW_SHOP_DEFAULTS");
  });
});

describe("authored locale coverage", () => {
  it("has readable authored Urdu for every key, preserving every interpolation token", () => {
    expect(Object.keys(ur).length).toBeGreaterThan(800);
    const technical = new Set(["Alt N", "POS", "{v0} · {v1}", "{v0}: {v1}", "{v0} {v1}"]);
    for (const [key, value] of Object.entries(ur)) {
      expect(value.trim(), key).not.toBe("");
      if (!technical.has(key)) expect(value, key).toMatch(/[\u0600-\u06ff]/);
      expect([...value.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), key).toEqual(
        [...key.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
      );
    }
  });
  it("uses typed explicit translations across all views/dialogs, not menu-only or runtime DOM rewriting", () => {
    const allowedRaw = new Set([
      "verdant",
      "POS",
      "v.",
      "supabase/migrations",
      ".env.example",
      ".env.local",
      "NEXT_PUBLIC_",
      "/auth/callback",
      "/reset-password",
    ]);
    for (const file of readdirSync("src/components").filter(
      (f) => f.endsWith(".tsx") && f !== "preferences.tsx",
    )) {
      const source = readFileSync(`src/components/${file}`, "utf8");
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && /[a-zA-Z]/.test(node.text))
          expect(allowedRaw.has(node.text.trim()), `${file}: untranslated JSX ${node.text}`).toBe(
            true,
          );
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(ast) === "t" &&
          ts.isStringLiteral(node.arguments[0])
        )
          expect(Object.hasOwn(ur, node.arguments[0].text), `${file}: missing key`).toBe(true);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      expect(source).not.toMatch(/MutationObserver|TreeWalker|\.innerText\s*=|\.textContent\s*=/);
    }
  });
  it("translates known validation/auth/network/status text without altering unknown text", () => {
    expect(translateMessage("ur", "Invalid login credentials")).toContain("پاس ورڈ");
    expect(translateMessage("ur", "Insufficient stock for چاول")).toContain("چاول");
    expect(
      translateMessage("ur", "Enter a non-negative number with at most 4 decimal places."),
    ).toContain("4");
    expect(translateMessage("ur", "A provider-specific diagnostic")).toBe(
      "A provider-specific diagnostic",
    );
    expect(translateMessage("en", "Invalid login credentials")).toBe("Invalid login credentials");
    expect(translate("ur", "Balance due")).toBe("باقی ادھار");
    expect(translate("en", "Balance due")).toBe("Balance due");
  });
  it("isolates interpolated references and quantities for RTL without rounding or replacing data", () => {
    expect(translate("ur", "Quantity for {v0}", { v0: "Rice 25kg" })).toContain(
      "\u2068Rice 25kg\u2069",
    );
    expect(translate("en", "Only {v0} {v1} available.", { v0: "0.001", v1: "kg" })).toBe(
      "Only 0.001 kg available.",
    );
  });
  it("ships a local Urdu-capable font with its open licence and explicit night colours for every surface", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const night = css.slice(css.indexOf(':root[data-theme="night"]'));
    for (const token of [
      "--background",
      "--surface",
      "--text",
      "--text-muted",
      "--green",
      "--amber",
      "--red",
      "--line",
      "--overlay",
    ])
      expect(night).toContain(token);
    expect(css).toContain("./urdu-font.css");
    const fontCss = readFileSync("src/app/urdu-font.css", "utf8");
    const font = Buffer.from(
      fontCss.match(/data:font\/woff;base64,([A-Za-z0-9+/=]+)/)![1],
      "base64",
    );
    expect(font.subarray(0, 4).toString()).toBe("wOFF");
    expect(font.byteLength).toBe(398740);
    expect(readFileSync("public/fonts/OFL-NotoSansArabic.txt", "utf8")).toContain(
      "SIL OPEN FONT LICENSE",
    );
    expect(css).toContain("margin-inline-start: var(--sidebar-width)");
  });
});
