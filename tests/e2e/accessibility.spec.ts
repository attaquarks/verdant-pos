import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_ORIGIN,
} from "./fixture-config";

test("WCAG checks and desktop/mobile workflow screenshots use only isolated SQL fixtures", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(reset.ok()).toBe(true);
  await mkdir("artifacts/screenshots", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${APP_ORIGIN}/login`);
  async function audit(screen: string) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        targets: v.nodes.flatMap((n) => n.target),
      })),
      `WCAG violations on ${screen}`,
    ).toEqual([]);
  }
  await audit("login");
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  for (const [path, title] of [
    ["/", "Dashboard"],
    ["/inventory", "Inventory"],
    ["/reports", "Reports"],
    ["/sales", "Sales"],
    ["/cashbook", "Cashbook"],
    ["/expenses", "Expenses"],
    ["/settings", "Settings"],
  ]) {
    await page.goto(`${APP_ORIGIN}${path}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await audit(title);
    if (["Dashboard", "Inventory", "Reports"].includes(title))
      await page.screenshot({
        path: `artifacts/screenshots/${title.toLowerCase()}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  await page.goto(`${APP_ORIGIN}/inventory`);
  const rice = page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Rice" });
  await rice.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "New sale", exact: true })).toBeVisible();
  await audit("quick sale dialog");
  await page.screenshot({
    path: "artifacts/screenshots/quick-sale.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await audit("mobile inventory");
  await page.screenshot({
    path: "artifacts/screenshots/mobile-inventory.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
