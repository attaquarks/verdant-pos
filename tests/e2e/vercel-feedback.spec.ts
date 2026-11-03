import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  APP_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_ORIGIN,
} from "./fixture-config";

test("feedback copy and readable responsive blocks remain intact in English and Urdu", async ({
  page,
  request,
  context,
}) => {
  const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(reset.ok()).toBe(true);
  await mkdir("artifacts/screenshots/vercel-feedback", { recursive: true });
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const paths = [
    ["/", "Dashboard", "آج کا خلاصہ"],
    ["/inventory", "Inventory", "مال / اسٹاک"],
    ["/sales", "Sales", "فروخت"],
    ["/reports", "Reports", "تفصیلی حساب"],
    ["/cashbook", "Cashbook/Khata", "پیسوں کا حساب"],
    ["/expenses", "Expenses/Kharchay", "خرچے"],
    ["/settings", "Settings", "ترتیبات"],
  ];
  // Exact English comes from main at 7bdeedb66251344f7e2ab229a860cd719242ad9c.
  const subtitles: Record<string, { en: string; ur: string }> = {
    "/": {
      en: "A clear view of your shop. Every number comes from your recorded activity.",
      ur: "روز کا حساب ایک نظر میں۔ ہر رقم آپ کے محفوظ لین دین سے آتی ہے۔",
    },
    "/inventory": {
      en: "Your products, stock levels, and everyday stock movements.",
      ur: "اپنا مال، موجودہ مقدار اور روز کا آیا گیا مال دیکھیں۔",
    },
    "/sales": {
      en: "Every sale, payment, and return. A complete record, not a running estimate.",
      ur: "ہر فروخت، ادائیگی اور واپسی کا مکمل ریکارڈ؛ اندازہ نہیں۔",
    },
    "/reports": {
      en: "Sales performance, costs, and cash — with the distinctions that matter.",
      ur: "فروخت، لاگت اور پیسوں کا الگ الگ حساب۔",
    },
    "/cashbook": {
      en: "A chronological record of money in and out. Not the same thing as profit.",
      ur: "آئے اور گئے پیسوں کا تاریخ وار حساب۔ یہ منافع کا حساب نہیں ہے۔",
    },
    "/expenses": {
      en: "Keep daily operating costs out of your head and in your books.",
      ur: "روزمرہ کے خرچے یاد رکھنے کے بجائے یہاں لکھیں۔",
    },
    "/settings": {
      en: "Shop details, reporting preferences, and taking care of your data.",
      ur: "دکان کی تفصیل، حساب کا وقت اور اپنا ریکارڈ محفوظ رکھنا۔",
    },
  };
  for (const locale of ["en", "ur"] as const) {
    await context.addCookies([
      { name: "verdant-locale", value: locale, url: APP_ORIGIN },
      { name: "verdant-theme", value: locale === "ur" ? "night" : "light", url: APP_ORIGIN },
    ]);
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, english, urdu] of paths) {
        await page.goto(`${APP_ORIGIN}${path}`);
        await expect(
          page.getByRole("heading", {
            name: locale === "en" ? english : urdu,
            level: 1,
            exact: true,
          }),
        ).toBeVisible();
        const subtitle = page.locator(".page-heading > div:first-child > h1 + p");
        await expect(subtitle).toHaveCount(1);
        await expect(subtitle).toHaveText(subtitles[path][locale]);
        await expect(subtitle).toBeVisible();
        const descriptions = page.locator(".panel-heading p, .settings-section-description p");
        if (path === "/cashbook" || path === "/expenses") {
          await expect(descriptions).toHaveCount(1);
          const expected =
            path === "/cashbook"
              ? locale === "en"
                ? "paisey ka hisab"
                : "پیسوں کا حساب"
              : locale === "en"
                ? "kharchon ka hisab"
                : "خرچوں کا حساب";
          const ledger =
            path === "/cashbook"
              ? locale === "en"
                ? "Money ledger"
                : "پیسوں کا کھاتا"
              : locale === "en"
                ? "Expense ledger"
                : "خرچوں کا کھاتا";
          await expect(descriptions).toHaveText(expected);
          await expect(
            page.getByRole("heading", { name: ledger, level: 2, exact: true }).locator("+ p"),
          ).toHaveText(expected);
        } else {
          await expect(descriptions).toHaveCount(0);
        }
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ur" ? "rtl" : "ltr");
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${locale} ${width} ${path}`,
        ).toBe(true);
        const size = await page
          .locator("h1")
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(27);
        if (path === "/") {
          await expect(page.locator(".task-card")).toHaveCount(4);
          expect(
            await page
              .locator(".metric-label")
              .first()
              .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
          ).toBeGreaterThanOrEqual(13);
          if (width <= 390) {
            expect(
              await page.locator(".recent-sales-panel .table-link").evaluateAll((links) =>
                links.every((link) => {
                  const rect = link.getBoundingClientRect();
                  const cell = link.parentElement!.getBoundingClientRect();
                  return (
                    rect.left >= cell.left - 1 &&
                    rect.right <= cell.right + 1 &&
                    link.scrollWidth <= link.clientWidth + 1
                  );
                }),
              ),
            ).toBe(true);
          }
          const boxes = await page.locator(".task-card").evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
            }),
          );
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i],
                b = boxes[j];
              expect(
                a.right <= b.x + 1 ||
                  b.right <= a.x + 1 ||
                  a.bottom <= b.y + 1 ||
                  b.bottom <= a.y + 1,
              ).toBe(true);
            }
        }
        if (path === "/reports" && locale === "en") {
          for (const label of ["Gross profit", "Operating expenses", "Estimated net profit"])
            await expect(
              page.locator(".metric-label").getByText(label, { exact: true }),
            ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Profit breakdown", exact: true }),
          ).toBeVisible();
        }
        if ((path === "/" || path === "/reports") && (width === 390 || width === 1440))
          await page.screenshot({
            path: `artifacts/screenshots/vercel-feedback/${locale}-${width}-${path === "/" ? "dashboard" : "reports"}.png`,
            fullPage: true,
            animations: "disabled",
          });
      }
    }
  }
});
