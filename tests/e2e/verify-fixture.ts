/** Offline adapter self-check. Start fixture-server.ts first; no browser or Next is needed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_NAMES,
  FIXTURE_ORIGIN,
  FIXTURE_PUBLISHABLE_KEY,
  type FixtureState,
} from "./fixture-config";

const controls = { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE };
async function state() {
  const response = await fetch(`${FIXTURE_ORIGIN}/__fixture/state`, { headers: controls });
  assert.equal(response.status, 200);
  return (await response.json()) as FixtureState;
}
assert.equal(
  (await fetch(`${FIXTURE_ORIGIN}/__fixture/state`)).status,
  403,
  "Control endpoint must not be public",
);
assert.equal(
  (await fetch(`${FIXTURE_ORIGIN}/__fixture/reset`, { method: "POST", headers: controls })).status,
  200,
);
const before = await state();
const client = createClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const badLogin = await client.auth.signInWithPassword({
  ...FIXTURE_CREDENTIALS.owner,
  password: "not-the-fixture-password",
});
assert.equal(badLogin.error?.code, "invalid_credentials");
const { data: login, error: loginError } = await client.auth.signInWithPassword(
  FIXTURE_CREDENTIALS.owner,
);
assert.equal(loginError, null);
assert.ok(login.session);
assert.equal(login.user?.email, FIXTURE_CREDENTIALS.owner.email);
const headers = {
  apikey: FIXTURE_PUBLISHABLE_KEY,
  authorization: `Bearer ${login.session.access_token}`,
};
assert.equal((await client.auth.getUser()).data.user?.id, login.user.id);

// Cookie round trip through the REAL @supabase/ssr serializer/deserializer.
const jar = new Map<string, string>();
const cookies = {
  getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
  setAll: (items: { name: string; value: string }[]) => {
    for (const item of items) jar.set(item.name, item.value);
  },
};
const ssrSignIn = createServerClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, { cookies });
assert.equal((await ssrSignIn.auth.signInWithPassword(FIXTURE_CREDENTIALS.owner)).error, null);
assert.ok(
  Array.from(jar.keys()).some((name) => name.includes("auth-token")),
  "Real SSR SDK must have set its normal session cookie",
);
const ssrRead = createServerClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, { cookies });
assert.equal((await ssrRead.auth.getUser()).data.user?.email, FIXTURE_CREDENTIALS.owner.email);

const inventory = await client
  .from("products")
  .select("*,category:categories(id,shop_id,name)", { count: "exact" })
  .eq("shop_id", before.fixture.shopId)
  .order("name")
  .range(0, 1);
assert.equal(inventory.error, null);
assert.equal(inventory.count, 4);
assert.equal(inventory.data?.length, 2);
assert.equal(
  inventory.data?.find((product) => product.name === FIXTURE_NAMES.rice)?.category?.name,
  FIXTURE_NAMES.category,
);
const filtered = await client
  .from("products")
  .select("id", { count: "exact" })
  .eq("shop_id", before.fixture.shopId)
  .neq("id", before.fixture.products.empty)
  .gt("current_stock", 0)
  .gte("current_stock", 3)
  .lt("current_stock", 11)
  .lte("current_stock", 10)
  .in("stock_status", ["low", "in"])
  .order("current_stock", { ascending: false })
  .range(0, 1);
assert.equal(filtered.error, null);
assert.equal(filtered.count, 3);
assert.equal(filtered.data?.length, 2);
const searched = await client
  .from("products")
  .select("name")
  .or("name.ilike.%Rice%,sku.ilike.%FIX-RICE%");
assert.equal(searched.error, null);
assert.equal(searched.data?.[0].name, FIXTURE_NAMES.rice);
const uncategorized = await client.from("products").select("id").is("category_id", null);
assert.equal(uncategorized.error, null);
assert.equal(uncategorized.data?.length, 2);
const count = await client
  .from("products")
  .select("id", { count: "exact", head: true })
  .in("stock_status", ["low", "out"]);
assert.equal(count.error, null);
assert.equal(count.count, 2);
assert.equal(count.data, null);
assert.equal(
  (await client.from("shops").select("id,name").eq("id", before.fixture.shopId).single()).data
    ?.name,
  FIXTURE_NAMES.shop,
);
assert.equal(
  (await client.from("products").select("id").eq("id", randomUUID()).maybeSingle()).data,
  null,
);
assert.equal((await client.from("products").select("id").single()).error?.code, "PGRST116");
const ranged = await fetch(`${FIXTURE_ORIGIN}/rest/v1/products?select=id&order=name.asc`, {
  headers: { ...headers, range: "1-2", "range-unit": "items", prefer: "count=exact" },
});
assert.equal(ranged.headers.get("content-range"), "1-2/4");
assert.equal(((await ranged.json()) as unknown[]).length, 2);

// Real RLS filters a second shop, even if the caller explicitly asks for it.
const forbiddenRead = await client
  .from("products")
  .select("*")
  .eq("shop_id", before.fixture.otherShopId);
assert.equal(forbiddenRead.error, null);
assert.deepEqual(forbiddenRead.data, []);
const forbiddenRpc = await client.rpc("report_shop", {
  p_shop_id: before.fixture.otherShopId,
  p_from: "2026-01-01T00:00:00Z",
  p_to: "2027-01-01T00:00:00Z",
});
assert.equal(forbiddenRpc.error?.code, "42501");
for (const path of [
  "auth.users?select=*",
  "products?select=id&name=like.*",
  "products?select=id&or=(name.eq.Fixture)",
  "products?select=id&unknown=eq.1",
  "products?select=id&order=name.asc;drop",
]) {
  assert.equal(
    (await fetch(`${FIXTURE_ORIGIN}/rest/v1/${path}`, { headers })).status,
    400,
    `Unsupported grammar must reject: ${path}`,
  );
}
assert.equal(
  (
    await fetch(`${FIXTURE_ORIGIN}/rest/v1/products`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    })
  ).status,
  405,
);
assert.equal(
  (
    await fetch(`${FIXTURE_ORIGIN}/rest/v1/products?select=id`, {
      headers: { ...headers, authorization: "Bearer synthetically-forged-invalid" },
    })
  ).status,
  401,
);

const saleArgs = {
  p_request_id: randomUUID(),
  p_note: null,
  p_customer_contact: null,
  p_customer_name: null,
  p_payment_method: "cash",
  p_items: [
    {
      product_id: before.fixture.products.rice,
      quantity: "2.000",
      unit_price: "5.00",
      discount: "0.00",
    },
  ],
  p_shop_id: before.fixture.shopId,
};
// Deliberately shuffled named arguments: SQL signature order must not depend on JSON order.
const posted = await client.rpc("post_sale", saleArgs);
assert.equal(posted.error, null);
assert.ok(posted.data.id);
assert.deepEqual((await client.rpc("post_sale", saleArgs)).data, posted.data);
const afterSale = await state();
assert.equal(
  Number(
    afterSale.products.find((product) => product.id === before.fixture.products.rice)!
      .current_stock,
  ),
  8,
);
assert.equal(afterSale.counts.sales, before.counts.sales + 1);
assert.equal(afterSale.counts.movements, before.counts.movements + 1);
assert.equal(afterSale.counts.payments, before.counts.payments + 1);
const oversell = await client.rpc("post_sale", {
  ...saleArgs,
  p_request_id: randomUUID(),
  p_items: [{ ...saleArgs.p_items[0], quantity: "999.000" }],
});
assert.ok(oversell.error);
assert.match(oversell.error.message, /stock/i);
const afterFailure = await state();
assert.deepEqual(
  afterFailure.counts,
  afterSale.counts,
  "Failed RPC must roll back events AND idempotency reservation",
);
assert.deepEqual(afterFailure.products, afterSale.products);
const report = await client.rpc("report_shop", {
  p_shop_id: before.fixture.shopId,
  p_from: new Date(Date.now() - 86_400_000).toISOString(),
  p_to: new Date(Date.now() + 86_400_000).toISOString(),
});
assert.equal(report.error, null);
assert.equal(Number(report.data.summary.revenue), 27);
const refreshed = await client.auth.refreshSession();
assert.equal(refreshed.error, null);
assert.ok(refreshed.data.session);
assert.equal((await client.auth.getUser()).data.user?.id, login.user.id);
assert.equal((await client.auth.signOut()).error, null);
assert.equal((await client.auth.getUser()).data.user, null);
// Leave a pristine dataset and revoke all self-check sessions.
assert.equal(
  (await fetch(`${FIXTURE_ORIGIN}/__fixture/reset`, { method: "POST", headers: controls })).status,
  200,
);
console.log(
  "PASS: explicit auth credentials; signed fixture JWT; real SSR cookie round trip; safe read grammar/ranges/count/head/single; real RLS; named SQL RPC; idempotency; oversell rollback; report; refresh/sign-out. No browser, hosted service, or external network used.",
);
