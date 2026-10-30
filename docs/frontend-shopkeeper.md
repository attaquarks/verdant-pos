# Shopkeeper frontend preferences and task flow

This enhancement keeps the existing forest-green interface and all business contracts. It does not introduce AI features, change the ledger/API/migrations, change authentication requests, or change sale idempotency and draft-recovery behaviour.

## Presentation preferences

- Login, account recovery, onboarding, app header, settings, and installation setup expose **اردو / English** and a labelled **Night mode** toggle.
- `verdant-locale` (`en` / `ur`) and `verdant-theme` (`light` / `night`) are allowlisted, one-year, path-wide `SameSite=Lax` cookies (`Secure` on HTTPS). They contain presentation preferences only, not identity or shop data.
- The root server layout renders `lang`, `dir`, `data-theme`, and theme-colour metadata from the cookies. The provider begins with the exact same values: no inline bootstrap script, hydration suppression, client-only initial locale, or initial light-to-dark page flash.
- Local storage is an optional write-through mirror. Cookies are deliberately authoritative, including when an old/stale local-storage value disagrees. Blocked local storage cannot break the controls. If a browser refuses cookies, switching still works in the current page, but persistence after reload is not guaranteed.
- No extra network translation request, DOM text rewriting, MutationObserver, or external font runtime request is used.

## Urdu and RTL

`src/lib/translations.ts` is an explicitly authored Urdu catalogue with typed English source keys and placeholder preservation. `useT()` handles authored UI strings; `sourceMessage()` stores notices in English-source form so an already-open notice follows a later language switch. `useMessage()` is confined to explicit React display/message boundaries and known status enums, not arbitrary user-entered data.

All seven app pages, onboarding/login/recovery, stock/product/import dialogs, sale/collection/return/reversal dialogs, controls, empty/loading/error states, native form validation prompts, accessible labels, and chart labels have authored Urdu coverage. CSS logical edges move the sidebar, layout spacing, control icons, action alignment and mobile layout into real RTL. Native number/date entry and chart coordinate direction remain LTR; Latin numerals and decimal precision are retained. Dates are formatted for the presentation locale using each **existing shop's timezone**.

Product names, units, customer names/contacts, categories, notes, references, and historical ledger descriptions remain exactly as saved. These are business data, not interface copy. CSV headers and technical configuration identifiers deliberately retain their documented spelling. Known backend, network, auth, validation, and CSV errors are translated at the display boundary; unknown third-party/SQL diagnostics remain visible in their original wording rather than being hidden or guessed. Browser-owned date pickers and file chooser chrome follow the browser/OS language. The Urdu copy has **not** had an independent native-speaker usability/copy review.

### Font

`src/app/urdu-font.css` contains the locally hosted variable Noto Sans Arabic font (Urdu letters included) as a lossless WOFF data URI, with Arabic/Urdu/system fallbacks. This text asset preserves the exact font bytes through the text-only GitHub connector; the font ships in the application stylesheet, never from an external host. Its SIL OFL licence is included alongside it. Source: Google Fonts `ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf`; subset preserves Latin, Arabic, Arabic Supplement/Extended-A, presentation forms, punctuation and shaping features. No remote font service is needed at runtime.

## Task-first changes

- Daily hisaab task cards: sell, check stock / maal, collect udhaar, record a daily expense.
- Existing desktop navigation and page names retained; mobile adds a persistent labelled quick-task bar.
- Clear sell **and receive** labels in stock rows, larger controls, stronger label/body type, single-column mobile filters/payment choices and better form spacing.
- Night colours cover pages, dialogs, statuses, inputs, chart axes/series, focus states and destructive actions while retaining forest-green emphasis.
- Native form constraints are unchanged. `LocalizedForm` only changes their browser-facing wording in Urdu, clears that wording on input, and preserves submit handlers and refs.

## New shops only

`NEW_SHOP_DEFAULTS` supplies editable `PKR` and `Asia/Karachi` values **only** in `OnboardingView`. Browser timezone detection no longer overrides the Pakistan default. `SettingsView` still initializes and refreshes from `shop.currency` and `shop.time_zone`. Nothing updates an existing shop merely because language or theme changes.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test` — includes `tests/preferences.test.ts` for allowlisting/cookies, SSR-safe rendering, locale/placeholder coverage, explicit React translation boundaries, local font, and new-shop-only defaults.
- `npm run build`
- `npm run test:e2e` — existing transaction/oversell/idempotency/credit/revocation/mobile regressions plus `tests/e2e/preferences.spec.ts`.

Preference browser coverage includes initial server HTML, reload persistence, blocked local storage, native Urdu validation and clearing, English/Urdu/light/night, all seven pages, all major stock/money/sale dialogs (including nested dialogs), keyboard focus containment/return, mobile overflow and bottom navigation, and editable new-shop defaults even in an America/New_York browser timezone. Axe WCAG A/AA checks run on the covered screens/dialogs. This is automated evidence, not a complete accessibility certification or a usability study with shopkeepers.

Browser evidence is generated under ignored `artifacts/screenshots/`:

- `urdu-night-login.png`
- `urdu-night-dashboard.png`
- `urdu-night-sale.png`
- `urdu-night-mobile-stock.png`
- `urdu-night-mobile-sale.png`

All browser data is synthetic local PGlite fixture data. No hosted shop was modified and no cloud deployment was performed. In this sandbox a `node_modules` directory symlink outside the worktree made Turbopack resolution fail; a local hard-linked dependency tree resolved that environment-only issue without changing package versions/configuration or the QA worktree.

### Local result for this branch

- `npm run check`: lint, TypeScript, **126 unit/SQL tests in 13 files**, and production Turbopack build passed.
- `npm run test:e2e`: **15/15 Chromium tests passed**, including the full pre-existing accounting workflow suite and the new preference/Urdu/night tests.
- The current catalogue contains **849 authored message keys**. The native Urdu validation test verifies an invalid email is blocked, its message is Urdu, and correcting the value clears the custom message.
- Screenshots above were captured at 1440×1000 desktop and 390×844 mobile using only synthetic fixtures; inspected login, RTL dashboard, sale dialog and mobile stock/sale captures. No hydration errors were observed in the preference workflow.
- The revocation regression can log the expected denied-shop `AppError` (403) during its access-removal race; its page/API/SQL assertions pass. It is not a production-cloud result.

## Hosted preview verification (October 30, 2026)

The parent agent also tested the Vercel preview built from published source 19b73d9 using a real, isolated cloud QA account and the existing Supabase staging project. Branch-scoped preview variables were added; production variables and production deployment were not changed. Preview function region is cdg1 and runtime is Node 24.

Real password login succeeded. English-to-Urdu/night changes survived reload and appeared in initial server HTML. The bundled Urdu font loaded. All seven authenticated destinations rendered in Urdu/RTL/night mode with zero Axe WCAG A/AA violations in that automated pass, no horizontal overflow, and no unhandled page errors. Mobile stock was checked at 390 pixels. These preview checks were read-only and did not exercise mutations or email callbacks; the existing deployment's functional QA is documented separately.

An independent native-Urdu and shopkeeper usability review remains a release recommendation; automated checks cannot substitute for it.
