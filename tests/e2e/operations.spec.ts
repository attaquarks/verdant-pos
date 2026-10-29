import { test, expect } from "@playwright/test";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
} from "./fixture-config";

test("receiving, damage, a restocked return, expense and CSV keep stock and money reconciled", async ({
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
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.goto(`${APP_ORIGIN}/inventory`);
  const rice = page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Rice" });
  const stock = rice.locator('[data-label="Stock on hand"] strong');
  await rice.getByRole("button", { name: "Receive Fixture Rice", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Receive stock", exact: true });
  await receipt.getByLabel(/^Quantity received/).fill("2");
  await receipt.getByLabel(/^Unit cost/).fill("4.0000");
  await receipt.getByRole("button", { name: "Receive stock", exact: true }).click();
  await expect(receipt).toHaveCount(0);
  await expect(stock).toHaveText("12");
  await rice.getByRole("button", { name: "More actions for Fixture Rice", exact: true }).click();
  await page.getByRole("menuitem", { name: "Adjust stock", exact: true }).click();
  const adjustment = page.getByRole("dialog", { name: "Adjust stock", exact: true });
  await adjustment
    .getByRole("combobox", { name: "Adjustment type", exact: true })
    .selectOption("damage");
  await adjustment.getByLabel(/^Quantity to remove/).fill("1");
  await adjustment.getByLabel(/^Reason/).fill("Damaged package found during receiving");
  await adjustment.getByRole("button", { name: "Record adjustment", exact: true }).click();
  await expect(adjustment).toHaveCount(0);
  await expect(stock).toHaveText("11");
  await rice.getByRole("button", { name: "Sell", exact: true }).click();
  const sale = page.getByRole("dialog", { name: "New sale", exact: true });
  const saleResponse = page.waitForResponse(
    (r) => r.url() === `${APP_ORIGIN}/api/actions/sale` && r.request().method() === "POST",
  );
  await sale.getByRole("button", { name: "Record sale", exact: true }).click();
  const response = await saleResponse;
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as { data: { reference: string } };
  await expect(sale).toHaveCount(0);
  await expect(stock).toHaveText("10");
  await page.goto(`${APP_ORIGIN}/sales`);
  await page
    .getByRole("button", { name: `View sale ${result.data.reference}`, exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: `Sale ${result.data.reference}`, exact: true });
  await detail.getByRole("button", { name: "Return items", exact: true }).click();
  const returned = page.getByRole("dialog", { name: "Return items", exact: true });
  const returnChoice = returned.locator(".return-line").getByRole("checkbox").first();
  await expect(returnChoice).toBeVisible();
  await expect(returnChoice).toBeEnabled();
  await returnChoice.focus();
  await page.keyboard.press("Space");
  await expect(returnChoice).toBeChecked();
  await returned.getByLabel(/^Return reason/).fill("Customer returned unopened package");
  await returned.getByRole("button", { name: "Record return", exact: true }).click();
  await expect(returned).toHaveCount(0);
  await expect(detail.getByText("Returned", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(stock).toHaveText("11");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const imported = page.getByRole("dialog", { name: "Import products", exact: true });
  await imported.locator('input[type="file"]').setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,category,sku,unit,cost_price,selling_price,opening_stock,low_stock_threshold\nFixture Imported Oil,Imported,FIX-OIL,bottle,2.00,3.00,3,1\n",
    ),
  });
  await imported.getByRole("button", { name: "Import products", exact: true }).click();
  await expect(imported).toHaveCount(0);
  await expect(
    page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Imported Oil" }),
  ).toContainText("Imported");
  const csv = await page.request.get(`${APP_ORIGIN}/api/export?type=inventory`);
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Fixture Imported Oil");
  await page.goto(`${APP_ORIGIN}/expenses`);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const expense = page.getByRole("dialog", { name: "Add an expense", exact: true });
  await expense.getByLabel(/^What was it for/).fill("Shop cleaning supplies");
  await expense.getByLabel(/^Expense category/).fill("Maintenance");
  await expense.getByLabel(/^Amount/).fill("2.00");
  await expense.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(expense).toHaveCount(0);
  await expect(page.locator(".expense-total-strip strong")).toHaveText("$2.00");
  await page.goto(`${APP_ORIGIN}/reports?preset=day`);
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Net revenue", { exact: true }) })
      .locator(".metric-value"),
  ).toHaveText("$17.00");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Estimated net profit", { exact: true }) })
      .locator(".metric-value"),
  ).toHaveText("$9.00");
  await page.goto(`${APP_ORIGIN}/cashbook?preset=day`);
  await expect(page.locator(".data-table tbody")).toContainText("Supplier payment");
  await expect(page.locator(".data-table tbody")).toContainText("Refund");
  await expect(page.locator(".data-table tbody")).toContainText("Shop cleaning supplies");
  expect(errors).toEqual([]);
});
