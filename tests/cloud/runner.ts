import Decimal from "decimal.js";
import { expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, BrowserContext, Page } from "@playwright/test";

type Account = { id: string; email: string; password: string };
type Accounts = {
  tag: string;
  origin: string;
  supabaseProjectRef: string;
  accounts: Record<"owner" | "staff" | "outsider", Account>;
};
type Evidence = { name: string; status: "pass" | "fail" | "blocked"; detail?: unknown };
type State = { ownerShop?: string; outsiderShop?: string; [key: string]: unknown };
const dir = "artifacts/cloud";
mkdirSync(dir, { recursive: true });
const accountPath = process.env.CLOUD_QA_ACCOUNTS || "/agent/workspace/.cloud-qa-accounts.json";
assert.equal(statSync(accountPath).mode & 0o077, 0, "Credential file must be mode 600 or stricter");
const accounts = JSON.parse(readFileSync(accountPath, "utf8")) as Accounts;
const env = Object.fromEntries(
  readFileSync(process.env.CLOUD_QA_ENV || "/agent/workspace/.cloud-staging.env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const origin = accounts.origin;
assert.equal(origin, "https://verdant-pos-tau.vercel.app");
assert.match(
  accounts.supabaseProjectRef,
  /^[a-z]{20}$/,
  "Explicit approved project reference required in the protected QA account file",
);
assert.equal(
  new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,
  `${accounts.supabaseProjectRef}.supabase.co`,
);
for (const account of Object.values(accounts.accounts)) {
  assert(account.email.endsWith(".test"), "Only isolated .test accounts permitted");
  assert.match(account.id, /^[0-9a-f-]{36}$/);
}
const statePath = `${dir}/state.json`;
const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const evidence: Evidence[] = [];
function save() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  writeFileSync(
    `${dir}/${process.env.CLOUD_QA_PHASE || "verify"}-evidence.json`,
    JSON.stringify({ at: new Date().toISOString(), origin, checks: evidence }, null, 2),
  );
}
function record(name: string, status: Evidence["status"], detail?: unknown) {
  evidence.push({ name, status, detail });
  console.log(
    `${status.toUpperCase()}: ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`,
  );
  save();
}
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const detail = await fn();
    record(name, "pass", detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "check failed";
    const safe = Object.values(accounts.accounts).reduce(
      (s, a) => s.replaceAll(a.email, "[QA email]").replaceAll(a.password, "[REDACTED]"),
      message,
    );
    const redacted = safe
      .replaceAll(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "[REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]");
    record(name, "fail", redacted.slice(0, 1200));
  }
}
function client() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function signIn(role: keyof Accounts["accounts"]) {
  const c = client();
  const a = accounts.accounts[role];
  const { error } = await c.auth.signInWithPassword({ email: a.email, password: a.password });
  assert.equal(error?.code, undefined, "QA auth failed");
  return c;
}
async function uiLogin(page: Page, role: keyof Accounts["accounts"]) {
  await page.goto(`${origin}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(accounts.accounts[role].email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.accounts[role].password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 30000 });
  await page
    .getByRole("heading", { name: /^(Dashboard|Make it your shop\.|Access revoked)$/ })
    .first()
    .waitFor({ timeout: 30000 });
}
async function action(
  context: BrowserContext,
  name: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const r = await context.request.post(`${origin}/api/actions/${name}`, {
    headers: { origin, "content-type": "application/json", ...headers },
    data: { request_id: randomUUID(), ...payload },
  });
  return { status: r.status(), body: await r.json() };
}
async function good(context: BrowserContext, name: string, payload: Record<string, unknown>) {
  const r = await action(context, name, payload);
  assert.equal(r.status, 200, `${name} status ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.ok, true);
  return r.body.data;
}
async function rows(c: SupabaseClient, table: string, shop: string, columns = "*") {
  const r = await c.from(table).select(columns).eq("shop_id", shop);
  assert.equal(r.error, null, `${table} read failed`);
  return r.data as unknown as Record<string, unknown>[];
}
async function stock(c: SupabaseClient, id: string) {
  const r = await c.from("products").select("current_stock").eq("id", id).single();
  assert.equal(r.error, null);
  return Number(r.data.current_stock);
}
async function createProduct(
  ctx: BrowserContext,
  name: string,
  qty: string,
  price = "10.00",
  cost = "4.0000",
  category: string | null = null,
) {
  return good(ctx, "product", {
    product_id: null,
    product: {
      name,
      category_id: category,
      sku: `QA-${randomUUID().slice(0, 8)}`,
      barcode: null,
      unit: "each",
      cost_price: cost,
      selling_price: price,
      opening_stock: qty,
      low_stock_threshold: "2",
      is_active: true,
    },
  });
}
function salePayload(product: string, qty = "1", price = "10.00", method = "cash") {
  return {
    items: [{ product_id: product, quantity: qty, unit_price: price, discount: "0.00" }],
    payment_method: method,
    customer_name: method === "credit" ? "QA Synthetic Customer" : null,
    customer_contact: null,
    note: "QA hosted test",
  };
}

export async function runCloudQA(browser: Browser) {
  assert.equal(process.env.CLOUD_QA, "1", "Explicit real-cloud opt-in required");
  assert(!process.env.PWDEBUG && !process.env.DEBUG, "Disable debug logging with real credentials");
  assert(
    ["bootstrap", "verify", "confirm", "supplemental", "final"].includes(
      process.env.CLOUD_QA_PHASE || "verify",
    ),
    "Unknown phase; refusing unintended mutations",
  );
  const ctx = await browser.newContext({ baseURL: origin });
  const page = await ctx.newPage();
  const owner = await signIn("owner");
  const probe = await action(ctx, "category", { name: "" });
  if (probe.status !== 400) {
    record("Origin configuration preflight", "fail", {
      status: probe.status,
      error: probe.body.error,
    });
    await ctx.close();
    throw new Error(
      "STOP: hosted origin validation preflight failed; no business mutations attempted",
    );
  }
  record("Origin configuration preflight", "pass", { status: probe.status });
  if (process.env.CLOUD_QA_PHASE === "bootstrap") {
    await check("Real login rejects incorrect password", async () => {
      const c = client();
      const r = await c.auth.signInWithPassword({
        email: accounts.accounts.owner.email,
        password: randomUUID(),
      });
      assert(r.error);
      assert.equal(r.data.session, null);
      return { code: r.error.code, status: r.error.status };
    });
    for (const role of ["owner", "outsider"] as const) {
      await uiLogin(page, role);
      const c = role === "owner" ? owner : await signIn(role);
      const m = await c
        .from("shop_memberships")
        .select("shop_id")
        .eq("user_id", accounts.accounts[role].id)
        .maybeSingle();
      assert.equal(m.error, null);
      if (m.data) {
        const s = await c.from("shops").select("name").eq("id", m.data.shop_id).single();
        assert(String(s.data?.name).startsWith("QA Cloud"), "Refuse non-QA shop");
        state[`${role}Shop`] = m.data.shop_id;
        record(`${role} existing QA onboarding`, "pass");
      } else {
        assert.equal(new URL(page.url()).pathname, "/onboarding");
        if (role === "owner") {
          await page.getByLabel(/^Shop name/).fill(`QA Cloud ${accounts.tag} owner`);
          await page.getByLabel(/^Trading currency/).fill("USD");
          await page.getByLabel(/^Shop timezone/).fill("UTC");
          const response = page.waitForResponse(
            (r) => r.url().endsWith("/api/actions/shop") && r.request().method() === "POST",
          );
          await page.getByRole("button", { name: "Create my shop", exact: true }).click();
          const r = await response;
          assert.equal(r.status(), 200);
          state.ownerShop = (await r.json()).data.id;
          await page.waitForURL(`${origin}/`);
        } else {
          const data = await good(ctx, "shop", {
            mode: "create",
            name: `QA Cloud ${accounts.tag} outsider`,
            currency: "USD",
            time_zone: "UTC",
          });
          state.outsiderShop = data.id;
        }
        record(`${role} real app onboarding`, "pass");
      }
      const cookies = await ctx.cookies();
      assert(
        cookies.some((c) => c.name.includes("auth-token")),
        "Missing SSR auth cookie",
      );
      await page.reload();
      assert.notEqual(new URL(page.url()).pathname, "/login");
      record(`${role} login cookies + SSR reload`, "pass");
      // Sign out without serializing session material.
      await c.auth.signOut({ scope: "local" });
      await ctx.clearCookies();
    }
    const sql = {
      project_id: "jrxviebkaahwwwyrebnp",
      query: `insert into public.shop_memberships (shop_id,user_id,role) select '${state.ownerShop}'::uuid, '${accounts.accounts.staff.id}'::uuid, 'staff' where exists (select 1 from public.shops where id='${state.ownerShop}'::uuid and name like 'QA Cloud%') and exists (select 1 from auth.users where id='${accounts.accounts.staff.id}'::uuid and email like '%.test') on conflict do nothing; select count(*) as qa_staff_memberships from public.shop_memberships where shop_id='${state.ownerShop}'::uuid and user_id='${accounts.accounts.staff.id}'::uuid and role='staff';`,
    };
    writeFileSync(`${dir}/staff-provision-params.json`, JSON.stringify(sql));
    await ctx.close();
    return;
  }
  assert(state.ownerShop && state.outsiderShop, "Run bootstrap first");
  const scope = await owner.from("shops").select("id,name").eq("id", state.ownerShop).single();
  assert.equal(scope.error, null);
  assert(
    String(scope.data.name).startsWith(`QA Cloud ${accounts.tag} `),
    "Refuse a non-isolated shop",
  );
  await uiLogin(page, "owner");
  if (process.env.CLOUD_QA_PHASE === "final") {
    await supplementalAuth(browser);
    await finalCounts(owner, state.ownerShop);
    await owner.auth.signOut({ scope: "local" });
    await ctx.close();
    assert.equal(
      evidence.filter((e) => e.status === "fail").length,
      0,
      "Final hosted QA has findings",
    );
    return;
  }
  if (process.env.CLOUD_QA_PHASE === "supplemental") {
    await supplemental(browser, ctx, page, owner, state.ownerShop);
    await finalCounts(owner, state.ownerShop);
    await owner.auth.signOut({ scope: "local" });
    await ctx.close();
    assert.equal(
      evidence.filter((e) => e.status === "fail").length,
      0,
      "Supplemental hosted QA has findings",
    );
    return;
  }
  if (process.env.CLOUD_QA_PHASE !== "confirm") await business(ctx, page, owner, state.ownerShop);
  else await confirmReport(owner, state.ownerShop);
  await security(browser, ctx, page, owner, state.ownerShop, state.outsiderShop);
  if (process.env.CLOUD_QA_PHASE !== "confirm")
    await supplemental(browser, ctx, page, owner, state.ownerShop);
  await uiAudit(page, ctx);
  if (process.env.CLOUD_QA_PHASE !== "confirm") await staffAudit(browser, owner, state.ownerShop);
  await finalCounts(owner, state.ownerShop);
  await check("Owner logout removes protected SSR/API access", async () => {
    await page.goto(`${origin}/`);
    await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await page.getByRole("button", { name: /^Account menu for / }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await page.waitForURL(`${origin}/login`);
    const r = await ctx.request.get(`${origin}/api/products`);
    assert.equal(r.status(), 401);
    await page.goto(`${origin}/inventory`);
    assert.equal(new URL(page.url()).pathname, "/login");
  });
  await owner.auth.signOut({ scope: "local" });
  await ctx.close();
  record(
    "Email confirmation/reset delivery",
    "blocked",
    "No provider inbox; seeded preconfirmed users do not prove delivery",
  );
  record(
    "Independent backup/restore drill",
    "blocked",
    "Not run; no independent backup target/restore environment authorized",
  );
  const failures = evidence.filter((e) => e.status === "fail").length;
  console.log(
    JSON.stringify({
      passed: evidence.filter((e) => e.status === "pass").length,
      failed: failures,
      blocked: evidence.filter((e) => e.status === "blocked").length,
    }),
  );
  assert.equal(failures, 0, "Hosted QA has findings; see sanitized evidence");
}

async function detail(ctx: BrowserContext, id: string) {
  const r = await ctx.request.get(`${origin}/api/sales/${id}`);
  assert.equal(r.status(), 200);
  return r.json();
}
async function business(ctx: BrowserContext, page: Page, c: SupabaseClient, shop: string) {
  // Every run uses a new synthetic catalog and a report baseline; immutable records are retained.
  const stamp = randomUUID().slice(0, 8);
  const from = "2026-01-01T00:00:00Z",
    to = "2027-01-01T00:00:00Z";
  const before = await c.rpc("report_shop", { p_shop_id: shop, p_from: from, p_to: to });
  assert.equal(before.error, null);
  state.reportBaseline = before.data.summary;
  save();
  const category = await good(ctx, "category", { name: `QA 茶 & café ${stamp}` });
  const a = await createProduct(ctx, `QA 茶 café ${stamp}`, "20", "10.00", "4.0000", category.id);
  const b = await createProduct(ctx, `QA reversal ${stamp}`, "3", "7.00", "2.0000", category.id);
  const dup = await createProduct(ctx, `QA duplicate ${stamp}`, "10");
  const last = await createProduct(ctx, `QA last unit ${stamp}`, "1");
  const mixed = await createProduct(ctx, `QA mixed race ${stamp}`, "1");
  state.products = { a: a.id, b: b.id, dup: dup.id, last: last.id, mixed: mixed.id };
  save();
  record("Category + five catalog products through hosted API", "pass");
  await check("Unicode/quoted CSV UI import, Unicode search and safe export", async () => {
    await page.goto(`${origin}/inventory`);
    await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const d = page.getByRole("dialog", { name: "Import products", exact: true });
    const sku = `CSV-${stamp}`;
    const csv = `name,category,sku,unit,cost_price,selling_price,opening_stock,low_stock_threshold\r\n"QA =茶, café ${stamp}","QA 咖啡 ${stamp}",${sku},each,1.0000,3.00,2,1\r\n"=QA FORMULA ${stamp}","QA 咖啡 ${stamp}",${sku}-F,each,1.0000,3.00,0,1\r\n`;
    await d
      .locator('input[type="file"]')
      .setInputFiles({ name: "qa-unicode.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const wait = page.waitForResponse(
      (r) => r.url().endsWith("/api/actions/import") && r.request().method() === "POST",
    );
    await d.getByRole("button", { name: "Import products", exact: true }).click();
    assert.equal((await wait).status(), 200);
    await d.waitFor({ state: "hidden" });
    const search = await ctx.request.get(`${origin}/api/products?q=${encodeURIComponent("茶")}`);
    assert.equal(search.status(), 200);
    assert((await search.json()).products.some((p: { name: string }) => p.name.includes(stamp)));
    const ex = await ctx.request.get(`${origin}/api/export?type=inventory`);
    assert.equal(ex.status(), 200);
    const text = await ex.text();
    assert(text.includes(`"QA =茶, café ${stamp}"`));
    assert(text.includes(`'=QA FORMULA ${stamp}`));
    const rejected = await action(ctx, "import", { csv });
    assert.equal(rejected.status, 409);
    const r = await c.from("products").select("id").eq("shop_id", shop).eq("sku", sku);
    assert.equal(r.data?.length, 1);
    return { rowsImported: 2, duplicateImportStatus: rejected.status };
  });
  await check("Receiving + damage adjustment reconcile stock", async () => {
    await good(ctx, "receive", {
      product_id: a.id,
      quantity: "4",
      unit_cost: "4.0000",
      supplier: "QA Synthetic Supplier",
      payment_method: "cash",
      note: "QA receiving",
    });
    assert.equal(await stock(c, a.id), 24);
    await good(ctx, "adjust", {
      product_id: a.id,
      quantity_delta: "-1",
      kind: "damage",
      note: "QA damaged item",
    });
    assert.equal(await stock(c, a.id), 23);
  });
  const cash = await good(ctx, "sale", salePayload(a.id, "4"));
  const credit = await good(ctx, "sale", salePayload(a.id, "3", "10.00", "credit"));
  state.cashSale = cash.id;
  state.cashReference = cash.reference;
  save();
  await check("Cash sale + credit partial/full collections", async () => {
    assert.equal(await stock(c, a.id), 16);
    assert.equal(Number((await detail(ctx, credit.id)).sale.balance_due), 30);
    await good(ctx, "collect", {
      sale_id: credit.id,
      amount: "7.00",
      method: "cash",
      note: "QA partial collection",
    });
    let d = await detail(ctx, credit.id);
    assert.equal(Number(d.sale.balance_due), 23);
    assert.equal(d.sale.payment_status, "partially_paid");
    await good(ctx, "collect", {
      sale_id: credit.id,
      amount: "23.00",
      method: "digital",
      note: "QA final collection",
    });
    d = await detail(ctx, credit.id);
    assert.equal(Number(d.sale.balance_due), 0);
    assert.equal(d.sale.payment_status, "paid");
    const over = await action(ctx, "collect", {
      sale_id: credit.id,
      amount: "0.01",
      method: "cash",
      note: null,
    });
    assert.equal(over.status, 409);
  });
  await check("Partial restocked/nonrestocked returns retain exact costs", async () => {
    const cashLine = (await detail(ctx, cash.id)).items[0].id;
    const creditLine = (await detail(ctx, credit.id)).items[0].id;
    await good(ctx, "return", {
      sale_id: cash.id,
      items: [{ sale_item_id: cashLine, quantity: "1", restock: true }],
      reason: "QA restocked partial return",
      refund_method: "cash",
    });
    assert.equal(await stock(c, a.id), 17);
    await good(ctx, "return", {
      sale_id: cash.id,
      items: [{ sale_item_id: cashLine, quantity: "1", restock: false }],
      reason: "QA nonrestocked partial return",
      refund_method: "cash",
    });
    assert.equal(await stock(c, a.id), 17);
    await good(ctx, "return", {
      sale_id: credit.id,
      items: [{ sale_item_id: creditLine, quantity: "1", restock: false }],
      reason: "QA credit returned after collection",
      refund_method: "digital",
    });
    assert.equal(await stock(c, a.id), 17);
    const d = await detail(ctx, cash.id);
    assert.equal(Number(d.sale.net_total), 20);
    assert.equal(Number(d.items[0].returned_quantity), 2);
    assert.equal(d.sale.status, "partially_returned");
    const bad = await action(ctx, "reverse", {
      sale_id: cash.id,
      reason: "QA should reject prior return",
      refund_method: "cash",
    });
    assert.equal(bad.status, 409);
  });
  await check("Full reversal refunds and restores original stock", async () => {
    const sale = await good(ctx, "sale", salePayload(b.id, "2", "7.00"));
    assert.equal(await stock(c, b.id), 1);
    await good(ctx, "reverse", {
      sale_id: sale.id,
      reason: "QA full reversal",
      refund_method: "cash",
    });
    assert.equal(await stock(c, b.id), 3);
    const d = await detail(ctx, sale.id);
    assert.equal(d.sale.status, "reversed");
    assert.equal(Number(d.sale.net_total), 0);
    const again = await action(ctx, "reverse", {
      sale_id: sale.id,
      reason: "QA cannot reverse twice",
      refund_method: "cash",
    });
    assert.equal(again.status, 409);
  });
  await check("Eight parallel same-ID requests create one sale/deduction", async () => {
    const request_id = randomUUID();
    const payload = { ...salePayload(dup.id), request_id };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => action(ctx, "sale", payload)),
    );
    assert(results.every((r) => r.status === 200));
    assert.equal(new Set(results.map((r) => r.body.data.id)).size, 1);
    assert.equal(await stock(c, dup.id), 9);
    const movements = await rows(c, "inventory_movements", shop);
    assert.equal(movements.filter((m) => m.product_id === dup.id && m.kind === "sale").length, 1);
    const changed = await action(ctx, "sale", { ...salePayload(dup.id, "2"), request_id });
    assert.equal(changed.status, 409);
    return {
      requests: 8,
      successfulResponses: 8,
      uniqueSales: 1,
      saleMovements: 1,
      stock: 9,
      changedPayloadStatus: 409,
    };
  });
  await check("Two last-unit contenders yield one success, no negative stock", async () => {
    const results = await Promise.all([
      action(ctx, "sale", salePayload(last.id)),
      action(ctx, "sale", salePayload(last.id)),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await stock(c, last.id), 0);
    return { statuses: results.map((r) => r.status), stock: 0 };
  });
  let mixedSuccess = 0;
  await check("Parallel restocked return versus checkout is serialized safely", async () => {
    const prior = await good(ctx, "sale", salePayload(mixed.id));
    const line = (await detail(ctx, prior.id)).items[0].id;
    const [returned, checkout] = await Promise.all([
      action(ctx, "return", {
        sale_id: prior.id,
        items: [{ sale_item_id: line, quantity: "1", restock: true }],
        reason: "QA mixed concurrent return",
        refund_method: "cash",
      }),
      action(ctx, "sale", salePayload(mixed.id)),
    ]);
    assert.equal(returned.status, 200);
    assert([200, 409].includes(checkout.status));
    mixedSuccess = Number(checkout.status === 200);
    assert.equal(await stock(c, mixed.id), 1 - mixedSuccess);
    state.mixedSuccess = mixedSuccess;
    save();
    return {
      returnStatus: returned.status,
      checkoutStatus: checkout.status,
      stock: 1 - mixedSuccess,
    };
  });
  await check("Expense and owner cash movement use real hosted actions", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await good(ctx, "expense", {
      description: "QA Synthetic Cleaning",
      category: "QA Operations",
      amount: "3.00",
      method: "cash",
      occurred_on: today,
    });
    await good(ctx, "cash", {
      kind: "owner_deposit",
      description: "QA Synthetic Deposit",
      amount: "5.00",
      method: "cash",
      occurred_on: today,
    });
  });
  await check("Exact event report reconciliation against independent expected deltas", async () => {
    const after = await c.rpc("report_shop", { p_shop_id: shop, p_from: from, p_to: to });
    assert.equal(after.error, null);
    const expected = {
      revenue: 60 + 10 * mixedSuccess,
      cost_of_goods: 32 + 4 * mixedSuccess,
      gross_profit: 28 + 6 * mixedSuccess,
      expenses: 3,
      estimated_net_profit: 25 + 6 * mixedSuccess,
      cash_received: 91 + 10 * mixedSuccess,
      digital_received: 23,
      credit_sales: 20,
      refunds: 54,
      net_cash_movement: 46 + 10 * mixedSuccess,
      units: 6 + mixedSuccess,
      sales_count: 6 + mixedSuccess,
      unknown_cost_lines: 0,
    };
    state.expectedReport = Object.fromEntries(
      Object.entries(expected).map(([k, v]) => [k, v + Number(before.data.summary[k])]),
    );
    save();
    const actual: Record<string, number> = {};
    for (const [k, v] of Object.entries(expected)) {
      actual[k] = Number(after.data.summary[k]) - Number(before.data.summary[k]);
      assert.equal(actual[k], v, `report delta ${k}`);
    }
    state.reportDelta = actual;
    save();
    return actual;
  });
  await check("All stock and financial ledgers reconcile; immutable audit exists", async () => {
    const products = await rows(c, "products", shop);
    const movements = await rows(c, "inventory_movements", shop);
    const cashbook = await rows(c, "cashbook_entries", shop);
    const payments = await rows(c, "payments", shop);
    const sales = await rows(c, "sales_ledger", shop);
    const audit = await rows(c, "audit_records", shop);
    for (const p of products) {
      assert(Number(p.current_stock) >= 0);
      const sum = movements
        .filter((m) => m.product_id === p.id)
        .reduce((n, m) => n + Number(m.quantity_delta), 0);
      assert.equal(Number(p.current_stock), sum);
    }
    for (const s of sales) {
      const paid = payments
        .filter((p) => p.sale_id === s.id)
        .reduce((n, p) => n + Number(p.amount), 0);
      assert.equal(Number(s.collected_total), paid);
      assert.equal(Number(s.balance_due), Math.max(0, Number(s.net_total) - paid));
    }
    const net = cashbook.reduce(
      (n, e) => n + Number(e.amount) * (e.direction === "in" ? 1 : -1),
      0,
    );
    const report = await c.rpc("report_shop", { p_shop_id: shop, p_from: from, p_to: to });
    assert.equal(Number(report.data.summary.net_cash_movement), net);
    const counts = {
      products: products.length,
      inventoryMovements: movements.length,
      sales: sales.length,
      payments: payments.length,
      cashbookEntries: cashbook.length,
      auditRecords: audit.length,
    };
    state.counts = counts;
    save();
    return counts;
  });
}
async function security(
  browser: Browser,
  ctx: BrowserContext,
  _page: Page,
  c: SupabaseClient,
  shop: string,
  other: string,
) {
  const outsider = await signIn("outsider");
  const anonymous = client();
  const otherCtx = await browser.newContext({ baseURL: origin });
  const otherPage = await otherCtx.newPage();
  await uiLogin(otherPage, "outsider");
  const anonCtx = await browser.newContext({ baseURL: origin });
  const tables = [
    "shops",
    "shop_memberships",
    "categories",
    "products",
    "sales",
    "sale_items",
    "inventory_movements",
    "payments",
    "sale_adjustments",
    "sale_adjustment_items",
    "expenses",
    "purchases",
    "purchase_items",
    "cashbook_entries",
    "audit_records",
    "idempotency_keys",
    "sales_ledger",
    "sale_items_ledger",
  ];
  await check("PostgREST tenant isolation across 18 tables/views, both directions", async () => {
    let reads = 0;
    for (const table of tables) {
      const column = table === "shops" ? "id" : "shop_id";
      for (const [who, target] of [
        [outsider, shop],
        [c, other],
      ] as const) {
        const r = await who.from(table).select("*").eq(column, target);
        assert.equal(r.error, null, `tenant ${table} query error`);
        assert.equal(r.data?.length, 0, `tenant leak ${table}`);
        reads++;
      }
    }
    return { tables: tables.length, filteredReads: reads, leakedRows: 0 };
  });
  await check("Anonymous denial on 18 PostgREST tables/views and mutation RPC", async () => {
    let reads = 0;
    for (const table of tables) {
      const r = await anonymous.from(table).select("*");
      assert(r.error || r.data?.length === 0, `anonymous leak ${table}`);
      reads++;
    }
    const rpc = await anonymous.rpc("create_category", {
      p_shop_id: shop,
      p_name: "QA denied anonymous",
      p_request_id: randomUUID(),
    });
    assert(rpc.error);
    return { reads, successfulUnauthorizedMutations: 0 };
  });
  await check("Direct table insert/update denied on all 16 normalized tables", async () => {
    let denied = 0;
    for (const table of tables.slice(0, 16)) {
      const payload: Record<string, unknown> =
        table === "shops" ? { name: "QA direct-write must fail" } : { shop_id: shop };
      const ins = await c.from(table).insert(payload);
      assert.equal(ins.error?.code, "42501", `${table} insert must be forbidden`);
      denied++;
      const update = await c
        .from(table)
        .update(payload)
        .eq(table === "shops" ? "id" : "shop_id", shop);
      assert.equal(update.error?.code, "42501", `${table} update must be forbidden`);
      denied++;
    }
    return { deniedWrites: denied };
  });
  await check("Private-schema RPC helpers not exposed or callable", async () => {
    const a = await c.schema("pos_private").rpc("require_member", { p_shop_id: shop });
    assert(a.error);
    assert(["PGRST106", "42501"].includes(a.error.code));
    const b = await c.rpc("require_member", { p_shop_id: shop });
    assert.equal(b.error?.code, "PGRST202");
    return { schemaCode: a.error.code, publicHelperCode: b.error.code };
  });
  await check("Cross-tenant RPC writes and report denied", async () => {
    const r = await outsider.rpc("create_category", {
      p_shop_id: shop,
      p_name: "QA denied tenant",
      p_request_id: randomUUID(),
    });
    assert.equal(r.error?.code, "42501");
    const report = await outsider.rpc("report_shop", {
      p_shop_id: shop,
      p_from: "2026-01-01T00:00:00Z",
      p_to: "2027-01-01T00:00:00Z",
    });
    assert.equal(report.error?.code, "42501");
    const target = (state.products as Record<string, string>).a;
    const receive = await action(otherCtx, "receive", {
      product_id: target,
      quantity: "1",
      unit_cost: "4.0000",
      supplier: null,
      payment_method: "unpaid",
      note: "QA denied cross tenant",
    });
    assert([403, 409].includes(receive.status));
    const sale = await action(otherCtx, "sale", salePayload(target));
    assert([403, 409].includes(sale.status));
    return {
      rpcCode: r.error?.code,
      reportCode: report.error?.code,
      receiveStatus: receive.status,
      saleStatus: sale.status,
    };
  });
  await check("HTTP cross-tenant detail/movement reads reveal no QA owner records", async () => {
    const sale = await otherCtx.request.get(`${origin}/api/sales/${state.cashSale}`);
    assert([403, 404].includes(sale.status()));
    const move = await otherCtx.request.get(
      `${origin}/api/products/${(state.products as Record<string, string>).a}/movements`,
    );
    assert.equal(move.status(), 404);
    assert.equal((await move.json()).ok, false);
    const products = await otherCtx.request.get(`${origin}/api/products`);
    assert.equal(products.status(), 200);
    assert(
      !(await products.json()).products.some(
        (p: { id: string }) => p.id === (state.products as Record<string, string>).a,
      ),
    );
    return { saleStatus: sale.status(), movementStatus: 404 };
  });
  await check("Anonymous hosted APIs/pages denied", async () => {
    const paths = [
      "/api/products",
      `/api/sales/${state.cashSale}`,
      `/api/products/${(state.products as Record<string, string>).a}/movements`,
      "/api/export?type=inventory",
    ];
    for (const path of paths) {
      const r = await anonCtx.request.get(`${origin}${path}`);
      assert.equal(r.status(), 401);
    }
    const denied = await action(anonCtx, "category", { name: "QA denied anonymous" });
    assert.equal(denied.status, 401);
    const p = await anonCtx.newPage();
    await p.goto(`${origin}/inventory`);
    assert.equal(new URL(p.url()).pathname, "/login");
    return { apiReads: paths.length, mutationStatus: 401, pageRedirect: "/login" };
  });
  await check("Origin, content type, malformed/oversize and strict validation errors", async () => {
    const noOrigin = await ctx.request.post(`${origin}/api/actions/category`, {
      data: { request_id: randomUUID(), name: "QA denied origin" },
    });
    assert.equal(noOrigin.status(), 403);
    const foreign = await action(
      ctx,
      "category",
      { name: "QA denied foreign origin" },
      { origin: "https://example.test" },
    );
    assert.equal(foreign.status, 403);
    const content = await ctx.request.post(`${origin}/api/actions/category`, {
      headers: { origin, "content-type": "text/plain" },
      data: "{}",
    });
    assert.equal(content.status(), 415);
    const malformed = await ctx.request.post(`${origin}/api/actions/category`, {
      headers: { origin, "content-type": "application/json" },
      data: "{",
    });
    assert.equal(malformed.status(), 400);
    const large = await ctx.request.post(`${origin}/api/actions/category`, {
      headers: { origin, "content-type": "application/json" },
      data: JSON.stringify({ request_id: randomUUID(), name: "x".repeat(600001) }),
    });
    assert.equal(large.status(), 413);
    const target = (state.products as Record<string, string>).a;
    const invalid = [
      await action(ctx, "unknown", {}),
      await action(ctx, "sale", salePayload(target, "-1")),
      await action(ctx, "sale", salePayload(target, "1.0001")),
      await action(ctx, "sale", salePayload(target, "1", "1.001")),
      await action(ctx, "sale", {
        ...salePayload(target),
        items: [...salePayload(target).items, ...salePayload(target).items],
      }),
      await action(ctx, "sale", {
        ...salePayload(target, "1", "10.00", "credit"),
        customer_name: null,
      }),
      await action(ctx, "category", { name: "QA invalid extra", shop_id: other }),
      await action(ctx, "expense", {
        description: "QA future expense",
        category: "QA",
        amount: "1.00",
        method: "cash",
        occurred_on: "2099-01-01",
      }),
    ];
    assert(invalid.every((r) => r.status === 400));
    return {
      missingOrigin: 403,
      foreignOrigin: 403,
      contentType: 415,
      malformed: 400,
      oversize: 413,
      validationCases: invalid.length,
      status: 400,
    };
  });
  await check("Negative stock and stale-product writes rejected", async () => {
    const id = (state.products as Record<string, string>).a;
    const n = await action(ctx, "adjust", {
      product_id: id,
      quantity_delta: "-999",
      kind: "damage",
      note: "QA denied negative stock",
    });
    assert.equal(n.status, 409);
    assert.equal(await stock(c, id), 17);
    const r = await c.from("products").select("*").eq("id", id).single();
    assert.equal(r.error, null);
    const p = r.data;
    const payload = {
      product_id: id,
      product: {
        name: p.name,
        category_id: p.category_id,
        sku: p.sku,
        barcode: p.barcode,
        unit: p.unit,
        cost_price: String(p.cost_price),
        selling_price: String(p.selling_price),
        opening_stock: "0",
        low_stock_threshold: String(p.low_stock_threshold),
        is_active: true,
      },
    };
    assert.equal((await action(ctx, "product", payload)).status, 400);
    const stale = await action(ctx, "product", {
      ...payload,
      product: { ...payload.product, expected_updated_at: "2000-01-01T00:00:00Z" },
    });
    assert.equal(stale.status, 409);
    return { negativeStockStatus: 409, missingRevision: 400, staleRevision: 409 };
  });
  await outsider.auth.signOut({ scope: "local" });
  await otherCtx.close();
  await anonCtx.close();
}

async function uiAudit(page: Page, ctx: BrowserContext) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: { path: string; status: number }[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error")
      consoleErrors.push(msg.text().replace(/https?:\/\/[^\s]+/g, "[URL]"));
  });
  page.on("pageerror", (e) => pageErrors.push(e.name));
  page.on("response", (r) => {
    if (r.status() >= 500 && new URL(r.url()).origin === origin)
      serverErrors.push({ path: new URL(r.url()).pathname, status: r.status() });
  });
  const paths = [
    ["/", "Dashboard"],
    ["/inventory", "Inventory"],
    ["/sales", "Sales"],
    ["/reports", "Reports"],
    ["/cashbook", "Cashbook"],
    ["/expenses", "Expenses"],
    ["/settings", "Settings"],
  ];
  for (const width of [1440, 360, 390])
    for (const [path, title] of paths) {
      await check(`${width}px ${title}: real SSR, no horizontal overflow, Axe WCAG`, async () => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        const response = await page.goto(`${origin}${path}`);
        assert.equal(response?.status(), 200);
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
        }));
        assert(
          dimensions.content <= dimensions.viewport + 1,
          `overflow ${dimensions.content}/${dimensions.viewport}`,
        );
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const violations = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          targets: v.nodes.flatMap((n) => n.target),
        }));
        // Avoid user identity in image evidence; no login/auth screenshots are taken.
        const masks = Object.values(accounts.accounts).map((a) =>
          page.getByText(a.email, { exact: true }),
        );
        await page.screenshot({
          path: `${dir}/${title.toLowerCase()}-${width}.png`,
          fullPage: true,
          animations: "disabled",
          mask: masks,
        });
        assert.equal(violations.length, 0, JSON.stringify(violations));
        return { ...dimensions, axeViolations: 0 };
      });
    }
  await check("Mobile nav exposes all seven destinations", async () => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto(`${origin}/inventory`);
    await page
      .getByRole("button", { name: /open.*(menu|navigation)|menu/i })
      .first()
      .click();
    const nav = page.getByRole("dialog", { name: "Your workspace", exact: true });
    await nav.waitFor();
    for (const [, title] of paths)
      assert(
        await nav.getByRole("link", { name: new RegExp(`^${title}`) }).isVisible(),
        `Missing mobile ${title}`,
      );
    await page.keyboard.press("Escape");
  });
  await check("Dialog keyboard focus trap, Escape and trigger focus return", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/inventory`);
    const trigger = page.getByRole("button", { name: "Add product", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Add a product", exact: true });
    await dialog.waitFor();
    assert(await dialog.evaluate((d) => d.contains(document.activeElement)));
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      assert(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
        `focus escaped at tab ${i}`,
      );
    }
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))),
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert(await trigger.evaluate((e) => e === document.activeElement));
    return { tabPresses: 24, axeViolations: 0 };
  });
  await check("Accessible sale detail and native browser print-media contract", async () => {
    await page.goto(`${origin}/sales`);
    await page
      .getByRole("button", { name: `View sale ${state.cashReference}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: `Sale ${state.cashReference}`, exact: true });
    await dialog.waitFor();
    assert((await dialog.innerText()).includes("QA 茶 café"));
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))),
    );
    const printActions = await dialog.getByRole("button", { name: /print/i }).count();
    record("Dedicated receipt print action", printActions > 0 ? "pass" : "fail", {
      printActions,
      finding:
        printActions > 0
          ? null
          : "No Print/Receipt action in sale detail; native browser print is not a dedicated customer receipt",
    });
    await page.emulateMedia({ media: "print" });
    assert(await dialog.isVisible());
    await page.screenshot({
      path: `${dir}/receipt-print.png`,
      fullPage: true,
      mask: Object.values(accounts.accounts).map((a) => page.getByText(a.email, { exact: true })),
    });
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    return {
      dedicatedPrintAction: printActions > 0,
      printMediaDialogVisible: true,
      physicalPrinter: "not tested",
    };
  });
  await check("All five CSV downloads + template contract", async () => {
    const counts: Record<string, number> = {};
    for (const type of ["inventory", "sales", "report", "cashbook", "expenses"]) {
      const r = await ctx.request.get(
        `${origin}/api/export?type=${type}&from=2026-01-01&to=2026-12-31`,
      );
      assert.equal(r.status(), 200);
      assert(r.headers()["content-type"].includes("text/csv"));
      assert(r.headers()["content-disposition"].includes("attachment"));
      const text = await r.text();
      assert(text.startsWith("\uFEFF"));
      assert(text.includes("\r\n"));
      counts[type] = text.split("\r\n").filter(Boolean).length - 1;
    }
    const template = await ctx.request.get(`${origin}/api/template`);
    assert.equal(template.status(), 200);
    assert((await template.text()).includes("name,category,sku"));
    const invalid = await ctx.request.get(`${origin}/api/export?type=unsupported`);
    assert.equal(invalid.status(), 400);
    return counts;
  });
  await check("UI browser runtime, console and hosted 5xx", async () => {
    assert.equal(pageErrors.length, 0);
    assert.equal(serverErrors.length, 0);
    assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors));
    return {
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
      hosted5xx: serverErrors.length,
    };
  });
}

async function staffAudit(browser: Browser, c: SupabaseClient, shop: string) {
  const staff = await signIn("staff");
  const ctx = await browser.newContext({ baseURL: origin });
  const page = await ctx.newPage();
  const membership = await staff
    .from("shop_memberships")
    .select("is_active")
    .eq("user_id", accounts.accounts.staff.id)
    .maybeSingle();
  if (!membership.data?.is_active) {
    record(
      "Staff established-session revocation",
      "blocked",
      "QA staff already revoked or not provisioned; will not reactivate retained membership",
    );
    await ctx.close();
    return;
  }
  await check("Staff active real login and hosted mutation", async () => {
    await uiLogin(page, "staff");
    assert.equal(new URL(page.url()).pathname, "/");
    const category = await good(ctx, "category", {
      name: `QA staff retained audit ${randomUUID().slice(0, 8)}`,
    });
    state.staffCategory = category.id;
    save();
    const denied = await action(ctx, "shop", {
      mode: "update",
      name: "QA staff must not rename",
      currency: "USD",
      time_zone: "UTC",
    });
    assert.equal(denied.status, 403);
  });
  await check(
    "Owner revoke_staff blocks established browser session and retains history",
    async () => {
      const request = randomUUID();
      const args = {
        p_shop_id: shop,
        p_user_id: accounts.accounts.staff.id,
        p_reason: "QA hosted staff offboarding",
        p_request_id: request,
      };
      const r = await c.rpc("revoke_staff", args);
      assert.equal(r.error, null);
      assert.equal(r.data.is_active, false);
      const replay = await c.rpc("revoke_staff", args);
      assert.equal(replay.error, null);
      assert.deepEqual(replay.data, r.data);
      await page.goto(`${origin}/inventory`);
      await page.getByRole("heading", { name: "Access revoked", exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/access-revoked");
      for (const path of [
        "/api/products",
        "/api/export?type=inventory",
        `/api/sales/${state.cashSale}`,
      ]) {
        const api = await ctx.request.get(`${origin}${path}`);
        assert.equal(api.status(), 403);
      }
      assert.equal((await action(ctx, "category", { name: "QA denied revoked" })).status, 403);
      assert.equal(
        (
          await action(ctx, "shop", {
            mode: "create",
            name: "QA cannot escape",
            currency: "USD",
            time_zone: "UTC",
          })
        ).status,
        403,
      );
      const products = await staff.from("products").select("id");
      assert.equal(products.error, null);
      assert.equal(products.data.length, 0);
      const tomb = await staff.from("shop_memberships").select("user_id,is_active,revoked_at");
      assert.equal(tomb.data?.length, 1);
      assert.equal(tomb.data[0].is_active, false);
      assert(tomb.data[0].revoked_at);
      const denied = await staff.rpc("create_category", {
        p_shop_id: shop,
        p_name: "QA denied revoked RPC",
        p_request_id: randomUUID(),
      });
      assert.equal(denied.error?.code, "42501");
      const retained = await c.from("categories").select("id").eq("id", state.staffCategory);
      assert.equal(retained.data?.length, 1);
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert.equal(axe.violations.length, 0);
      await page.screenshot({
        path: `${dir}/access-revoked.png`,
        fullPage: true,
        mask: Object.values(accounts.accounts).map((a) => page.getByText(a.email, { exact: true })),
      });
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.waitForURL(`${origin}/login`);
      return {
        protectedReadsDenied: 3,
        mutationsDenied: 2,
        tombstoneRetained: true,
        historicalCategoryRetained: true,
        rpcDenied: "42501",
        replayIdempotent: true,
      };
    },
  );
  await staff.auth.signOut({ scope: "local" });
  await ctx.close();
}

async function confirmReport(c: SupabaseClient, shop: string) {
  await check(
    "Exact hosted report recheck (correct net credit and original sale count semantics)",
    async () => {
      const result = await c.rpc("report_shop", {
        p_shop_id: shop,
        p_from: "2026-01-01T00:00:00Z",
        p_to: "2027-01-01T00:00:00Z",
      });
      assert.equal(result.error, null);
      const expected = state.expectedReport as Record<string, number>;
      assert(expected, "No independent expected report saved; run verify first");
      for (const [k, v] of Object.entries(expected))
        assert.equal(Number(result.data.summary[k]), v, `report ${k}`);
      return expected;
    },
  );
}

async function supplemental(
  browser: Browser,
  ctx: BrowserContext,
  page: Page,
  c: SupabaseClient,
  shop: string,
) {
  await supplementalAuth(browser);
  await check(
    "Actual UI category/product, receive, damage, cash checkout and confirmed reversal",
    async () => {
      const stamp = randomUUID().slice(0, 8);
      const name = `QA UI Notebook ${stamp}`;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${origin}/inventory`);
      await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
      await page.getByRole("button", { name: "New category", exact: true }).click();
      const cd = page.getByRole("dialog", { name: "New category", exact: true });
      await cd.getByLabel(/^Category name/).fill(`QA UI Essentials ${stamp}`);
      await cd.getByRole("button", { name: "Create category", exact: true }).click();
      await cd.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Add product", exact: true }).click();
      const pd = page.getByRole("dialog", { name: "Add a product", exact: true });
      await pd.getByLabel(/^Product name/).fill(name);
      await pd
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption({ label: `QA UI Essentials ${stamp}` });
      await pd.getByLabel(/^Selling price/).fill("8.00");
      await pd.getByLabel(/^Unit cost/).fill("2.0000");
      await pd.getByLabel("Opening stock", { exact: true }).fill("5");
      const saved = page.waitForResponse(
        (r) => r.url().endsWith("/api/actions/product") && r.request().method() === "POST",
      );
      await pd.getByRole("button", { name: "Add product", exact: true }).click();
      const sr = await saved;
      assert.equal(sr.status(), 200);
      const id = (await sr.json()).data.id;
      state.uiProduct = id;
      save();
      await pd.waitFor({ state: "hidden" });
      const row = page.locator(".inventory-table tbody tr").filter({ hasText: name });
      const qty = row.locator('[data-label="Stock on hand"] strong');
      await expect(qty).toHaveText("5");
      await row.getByRole("button", { name: `Receive ${name}`, exact: true }).click();
      const rd = page.getByRole("dialog", { name: "Receive stock", exact: true });
      await rd.getByLabel(/^Quantity received/).fill("2");
      await rd.getByLabel(/^Unit cost/).fill("2.0000");
      await rd.getByRole("combobox", { name: /payment/i }).selectOption("unpaid");
      await rd.getByRole("button", { name: "Receive stock", exact: true }).click();
      await rd.waitFor({ state: "hidden" });
      await expect(qty).toHaveText("7");
      await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Adjust stock", exact: true }).click();
      const ad = page.getByRole("dialog", { name: "Adjust stock", exact: true });
      await ad
        .getByRole("combobox", { name: "Adjustment type", exact: true })
        .selectOption("damage");
      await ad.getByLabel(/^Quantity to remove/).fill("1");
      await ad.getByLabel(/^Reason/).fill("QA UI damaged item");
      await ad.getByRole("button", { name: "Record adjustment", exact: true }).click();
      await ad.waitFor({ state: "hidden" });
      await expect(qty).toHaveText("6");
      await row.getByRole("button", { name: "Sell", exact: true }).click();
      const sd = page.getByRole("dialog", { name: "New sale", exact: true });
      const posted = page.waitForResponse(
        (r) => r.url().endsWith("/api/actions/sale") && r.request().method() === "POST",
      );
      await sd.getByRole("button", { name: "Record sale", exact: true }).click();
      const saleResponse = await posted;
      assert.equal(saleResponse.status(), 200);
      const sale = (await saleResponse.json()).data;
      await sd.waitFor({ state: "hidden" });
      await expect(qty).toHaveText("5");
      await page.goto(`${origin}/sales`);
      await page.getByRole("button", { name: `View sale ${sale.reference}`, exact: true }).click();
      const detail = page.getByRole("dialog", { name: `Sale ${sale.reference}`, exact: true });
      await detail.getByRole("button", { name: "Reverse entire sale", exact: true }).click();
      const rev = page.getByRole("dialog", { name: "Reverse the entire sale?", exact: true });
      assert(await rev.getByRole("button", { name: "Reverse sale", exact: true }).isDisabled());
      await rev.getByLabel(/^Reason for full reversal/).fill("QA UI confirmed full reversal");
      await rev.getByRole("checkbox").check();
      await rev.getByRole("button", { name: "Reverse sale", exact: true }).click();
      await rev.waitFor({ state: "hidden" });
      await expect(detail.getByText("Reversed", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      assert.equal(await stock(c, id), 6);
      addExpected({ cash_received: 8, refunds: 8, sales_count: 1 });
      return {
        opening: 5,
        received: 2,
        damage: 1,
        sold: 1,
        reversed: 1,
        finalStock: 6,
        destructiveConfirmationRequired: true,
      };
    },
  );
  await check(
    "Fractional discount and three partial returns conserve exact money/cost",
    async () => {
      const p = await createProduct(
        ctx,
        `QA fractional ${randomUUID().slice(0, 8)}`,
        "3",
        "0.05",
        "0.0150",
      );
      const payload = salePayload(p.id, "3", "0.05");
      payload.items[0].discount = "0.01";
      const sale = await good(ctx, "sale", payload);
      const d = await detail(ctx, sale.id);
      assert(new Decimal(d.sale.total).eq("0.14"));
      assert(new Decimal(d.items[0].cost_total).eq("0.05"));
      for (let i = 0; i < 3; i++)
        await good(ctx, "return", {
          sale_id: sale.id,
          items: [{ sale_item_id: d.items[0].id, quantity: "1", restock: true }],
          reason: `QA fractional partial ${i + 1}`,
          refund_method: "cash",
        });
      const final = await detail(ctx, sale.id);
      assert.equal(final.sale.status, "returned");
      assert(new Decimal(final.sale.net_total).eq(0));
      assert(new Decimal(final.sale.collected_total).eq(0));
      assert.equal(await stock(c, p.id), 3);
      const adj = await c
        .from("sale_adjustment_items")
        .select("line_total,cost_total")
        .eq("shop_id", shop)
        .eq("sale_item_id", d.items[0].id);
      assert.equal(adj.error, null);
      const total = adj.data.reduce((n, row) => n.plus(row.line_total), new Decimal(0));
      const cost = adj.data.reduce((n, row) => n.plus(row.cost_total), new Decimal(0));
      assert(total.eq("0.14"));
      assert(cost.eq("0.05"));
      addExpected({ cash_received: 0.14, refunds: 0.14, sales_count: 1 });
      return {
        originalNet: "0.14",
        returnedMoney: total.toFixed(2),
        originalCost: "0.05",
        returnedCost: cost.toFixed(2),
        partialReturns: 3,
        finalStock: 3,
      };
    },
  );
}
async function finalCounts(c: SupabaseClient, shop: string) {
  await check("Final retained QA table counts and all-stock reconciliation", async () => {
    const counts: Record<string, number> = {};
    for (const t of [
      "categories",
      "products",
      "sales",
      "sale_items",
      "inventory_movements",
      "payments",
      "sale_adjustments",
      "sale_adjustment_items",
      "expenses",
      "purchases",
      "purchase_items",
      "cashbook_entries",
      "audit_records",
      "idempotency_keys",
    ]) {
      const result = await c
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shop);
      assert.equal(result.error, null, `${t} count read failed`);
      counts[t] = result.count ?? 0;
    }
    const products = await rows(c, "products", shop);
    const movements = await rows(c, "inventory_movements", shop);
    for (const p of products) {
      const sum = movements
        .filter((m) => m.product_id === p.id)
        .reduce((n, m) => n.plus(String(m.quantity_delta)), new Decimal(0));
      assert(sum.eq(String(p.current_stock)));
      assert(sum.gte(0));
    }
    const report = await c.rpc("report_shop", {
      p_shop_id: shop,
      p_from: "2026-01-01T00:00:00Z",
      p_to: "2027-01-01T00:00:00Z",
    });
    assert.equal(report.error, null);
    if (state.expectedReport) {
      for (const [k, v] of Object.entries(state.expectedReport as Record<string, number>))
        assert(new Decimal(report.data.summary[k]).eq(v), `Independent expected final report ${k}`);
    }
    const cash = await rows(c, "cashbook_entries", shop);
    const net = cash.reduce(
      (n, e) => n.plus(new Decimal(String(e.amount)).mul(e.direction === "in" ? 1 : -1)),
      new Decimal(0),
    );
    assert(net.eq(report.data.summary.net_cash_movement));
    state.finalCounts = counts;
    state.finalReport = report.data.summary;
    save();
    return { counts, report: report.data.summary };
  });
}

async function supplementalAuth(browser: Browser) {
  await check("Real login UI failure + login Axe and SSR success", async () => {
    const b = await browser.newContext({ baseURL: origin });
    const p = await b.newPage();
    await p.goto(`${origin}/inventory`);
    assert.equal(new URL(p.url()).pathname, "/login");
    const axe = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.equal(axe.violations.length, 0);
    await p.getByLabel("Email address", { exact: true }).fill(accounts.accounts.owner.email);
    await p.getByLabel("Password", { exact: true }).fill(randomUUID());
    await p.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(p.locator('.notice[role="alert"]')).toContainText("Invalid login credentials");
    assert.equal(new URL(p.url()).pathname, "/login");
    await p.getByLabel("Password", { exact: true }).fill(accounts.accounts.owner.password);
    await p.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await p.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await p.reload();
    await p.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    const cookies = (await b.cookies()).filter((cookie) => cookie.name.includes("auth-token"));
    assert(cookies.length > 0);
    const attributes = cookies.map((cookie) => ({
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
    }));
    record(
      "HTTPS auth cookie Secure attribute",
      cookies.every((cookie) => cookie.secure) ? "pass" : "fail",
      { cookies: attributes },
    );
    await b.close();
    return { badPasswordRejected: true, loginAxeViolations: 0, SSRSessionCookie: true };
  });
}

function addExpected(delta: Record<string, number>) {
  const expected = state.expectedReport as Record<string, number> | undefined;
  if (!expected) return;
  for (const [k, v] of Object.entries(delta))
    expected[k] = new Decimal(expected[k]).plus(v).toNumber();
  save();
}
