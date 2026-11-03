import { test, expect } from "@playwright/test";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
} from "./fixture-config";

test("four dashboard cards work and outstanding udhaar includes all dates until fully paid", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(reset.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const baseline = await page.evaluate(() => ({
    font: getComputedStyle(document.body).fontSize,
    sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().width,
    topbar: document.querySelector(".topbar")!.getBoundingClientRect().height,
  }));
  expect(baseline).toEqual({ font: "14px", sidebar: 224, topbar: 65 });
  const logo = page.getByRole("button", { name: "Collapse sidebar" });
  await logo.click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect((await page.locator(".sidebar").boundingBox())!.width).toBe(72);
  await page
    .locator(".sidebar")
    .getByRole("link", { name: /^Inventory/ })
    .click();
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  expect((await page.locator(".sidebar").boundingBox())!.width).toBe(224);
  await page.getByRole("button", { name: "اردو میں استعمال کریں" }).click();
  await page.getByRole("button", { name: /سائیڈ بار چھوٹا کریں/ }).click();
  const rtlSidebar = (await page.locator(".sidebar").boundingBox())!;
  expect(rtlSidebar.width).toBe(72);
  expect(rtlSidebar.x).toBe(1440 - 72);
  await page.getByRole("button", { name: /سائیڈ بار کھولیں/ }).click();
  await page.getByRole("button", { name: "Use in English" }).click();
  await page.goto(APP_ORIGIN);
  const tasks = page.locator(".daily-tasks");
  await expect(tasks.locator(".task-card")).toHaveCount(4);
  for (const description of [
    "Choose maal, then cash, digital or udhaar.",
    "See what is left. Receive new deliveries here.",
    "Open a credit sale and record the money received.",
    "Rent, electricity or transport — keep a clear record.",
  ])
    await expect(tasks.getByText(description, { exact: true })).toBeVisible();
  await expect(page.locator(".metric-grid .metric")).toHaveCount(4);
  await expect(page.locator(".metric-grid .metric-detail")).toHaveCount(0);
  await expect(page.locator(".page-footnote")).toHaveCount(0);
  await tasks.getByRole("button", { name: /Sell to a customer/ }).click();
  const newSale = page.getByRole("dialog", { name: "New sale", exact: true });
  await expect(newSale).toBeVisible();
  await expect(newSale).toContainText("No money is transferred by this app.");
  await newSale.getByText("Credit / pay later", { exact: true }).click();
  await expect(newSale).toContainText("Creates an outstanding balance, not a cash receipt.");
  await page.keyboard.press("Escape");
  await tasks.getByRole("link", { name: /Check stock/ }).click();
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await page.goto(APP_ORIGIN);
  await tasks.getByRole("link", { name: /Record a daily expense/ }).click();
  await expect(page.getByRole("heading", { name: "Expenses/Kharchay", exact: true })).toBeVisible();
  await page.goto(APP_ORIGIN);
  await tasks.getByRole("link", { name: /Collect udhaar/ }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/sales?due=1`);
  await expect(
    page.getByText("Outstanding udhaar: unpaid credit sales from all dates."),
  ).toBeVisible();
  // A deliberately unrelated old date range must not hide outstanding dues.
  await page.goto(`${APP_ORIGIN}/sales?due=1&from=2000-01-01&to=2000-01-02`);
  const row = page.locator(".sales-table tbody tr").filter({ hasText: "Fixture Credit Customer" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$7.00 due");
  const exported = await page.request.get(`${APP_ORIGIN}/api/export?type=sales&due=1`);
  expect(exported.ok()).toBe(true);
  const csv = await exported.text();
  expect(csv).toContain("Fixture Credit Customer");
  expect(csv).not.toContain("Fixture Rice");
  await row.getByRole("button", { name: /View sale/ }).click();
  const detail = page.getByRole("dialog").first();
  await expect(detail).not.toContainText(
    "Prices, discounts, and costs above are the original historical snapshots.",
  );
  await detail.getByRole("button", { name: "Reverse entire sale", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Reverse the entire sale?", exact: true });
  await expect(reversal).toContainText(
    "permanent reversal, restocks every original item, and refunds any money due",
  );
  await expect(reversal).toContainText("This cannot be undone.");
  await expect(reversal).toContainText(
    "Unpaid credit is cancelled without creating a cash refund.",
  );
  await reversal.getByRole("button", { name: "Keep sale", exact: true }).click();
  await detail.getByRole("button", { name: "Collect payment", exact: true }).click();
  let collect = page.getByRole("dialog", { name: "Collect credit payment", exact: true });
  await collect.getByRole("spinbutton").fill("3");
  await collect.getByRole("button", { name: "Record collection", exact: true }).click();
  await expect(collect).toHaveCount(0);
  await expect(
    detail
      .locator("dt")
      .filter({ hasText: /Balance due/ })
      .locator("..")
      .locator("dd"),
  ).toHaveText("$4.00");
  await detail.getByRole("button", { name: "Collect payment", exact: true }).click();
  collect = page.getByRole("dialog", { name: "Collect credit payment", exact: true });
  await collect.getByRole("spinbutton").fill("4");
  await collect.getByRole("button", { name: "Record collection", exact: true }).click();
  await expect(collect).toHaveCount(0);
  await expect(
    detail
      .locator("dt")
      .filter({ hasText: /Balance due/ })
      .locator("..")
      .locator("dd"),
  ).toHaveText("$0.00");
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No unpaid credit sales", exact: true }),
  ).toBeVisible();
  const after = await request.get(`${FIXTURE_ORIGIN}/__fixture/state`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  const snapshot = await after.json();
  expect(snapshot.counts.sales).toBe(2);
  expect(snapshot.counts.payments).toBe(3);
  expect(snapshot.counts.cashbook).toBe(3);
});
