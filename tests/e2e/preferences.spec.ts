import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
} from "./fixture-config";

async function audit(page: Page, screen: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
    screen,
  ).toEqual([]);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test("Urdu and night preferences persist from server HTML through all pages and accessible RTL dialogs", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(240000);
  const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(reset.ok()).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|server rendered/i.test(message.text()))
      errors.push(message.text());
  });
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByRole("button", { name: "Night mode" }).click();
  await audit(page, "night English login");
  await page.getByRole("button", { name: "اردو میں استعمال کریں" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  const preferences = (await context.cookies()).filter((c) => c.name.startsWith("verdant-"));
  expect(preferences.find((c) => c.name === "verdant-locale")?.value).toBe("ur");
  expect(preferences.find((c) => c.name === "verdant-theme")?.value).toBe("night");
  expect(
    await page.evaluate(() => [
      localStorage.getItem("verdant-locale"),
      localStorage.getItem("verdant-theme"),
    ]),
  ).toEqual(["ur", "night"]);
  const serverHTML = await (await context.request.get(`${APP_ORIGIN}/login`)).text();
  expect(serverHTML).toMatch(/<html[^>]+lang="ur"[^>]+dir="rtl"[^>]+data-theme="night"/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "خوش آمدید", exact: true })).toBeVisible();
  await audit(page, "night Urdu login");
  await page.screenshot({ path: "artifacts/screenshots/urdu-night-login.png", fullPage: true });
  const email = page.getByLabel("ای میل پتہ", { exact: true });
  await email.fill("not-an-email");
  await page.getByLabel("پاس ورڈ", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "سائن اِن", exact: true }).click();
  expect(await email.evaluate((field: HTMLInputElement) => field.validationMessage)).toContain(
    "درست ای میل",
  );
  await email.fill(FIXTURE_CREDENTIALS.owner.email);
  expect(await email.evaluate((field: HTMLInputElement) => field.validationMessage)).toBe("");
  await page.locator("form").getByRole("button", { name: "سائن اِن", exact: true }).click();
  await expect(page.getByRole("heading", { name: "آج کا خلاصہ", exact: true })).toBeVisible();
  const sidebar = await page.locator(".sidebar").boundingBox();
  expect(sidebar?.x).toBeGreaterThan(1200);
  for (const [path, heading] of [
    ["/", "آج کا خلاصہ"],
    ["/inventory", "مال / اسٹاک"],
    ["/sales", "فروخت"],
    ["/reports", "تفصیلی حساب"],
    ["/cashbook", "پیسوں کا حساب"],
    ["/expenses", "خرچے"],
    ["/settings", "ترتیبات"],
  ]) {
    await page.goto(`${APP_ORIGIN}${path}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await audit(page, `night Urdu ${path}`);
    await noOverflow(page);
    if (path === "/")
      await page.screenshot({
        path: "artifacts/screenshots/urdu-night-dashboard.png",
        fullPage: true,
      });
    if (path === "/settings") {
      await expect(page.locator('input[name="currency"]')).toHaveValue("USD");
      await expect(page.locator('input[name="time_zone"]')).toHaveValue("UTC");
    }
  }
  await page.goto(`${APP_ORIGIN}/inventory`);
  const rice = page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Rice" });
  // User-entered names and existing shop currency are never translated or rewritten.
  await expect(rice).toContainText("Fixture Rice");
  await expect(rice).toContainText("$5.00");
  await rice.getByRole("button", { name: "بیچیں", exact: true }).click();
  const sale = page.getByRole("dialog", { name: "نئی فروخت", exact: true });
  await expect(sale).toBeVisible();
  await audit(page, "night Urdu sale dialog");
  await sale.getByRole("radio").last().check();
  await expect(
    sale.getByText(
      "اس سے ادھار بنتا ہے، نقد وصولی نہیں۔ پیسے ملیں تو فروخت کی فہرست سے وصولی لکھیں۔",
    ),
  ).toBeVisible();
  await sale.getByLabel(/^گاہک کا نام/).fill("محلے کا گاہک");
  await expect(
    sale.getByRole("button", { name: "ادھار فروخت محفوظ کریں", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: "artifacts/screenshots/urdu-night-sale.png", fullPage: true });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await sale.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sale).toHaveCount(0);
  await expect(rice.getByRole("button", { name: "بیچیں", exact: true })).toBeFocused();
  for (const button of ["نئی چیز شامل کریں", "فائل سے شامل کریں", "نئی قسم بنائیں"]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await audit(page, `night Urdu dialog ${button}`);
    await page.keyboard.press("Escape");
  }
  await rice.getByRole("button", { name: /وصول کریں/ }).click();
  await audit(page, "night Urdu receive dialog");
  await page.keyboard.press("Escape");
  for (const item of ["چیز کی تفصیل بدلیں", "مال کی مقدار درست کریں", "فروخت بند کریں"]) {
    await rice.getByRole("button", { name: /مزید کام/ }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await audit(page, `night Urdu inventory dialog ${item}`);
    await page.keyboard.press("Escape");
  }
  for (const [path, action] of [
    ["/expenses", "خرچہ لکھیں"],
    ["/cashbook", "پیسوں کا لین دین لکھیں"],
  ]) {
    await page.goto(`${APP_ORIGIN}${path}`);
    await page.getByRole("button", { name: action, exact: true }).click();
    await audit(page, `night Urdu money dialog ${path}`);
    await page.keyboard.press("Escape");
  }
  await page.goto(`${APP_ORIGIN}/sales?method=credit`);
  await page.locator(".sales-table tbody tr").first().locator(".table-link").click();
  await audit(page, "night Urdu sale details");
  for (const action of ["ادھار وصول کریں", "مال واپس لیں", "پوری فروخت منسوخ کریں"]) {
    await page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
    await audit(page, `night Urdu nested sale dialog ${action}`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await page.goto(`${APP_ORIGIN}/inventory`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  for (const selector of [
    ".mobile-menu-button",
    ".topbar .preference-language",
    ".topbar .preference-theme",
    ".account-trigger",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box!.x, selector).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, selector).toBeLessThanOrEqual(390);
    expect(box!.width, selector).toBeGreaterThanOrEqual(44);
    expect(box!.height, selector).toBeGreaterThanOrEqual(44);
  }
  await audit(page, "night Urdu mobile stock");
  await noOverflow(page);
  await page.screenshot({
    path: "artifacts/screenshots/urdu-night-mobile-stock.png",
    fullPage: true,
  });
  await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  await page
    .locator(".mobile-bottom-nav")
    .getByRole("button", { name: "نئی فروخت", exact: true })
    .click();
  await audit(page, "night Urdu mobile sale dialog");
  await page.screenshot({
    path: "artifacts/screenshots/urdu-night-mobile-sale.png",
    fullPage: true,
  });
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await page.locator(".topbar").getByRole("button", { name: "رات کا رنگ" }).click();
  await audit(page, "light Urdu mobile stock");
  await page.locator(".topbar").getByRole("button", { name: "Use in English" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile action menus stay within the viewport in both directions and stock receipts are Urdu", async ({
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
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await mkdir("artifacts/screenshots", { recursive: true });
  const products = await (
    await page.request.get(`${APP_ORIGIN}/api/products?q=Fixture%20Rice`)
  ).json();
  const product = products.products.find(
    (entry: { name: string }) => entry.name === "Fixture Rice",
  );
  expect(product).toBeTruthy();
  expect(
    (
      await page.request.post(`${APP_ORIGIN}/api/actions/receive`, {
        headers: { origin: APP_ORIGIN, "content-type": "application/json" },
        data: {
          request_id: randomUUID(),
          product_id: product.id,
          quantity: "1",
          unit_cost: "4.0000",
          supplier: null,
          payment_method: "unpaid",
          note: "Local RTL receipt label regression",
        },
      })
    ).ok(),
  ).toBe(true);
  const bounds = async () => {
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 11);
    expect(box.y).toBeGreaterThanOrEqual(11);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 11);
    for (const item of await menu.getByRole("menuitem").all()) await expect(item).toBeVisible();
    await noOverflow(page);
  };
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const locale of ["ur", "en"]) {
      await page.goto(`${APP_ORIGIN}/inventory`);
      const current = await page.locator("html").getAttribute("lang");
      if (current !== locale) await page.locator(".topbar .preference-language").click();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ur" ? "rtl" : "ltr");
      const account = page.locator(".account-trigger");
      await account.click();
      await bounds();
      await expect(
        page.getByRole("menuitem", {
          name: locale === "ur" ? "سائن آؤٹ" : "Sign out",
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(account).toBeFocused();
      const rice = page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Rice" });
      const actions = rice.locator('button[aria-haspopup="menu"]');
      await actions.click();
      await bounds();
      await page.screenshot({ path: `artifacts/screenshots/menu-${locale}-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(actions).toBeFocused();
      if (locale === "ur") {
        await rice.locator(".product-name-button").click();
        const movements = page.getByRole("dialog", { name: "مال کا لین دین", exact: true });
        await expect(movements.getByText("نیا مال وصول ہوا", { exact: true })).toBeVisible();
        await expect(movements.locator(".badge").filter({ hasText: /^receipt$/ })).toHaveCount(0);
        await page.keyboard.press("Escape");
      }
    }
  }
});

test("blocked localStorage still persists cookies and the first render stays consistent", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage disabled");
      },
    });
  });
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByRole("button", { name: "اردو میں استعمال کریں" }).click();
  await page.getByRole("button", { name: "رات کا رنگ" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  const html = await (await context.request.get(`${APP_ORIGIN}/login`)).text();
  expect(html).toContain('data-theme="night"');
  expect(html).toContain('lang="ur"');
});

test.describe("Pakistan defaults independent of browser location", () => {
  test.use({ timezoneId: "America/New_York" });
  test("new shops default to PKR/Karachi even outside Pakistan, without modifying existing shops", async ({
    page,
    request,
  }) => {
    expect(
      (
        await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
          headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(`${APP_ORIGIN}/login`);
    await page
      .getByLabel("Email address", { exact: true })
      .fill(FIXTURE_CREDENTIALS.outsider.email);
    await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.outsider.password);
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${APP_ORIGIN}/onboarding`);
    await expect(page.getByLabel(/^Trading currency/)).toHaveValue("PKR");
    await expect(page.getByLabel(/^Shop timezone/)).toHaveValue("Asia/Karachi");
    await page.getByRole("button", { name: "اردو میں استعمال کریں" }).click();
    await page.getByRole("button", { name: "رات کا رنگ" }).click();
    await audit(page, "night Urdu onboarding");
    await page.getByLabel(/^دکان کی کرنسی/).fill("EUR");
    await page.getByLabel(/^دکان کا وقت/).fill("Europe/Paris");
    // Defaults are editable presentation state, not a forced shop update.
    await expect(page.locator('input[name="currency"]')).toHaveValue("EUR");
    await expect(page.locator('input[name="time_zone"]')).toHaveValue("Europe/Paris");
  });
});
