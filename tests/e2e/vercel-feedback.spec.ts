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
