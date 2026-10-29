import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
} from "./fixture-config";

test.use({ timezoneId: "Asia/Karachi" });
test("a new authenticated owner configures the shop timezone and completes the first product and sale", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  expect(
    (
      await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
        headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
      })
    ).ok(),
  ).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.outsider.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.outsider.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/onboarding`);
  await expect(page.getByLabel(/^Shop timezone/)).toHaveValue("Asia/Karachi");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByLabel(/^Shop name/).fill("First Shop QA");
  await page.getByLabel(/^Trading currency/).fill("PKR");
  await page.getByRole("button", { name: "Create my shop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(
    page.locator(".metric").filter({ hasText: "Units sold today" }).locator(".metric-value"),
  ).toHaveText("0");
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(
    page.getByRole("heading", { name: "A well-stocked shop starts here", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Fixture Rice", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New category", exact: true }).click();
  const category = page.getByRole("dialog", { name: "New category", exact: true });
  await category.getByLabel(/^Category name/).fill("Essentials");
  await category.getByRole("button", { name: "Create category", exact: true }).click();
  await expect(category).toHaveCount(0);
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const product = page.getByRole("dialog", { name: "Add a product", exact: true });
  await product.getByLabel(/^Product name/).fill("First Notebook");
  await product
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Essentials" });
  await product.getByLabel(/^Selling price/).fill("100.00");
  await product.getByLabel(/^Unit cost/).fill("60.0000");
  await product.getByLabel("Opening stock", { exact: true }).fill("5");
  await product.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(product).toHaveCount(0);
  const row = page.locator(".inventory-table tbody tr").filter({ hasText: "First Notebook" });
  await expect(row.locator('[data-label="Stock on hand"] strong')).toHaveText("5");
  await row.getByRole("button", { name: "Sell", exact: true }).click();
  const sale = page.getByRole("dialog", { name: "New sale", exact: true });
  await sale.getByRole("button", { name: "Record sale", exact: true }).click();
  await expect(sale).toHaveCount(0);
  await expect(row.locator('[data-label="Stock on hand"] strong')).toHaveText("4");
  await page.goto(`${APP_ORIGIN}/reports?preset=day`);
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Net revenue", { exact: true }) })
      .locator(".metric-value"),
  ).toContainText("100.00");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Gross profit", { exact: true }) })
      .locator(".metric-value"),
  ).toContainText("40.00");
  await expect(page.locator(".timezone-note")).toContainText("Asia/Karachi");
  expect(errors).toEqual([]);
});
