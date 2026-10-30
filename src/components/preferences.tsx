"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ComponentPropsWithRef,
} from "react";
import { Moon, Sun } from "lucide-react";
import {
  direction,
  LOCALE_COOKIE,
  THEME_COOKIE,
  preferenceCookie,
  type Locale,
  type Theme,
} from "@/lib/preferences";
import { translate, translateMessage, type MessageKey } from "@/lib/translations";

type Preferences = {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
};
const Context = createContext<Preferences>({
  locale: "en",
  theme: "light",
  setLocale: () => {},
  setTheme: () => {},
});

function persist(name: typeof LOCALE_COOKIE | typeof THEME_COOKIE, value: Locale | Theme) {
  // Cookies are authoritative: server HTML and the first React render always agree.
  try {
    document.cookie = preferenceCookie(name, value, window.location.protocol === "https:");
  } catch {
    /* Preference changes must still work if the browser refuses cookies. */
  }
  try {
    window.localStorage.setItem(name, value);
  } catch {
    /* Optional mirror; restricted storage must not block the UI. */
  }
}
export function PreferencesProvider({
  initialLocale,
  initialTheme,
  children,
}: {
  initialLocale: Locale;
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const [theme, updateTheme] = useState(initialTheme);
  const setLocale = useCallback((next: Locale) => {
    persist(LOCALE_COOKIE, next);
    updateLocale(next);
  }, []);
  const setTheme = useCallback((next: Theme) => {
    persist(THEME_COOKIE, next);
    updateTheme(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "night" ? "#080d0b" : "#176b55");
  }, [locale, theme]);
  const value = useMemo(
    () => ({ locale, theme, setLocale, setTheme }),
    [locale, theme, setLocale, setTheme],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreferences() {
  return useContext(Context);
}
export function useT() {
  const { locale } = usePreferences();
  return useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  );
}
/** Translate only explicit known messages at the React boundary, never user-entered names/notes. */
export function useMessage() {
  const { locale } = usePreferences();
  return useCallback((message: string) => translateMessage(locale, message), [locale]);
}
export function PreferenceControls() {
  const { locale, theme, setLocale, setTheme } = usePreferences();
  return (
    <div
      className="preference-controls"
      role="group"
      aria-label={locale === "ur" ? "زبان اور رنگ" : "Language and appearance"}
    >
      <button
        type="button"
        className="preference-language"
        lang={locale === "en" ? "ur" : "en"}
        dir={locale === "en" ? "rtl" : "ltr"}
        onClick={() => setLocale(locale === "en" ? "ur" : "en")}
        aria-label={locale === "en" ? "اردو میں استعمال کریں" : "Use in English"}
      >
        {locale === "en" ? "اردو" : "English"}
      </button>
      <button
        type="button"
        className="preference-theme"
        aria-pressed={theme === "night"}
        onClick={() => setTheme(theme === "night" ? "light" : "night")}
      >
        {theme === "night" ? (
          <Sun size={18} aria-hidden="true" />
        ) : (
          <Moon size={18} aria-hidden="true" />
        )}
        <span>{locale === "ur" ? "رات کا رنگ" : "Night mode"}</span>
      </button>
    </div>
  );
}

export function useDateFormatter() {
  const { locale } = usePreferences();
  return useCallback(
    (date: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = {}) => {
      const value = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(value.valueOf())) return "—";
      // Latin digits keep quantities, dates and receipts familiar; timezone still comes from the shop.
      return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK-u-nu-latn" : "en", {
        timeZone,
        month: "short",
        day: "numeric",
        ...options,
      }).format(value);
    },
    [locale],
  );
}

/** Native constraints remain authoritative; only their browser-facing wording is localized. */
export function LocalizedForm({
  onInvalidCapture,
  onInputCapture,
  ...props
}: ComponentPropsWithRef<"form">) {
  const { locale } = usePreferences();
  const t = useT();
  return (
    <form
      {...props}
      onInvalidCapture={(event) => {
        onInvalidCapture?.(event);
        const field = event.target;
        if (
          event.defaultPrevented ||
          !(
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement
          )
        )
          return;
        field.setCustomValidity("");
        if (locale !== "ur" || field.validity.valid) return;
        const validity = field.validity;
        let message = t("Enter a valid value.");
        if (validity.valueMissing) message = t("Complete this field.");
        else if (
          validity.typeMismatch &&
          field instanceof HTMLInputElement &&
          field.type === "email"
        )
          message = t("Enter a valid email address.");
        else if (validity.badInput) message = t("Enter a number.");
        else if (validity.rangeOverflow && field instanceof HTMLInputElement)
          message = t("Use {v0} or less.", { v0: field.max });
        else if (validity.rangeUnderflow && field instanceof HTMLInputElement)
          message = t("Use {v0} or more.", { v0: field.min });
        else if (validity.tooShort && "minLength" in field)
          message = t("Use at least {v0} characters.", { v0: field.minLength });
        else if (validity.tooLong && "maxLength" in field)
          message = t("Use no more than {v0} characters.", { v0: field.maxLength });
        else if (validity.patternMismatch) message = t("Follow the format shown for this field.");
        else if (validity.stepMismatch) message = t("Use an allowed quantity or amount.");
        field.setCustomValidity(message);
      }}
      onInputCapture={(event) => {
        const field = event.target;
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        )
          field.setCustomValidity("");
        onInputCapture?.(event);
      }}
    />
  );
}
