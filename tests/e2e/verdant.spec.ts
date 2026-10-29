import { randomUUID } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  APP_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_NAMES,
  FIXTURE_ORIGIN,
  type FixtureState,
} from "./fixture-config";

const controls = { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE };
async function snapshot(request: APIRequestContext): Promise<FixtureState> {
  const response = await request.get(`${FIXTURE_ORIGIN}/__fixture/state`, { headers: controls });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as FixtureState;
}
const test = base.extend<{ fixture: FixtureState; browserHealth: void }>({
  fixture: async ({ request }, provide) => {
    const ready = await request.get(`${FIXTURE_ORIGIN}/__fixture/ready`);
    expect(ready.ok(), "Start the test-only PGlite fixture before Next/Playwright").toBeTruthy();
    const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, { headers: controls });
    expect(reset.ok()).toBeTruthy();
    await provide((await reset.json()) as FixtureState);
  },
  browserHealth: [
    async ({ page }, provide) => {
      const errors: string[] = [],
        external: string[] = [],
        serverFailures: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 500) serverFailures.push(`${response.status()} ${response.url()}`);
      });
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          ![APP_ORIGIN, FIXTURE_ORIGIN].includes(url.origin)
        ) {
          external.push(url.origin);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      await provide();
      expect(errors, "No unhandled browser exceptions").toEqual([]);
      expect(serverFailures, "No unexpected Next/fixture server failures").toEqual([]);
      expect(external, "Browser tests must stay offline and local").toEqual([]);
    },
    { auto: true },
  ],
});

// This entire file shares ONE mutable in-memory SQL fixture. Explicit default
// mode keeps it sequential even if the parent config enables fullyParallel.
// Use one Chromium project, workers: 1, and no parallel manual reset calls.
test.describe.configure({ mode: "default" });
test.setTimeout(180_000);

async function signIn(page: Page) {
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({
    timeout: 45_000,
  });
}
async function inventory(page: Page) {
  await signIn(page);
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
}
function productRow(page: Page, name: string) {
  return page
    .locator(".inventory-table tbody tr")
    .filter({ has: page.getByRole("button", { name: new RegExp(`^${name}`) }) });
}
function stock(page: Page, name: string) {
  return productRow(page, name).locator('[data-label="Stock on hand"] strong');
}
function metric(page: Page, label: string) {
  return page
    .locator(".metric")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator(".metric-value");
}
function actionResponse(page: Page, action: string) {
  return page.waitForResponse(
    (response) =>
      response.url() === `${APP_ORIGIN}/api/actions/${action}` &&
      response.request().method() === "POST",
  );
}
function salePayload(productId: string, quantity: string) {
  return {
    request_id: randomUUID(),
    items: [{ product_id: productId, quantity, unit_price: "5.00", discount: "0.00" }],
    payment_method: "cash",
    customer_name: null,
    customer_contact: null,
    note: null,
  };
}

// Uses the real login form and Supabase SDK cookie/session path. Nothing stubs
// page routes, fetch, requireShop, createServerSupabase, or application APIs.
test("login rejects bad credentials, persists SSR auth cookies, and signs out", async ({
  page,
  fixture,
  request,
}) => {
  expect(fixture.products).toHaveLength(4);
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(page).toHaveURL(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-fixture-password");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toContainText("Invalid login credentials");
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({
    timeout: 45_000,
  });
  const cookies = await page.context().cookies(APP_ORIGIN);
  expect(
    cookies.some(
      (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name) && cookie.value.length > 20,
    ),
    "The real @supabase/ssr client writes its normal session cookie",
  ).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  expect((await snapshot(request)).calls.getUser).toBeGreaterThan(0);
  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/login`);
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(page).toHaveURL(`${APP_ORIGIN}/login`);
});

test("inventory renders real seeded stock, category embedding, filters, search, and movements", async ({
  page,
  fixture,
}) => {
  await inventory(page);
  await expect(page.locator(".inventory-table tbody tr")).toHaveCount(4);
  await expect(stock(page, FIXTURE_NAMES.rice)).toHaveText("10"); // 12 opening - 2 seeded sale, not a UI constant.
  await expect(stock(page, FIXTURE_NAMES.tea)).toHaveText("7");
  await expect(productRow(page, FIXTURE_NAMES.rice)).toContainText(FIXTURE_NAMES.category);
  await expect(page.getByText(FIXTURE_NAMES.other, { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Filter by stock status" }).selectOption("low");
  await expect(page.locator(".inventory-table tbody tr")).toHaveCount(1);
  await expect(productRow(page, FIXTURE_NAMES.soap)).toBeVisible();
  await page.getByRole("combobox", { name: "Filter by stock status" }).selectOption("out");
  await expect(
    productRow(page, FIXTURE_NAMES.empty).getByRole("button", { name: "Sell", exact: true }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Filter by stock status" }).selectOption("all");
  await page
    .getByRole("combobox", { name: "Filter by category" })
    .selectOption(fixture.fixture.categoryId);
  await expect(page.locator(".inventory-table tbody tr")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search products", exact: true }).fill("FIX-RICE");
  await page.getByRole("button", { name: "Search inventory", exact: true }).click();
  await expect(page.locator(".inventory-table tbody tr")).toHaveCount(1);
  const riceButton = productRow(page, FIXTURE_NAMES.rice).getByRole("button", {
    name: /^Fixture Rice/,
  });
  await riceButton.click();
  const movements = page.getByRole("dialog", { name: "Stock movements", exact: true });
  await expect(movements.getByText("sale", { exact: true })).toBeVisible();
  await expect(movements.getByText("opening", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(movements).toHaveCount(0);
  await expect(riceButton).toBeFocused();
});

test("add product goes through the real Next action and SQL save_product RPC", async ({
  page,
  fixture,
  request,
}) => {
  await inventory(page);
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a product", exact: true });
  await dialog.getByLabel(/^Product name/).fill("Fixture Browser Notebook");
  await dialog.getByLabel(/^SKU/).fill("FIX-UI-NOTEBOOK");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption(fixture.fixture.categoryId);
  await dialog.getByLabel(/^Unit \*/).fill("piece");
  await dialog.getByLabel(/^Selling price/).fill("4.25");
  await dialog.getByLabel(/^Unit cost/).fill("1.50");
  await dialog.getByLabel("Opening stock", { exact: true }).fill("6");
  await dialog.getByLabel(/^Low-stock alert at/).fill("2");
  const saved = actionResponse(page, "product");
  await dialog.getByRole("button", { name: "Add product", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const result = (await response.json()) as { ok: boolean; data: { id: string } };
  expect(result.ok).toBe(true);
  expect(result.data.id).toBeTruthy();
  await expect(dialog).toHaveCount(0);
  await expect(stock(page, "Fixture Browser Notebook")).toHaveText("6");
  await expect(productRow(page, "Fixture Browser Notebook")).toContainText("$4.25");
  const state = await snapshot(request);
  expect(state.products).toHaveLength(5);
  expect(state.products.find((product) => product.id === result.data.id)?.category_id).toBe(
    fixture.fixture.categoryId,
  );
  expect(state.counts.movements).toBe(fixture.counts.movements + 1);
});

test("quick cash sale decreases stock once, including an identical HTTP retry", async ({
  page,
  fixture,
  request,
}) => {
  await inventory(page);
  await productRow(page, FIXTURE_NAMES.rice)
    .getByRole("button", { name: "Sell", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New sale", exact: true });
  await dialog
    .getByRole("spinbutton", { name: `Quantity for ${FIXTURE_NAMES.rice}`, exact: true })
    .fill("2");
  const recorded = actionResponse(page, "sale");
  await dialog.getByRole("button", { name: "Record sale", exact: true }).click();
  const response = await recorded;
  expect(response.status()).toBe(200);
  const original = (await response.json()) as {
    ok: boolean;
    data: { id: string; reference: string };
  };
  expect(original.ok).toBe(true);
  const payload = response.request().postDataJSON() as Record<string, unknown>;
  await expect(dialog).toHaveCount(0);
  await expect(stock(page, FIXTURE_NAMES.rice)).toHaveText("8");
  const after = await snapshot(request);
  expect(after.counts.sales).toBe(fixture.counts.sales + 1);
  expect(after.counts.payments).toBe(fixture.counts.payments + 1);
  expect(after.counts.movements).toBe(fixture.counts.movements + 1);
  expect(after.counts.cashbook).toBe(fixture.counts.cashbook + 1);
  // Real same-origin Next API retry; same request_id, same payload. No UI stub.
  const retry = await page.request.post(`${APP_ORIGIN}/api/actions/sale`, {
    headers: { origin: APP_ORIGIN },
    data: payload,
  });
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toEqual(original);
  const replayed = await snapshot(request);
  expect(replayed.counts).toEqual(after.counts);
  expect(replayed.products).toEqual(after.products);
  await page.reload();
  await expect(stock(page, FIXTURE_NAMES.rice)).toHaveText("8");
});

test("oversell is blocked in the form and rejected atomically by SQL, including stale UI stock", async ({
  page,
  fixture,
  request,
}) => {
  await inventory(page);
  await productRow(page, FIXTURE_NAMES.rice)
    .getByRole("button", { name: "Sell", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New sale", exact: true });
  const quantity = dialog.getByRole("spinbutton", {
    name: `Quantity for ${FIXTURE_NAMES.rice}`,
    exact: true,
  });
  await quantity.fill("11");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Only 10 piece available.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Record sale", exact: true }).click();
  expect(await quantity.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(
    true,
  );
  expect((await snapshot(request)).counts).toEqual(fixture.counts);
  const rejected = await page.request.post(`${APP_ORIGIN}/api/actions/sale`, {
    headers: { origin: APP_ORIGIN },
    data: salePayload(fixture.fixture.products.rice, "11.000"),
  });
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({
    ok: false,
    error: expect.stringMatching(/stock/i),
  });
  const afterRejection = await snapshot(request);
  expect(afterRejection.counts).toEqual(fixture.counts);
  expect(afterRejection.products).toEqual(fixture.products);
  // Simulate another checkout after the dialog read its stock (10). The form's
  // valid quantity (2) now exceeds the database stock (1); surface SQL's error.
  await quantity.fill("2");
  const competing = await page.request.post(`${APP_ORIGIN}/api/actions/sale`, {
    headers: { origin: APP_ORIGIN },
    data: salePayload(fixture.fixture.products.rice, "9.000"),
  });
  expect(competing.status()).toBe(200);
  const beforeStale = await snapshot(request);
  const stale = actionResponse(page, "sale");
  await dialog.getByRole("button", { name: "Record sale", exact: true }).click();
  expect((await stale).status()).toBe(409);
  await expect(dialog.getByRole("alert")).toContainText(/stock/i);
  const afterStale = await snapshot(request);
  expect(afterStale.counts).toEqual(beforeStale.counts);
  expect(afterStale.products).toEqual(beforeStale.products);
  expect(
    Number(
      afterStale.products.find((product) => product.id === fixture.fixture.products.rice)!
        .current_stock,
    ),
  ).toBe(1);
});

test("credit sale and digital collection change receivable/cashbook but never duplicate revenue", async ({
  page,
  fixture,
  request,
}) => {
  await inventory(page);
  await productRow(page, FIXTURE_NAMES.tea)
    .getByRole("button", { name: "Sell", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New sale", exact: true });
  await dialog
    .getByRole("spinbutton", { name: `Quantity for ${FIXTURE_NAMES.tea}`, exact: true })
    .fill("2");
  await dialog.getByRole("radio", { name: "Credit / pay later", exact: true }).check();
  await dialog.getByLabel(/^Customer name/).fill("Fixture Browser Credit Customer");
  const recorded = actionResponse(page, "sale");
  await dialog.getByRole("button", { name: "Record credit sale", exact: true }).click();
  const saleResponse = await recorded;
  expect(saleResponse.status()).toBe(200);
  const result = (await saleResponse.json()) as { data: { id: string; reference: string } };
  await expect(dialog).toHaveCount(0);
  await expect(stock(page, FIXTURE_NAMES.tea)).toHaveText("5");
  const afterSale = await snapshot(request);
  expect(afterSale.sales.find((sale) => sale.id === result.data.id)?.balance_due).toBe("14.00");
  expect(afterSale.counts.payments).toBe(fixture.counts.payments);
  expect(afterSale.counts.cashbook).toBe(fixture.counts.cashbook);
  await page.goto(`${APP_ORIGIN}/sales`);
  const row = page
    .locator(".sales-table tbody tr")
    .filter({ hasText: "Fixture Browser Credit Customer" });
  await expect(row).toContainText("$14.00 due");
  await row
    .getByRole("button", { name: `View sale ${result.data.reference}`, exact: true })
    .click();
  const details = page.getByRole("dialog", { name: `Sale ${result.data.reference}`, exact: true });
  await details.getByRole("button", { name: "Collect payment", exact: true }).click();
  const collect = page.getByRole("dialog", { name: "Collect credit payment", exact: true });
  await expect(collect.getByRole("spinbutton")).toHaveValue("14.00");
  await collect
    .getByRole("combobox", { name: "Payment method", exact: true })
    .selectOption("digital");
  const collected = actionResponse(page, "collect");
  await collect.getByRole("button", { name: "Record collection", exact: true }).click();
  expect((await collected).status()).toBe(200);
  await expect(collect).toHaveCount(0);
  await expect(details.getByText(/Payment collected and added to the cashbook/)).toBeVisible();
  await expect(
    details
      .locator("dt")
      .filter({ hasText: /^Balance due$/ })
      .locator("..")
      .locator("dd"),
  ).toHaveText("$0.00");
  const afterCollection = await snapshot(request);
  expect(afterCollection.counts.sales).toBe(afterSale.counts.sales);
  expect(afterCollection.counts.payments).toBe(afterSale.counts.payments + 1);
  expect(afterCollection.counts.cashbook).toBe(afterSale.counts.cashbook + 1);
  expect(afterCollection.products).toEqual(afterSale.products);
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`${APP_ORIGIN}/reports`);
  await expect(metric(page, "Net revenue")).toHaveText("$31.00"); // 17 seed + 14 credit; collection is NOT another sale.
  await expect(
    page.getByText("Digital received", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("$14.00");
});

test("all seven destinations navigate and reports show real SQL aggregates", async ({
  page,
  fixture,
  request,
}) => {
  await signIn(page);
  for (const [path, label, heading] of [
    ["/inventory", "Inventory", "Inventory"],
    ["/sales", "Sales", "Sales"],
    ["/reports", "Reports", "Reports"],
    ["/cashbook", "Cashbook", "Cashbook"],
    ["/expenses", "Expenses", "Expenses"],
    ["/settings", "Settings", "Settings"],
    ["/", "Dashboard", "Dashboard"],
  ]) {
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await nav.getByRole("link", { name: new RegExp(`^${label}`) }).click();
    await expect(page).toHaveURL(`${APP_ORIGIN}${path}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await page.goto(`${APP_ORIGIN}/reports`);
  await expect(metric(page, "Net revenue")).toHaveText("$17.00");
  await expect(page.locator(".report-products-table tbody tr")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Revenue trend", exact: true })).toBeVisible();
  const state = await snapshot(request);
  expect(state.counts).toEqual(fixture.counts);
  expect(state.calls.rpcs).toBeGreaterThan(0);
  expect(state.calls.reads).toBeGreaterThan(0);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("mobile menu, dialog Escape/focus return, and layout stay within the viewport", async ({
    page,
    fixture,
  }) => {
    expect(fixture.fixture.shopId).toBeTruthy();
    await signIn(page);
    const open = page.getByRole("button", { name: "Open navigation", exact: true });
    await expect(open).toBeVisible();
    await open.click();
    const menu = page.getByRole("dialog", { name: "Your workspace", exact: true });
    await expect(menu.getByRole("navigation").getByRole("link")).toHaveCount(7);
    await menu.getByRole("link", { name: /^Inventory/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "No horizontal page overflow at 390px",
    ).toBe(true);
    const add = page.getByRole("button", { name: "Add product", exact: true });
    await add.click();
    const editor = page.getByRole("dialog", { name: "Add a product", exact: true });
    await expect(editor.getByLabel(/^Product name/)).toBeFocused();
    const rect = await editor.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(add).toBeFocused();
    await open.click();
    await page
      .getByRole("dialog", { name: "Your workspace", exact: true })
      .getByRole("link", { name: "Reports", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "No horizontal report overflow at 390px",
    ).toBe(true);
  });
});
