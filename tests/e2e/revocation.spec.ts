import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { USERS } from "../helpers/database";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_NAMES,
  FIXTURE_PUBLISHABLE_KEY,
  type FixtureState,
} from "./fixture-config";

test("revoked staff lose page, API and direct SQL access while their history is retained", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const reset = await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
  });
  expect(reset.ok()).toBe(true);
  const fixture = (await reset.json()) as FixtureState;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.staff.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.staff.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.goto(`${APP_ORIGIN}/inventory`);
  await page.getByRole("button", { name: "New category", exact: true }).click();
  const category = page.getByRole("dialog", { name: "New category", exact: true });
  await category.getByLabel(/^Category name/).fill("Staff offboarding audit fixture");
  await category.getByRole("button", { name: "Create category", exact: true }).click();
  await expect(category).toHaveCount(0);

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const owner = createClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, options);
  const staff = createClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, options);
  try {
    expect((await owner.auth.signInWithPassword(FIXTURE_CREDENTIALS.owner)).error).toBeNull();
    const revoked = await owner.rpc("revoke_staff", {
      p_shop_id: fixture.fixture.shopId,
      p_user_id: USERS.staff,
      p_reason: "Staff offboarding browser test",
      p_request_id: randomUUID(),
    });
    expect(revoked.error).toBeNull();
    expect(revoked.data).toEqual({ id: USERS.staff, is_active: false });
    await page.goto(`${APP_ORIGIN}/inventory`);
    await expect(page).toHaveURL(`${APP_ORIGIN}/access-revoked`);
    await expect(page.getByRole("heading", { name: "Access revoked", exact: true })).toBeVisible();
    await expect(page.getByText(FIXTURE_NAMES.shop, { exact: true })).toHaveCount(0);
    await expect(page.locator(".inventory-table")).toHaveCount(0);
    const rejected = await page.request.get(`${APP_ORIGIN}/api/products`);
    expect(rejected.status()).toBe(403);
    expect(await rejected.json()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/revoked/),
    });
    const bootstrap = await page.request.post(`${APP_ORIGIN}/api/actions/shop`, {
      headers: { origin: APP_ORIGIN },
      data: {
        request_id: randomUUID(),
        mode: "create",
        name: "Cannot escape revocation",
        currency: "USD",
        time_zone: "UTC",
      },
    });
    expect(bootstrap.status()).toBe(403);
    expect((await staff.auth.signInWithPassword(FIXTURE_CREDENTIALS.staff)).error).toBeNull();
    const products = await staff.from("products").select("id");
    expect(products.error).toBeNull();
    expect(products.data).toEqual([]);
    const membership = await staff.from("shop_memberships").select("user_id,is_active");
    expect(membership.data).toEqual([{ user_id: USERS.staff, is_active: false }]);
    const saved = await owner
      .from("categories")
      .select("id")
      .eq("name", "Staff offboarding audit fixture");
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    const violation = await staff.rpc("create_category", {
      p_shop_id: fixture.fixture.shopId,
      p_name: "No longer allowed",
      p_request_id: randomUUID(),
    });
    expect(violation.error?.code).toBe("42501");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(`${APP_ORIGIN}/login`);
  } finally {
    await owner.auth.signOut();
    await staff.auth.signOut();
  }
  expect(errors).toEqual([]);
});
