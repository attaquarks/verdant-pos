import { test, expect } from "@playwright/test";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
} from "./fixture-config";

test("photo creation, lost response retry, fixed thumbnail, product card, replacement and tenant isolation", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  expect(
    (
      await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
        headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
      })
    ).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.goto(`${APP_ORIGIN}/inventory`);
  await expect(page.getByRole("heading", { name: "Inventory (maal)", exact: true })).toBeVisible();
  const rice = page.locator(".inventory-table tbody tr").filter({ hasText: "Fixture Rice" });
  const baseline = (await rice.boundingBox())!.height;
  const first = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#aa2211" },
  })
    .png()
    .toBuffer();
  const second = await sharp({
    create: { width: 80, height: 120, channels: 3, background: "#1155aa" },
  })
    .png()
    .toBuffer();
  let intercepted = false;
  const attempts: { id: string | undefined; bytes: string }[] = [];
  await page.route("**/api/products/*/photo", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const req = route.request();
    attempts.push({
      id: req.headers()["x-photo-request-id"],
      bytes: req.postDataBuffer()!.toString("base64"),
    });
    if (!intercepted) {
      intercepted = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add a product", exact: true });
  await editor.getByLabel(/^Product name/).fill("QA Photo Notebook");
  await editor.getByLabel(/^Selling price/).fill("12");
  await editor.getByLabel("Opening stock", { exact: true }).fill("4");
  await editor
    .getByLabel(/^Product photo/)
    .setInputFiles({ name: "notebook.png", mimeType: "image/png", buffer: first });
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/actions/product") && r.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Add product", exact: true }).click();
  const saved = await created;
  expect(saved.status()).toBe(200);
  const productId = (await saved.json()).data.id;
  await expect(
    editor.getByText("Product saved. Retry the photo or continue.", { exact: true }),
  ).toBeVisible();
  const state = await request.get(`${FIXTURE_ORIGIN}/__fixture/state`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(
    (await state.json()).products.filter((p: { name: string }) => p.name === "QA Photo Notebook"),
  ).toHaveLength(1);
  await editor.getByRole("button", { name: "Retry photo", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].id).toBe(attempts[1].id);
  expect(attempts[0].bytes).toBe(attempts[1].bytes);
  const row = page.locator(".inventory-table tbody tr").filter({ hasText: "QA Photo Notebook" });
  await expect(row).toBeVisible();
  const image = row.locator(".product-thumbnail img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0))
    .toBe(true);
  const thumb = (await row.locator(".product-thumbnail").boundingBox())!;
  expect(thumb.width).toBe(36);
  expect(thumb.height).toBe(36);
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(baseline + 0.5);
  await page.screenshot({ path: "artifacts/screenshots/photo-inventory.png" });
  await row.locator(".product-name-button").click();
  const card = page.getByRole("dialog", { name: "QA Photo Notebook", exact: true });
  await expect(card.getByRole("img", { name: "QA Photo Notebook" })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/photo-card.png" });
  await expect(card).toContainText("$12.00");
  await expect(card).toContainText("4 unit");
  await card.getByRole("button", { name: "Stock movements", exact: true }).click();
  const movements = page.getByRole("dialog", { name: "Stock movements", exact: true });
  await expect(movements.getByText("opening", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "Stock movements", exact: true })).toBeFocused();
  await card
    .getByLabel(/^Product photo/)
    .setInputFiles({ name: "blue.png", mimeType: "image/png", buffer: second });
  const oldSrc = await card.getByRole("img", { name: "QA Photo Notebook" }).getAttribute("src");
  await card.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(card.getByText("Photo saved.", { exact: true })).toBeVisible();
  await expect
    .poll(() => card.getByRole("img", { name: "QA Photo Notebook" }).getAttribute("src"))
    .not.toBe(oldSrc);
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  const persisted = page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: "QA Photo Notebook" })
    .locator(".product-thumbnail img");
  await expect(persisted).toBeVisible();
  await expect
    .poll(() => persisted.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0))
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileThumb = (await page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: "QA Photo Notebook" })
    .locator(".product-thumbnail")
    .boundingBox())!;
  expect(mobileThumb.width).toBe(37);
  expect(mobileThumb.height).toBe(37);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: "artifacts/screenshots/photo-mobile.png", fullPage: true });
  const outsider = await browser.newContext({ baseURL: APP_ORIGIN });
  const otherPage = await outsider.newPage();
  await otherPage.goto("/login");
  await otherPage
    .getByLabel("Email address", { exact: true })
    .fill(FIXTURE_CREDENTIALS.other.email);
  await otherPage.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.other.password);
  await otherPage.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(otherPage.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  expect((await outsider.request.get(`/api/products/${productId}/photo`)).status()).toBe(404);
  await outsider.close();
});
