/** Optional, explicit integration check against an ISOLATED Supabase test shop.
 * Uses HTTPS Data API requests, not a database password or service-role key.
 * Never run against a working shop; the resulting audit history is intentional.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const required = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_PUBLISHABLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
] as const;
for (const name of required)
  if (!process.env[name])
    throw new Error(
      `Set ${name} securely in your local test environment. Do not paste credentials into chat.`,
    );
if (process.env.POS_CONCURRENCY_TEST_CONFIRM !== "isolated-test-shop")
  throw new Error(
    "Refusing to create records. Set POS_CONCURRENCY_TEST_CONFIRM=isolated-test-shop only for a disposable test shop.",
  );
const url = new URL(process.env.SUPABASE_TEST_URL!);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Use HTTPS or local Supabase.");
const key = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
if (key.startsWith("sb_secret_"))
  throw new Error("Use a publishable key, never a secret/service-role key.");
const supabase = createClient(url.origin, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await supabase.auth.signInWithPassword({
  email: process.env.SUPABASE_TEST_EMAIL!,
  password: process.env.SUPABASE_TEST_PASSWORD!,
});
if (login.error) throw new Error(`Test sign-in failed (${login.error.status ?? "unknown"}).`);
const membership = await supabase
  .from("shop_memberships")
  .select("shop_id")
  .eq("user_id", login.data.user.id)
  .single();
if (membership.error)
  throw new Error("Create the isolated test shop through onboarding before this check.");
const shopId = membership.data.shop_id as string;
const tag = randomUUID().slice(0, 12);
async function rpc(name: string, args: Record<string, unknown>) {
  return supabase.rpc(name, { p_shop_id: shopId, ...args });
}
async function createProduct(stock = "1.000") {
  const result = await rpc("save_product", {
    p_product_id: null,
    p_product: {
      name: `Concurrency fixture ${tag} ${randomUUID().slice(0, 4)}`,
      category_id: null,
      sku: null,
      barcode: null,
      unit: "unit",
      cost_price: "0.0100",
      selling_price: "0.02",
      opening_stock: stock,
      low_stock_threshold: "0",
      is_active: true,
    },
    p_request_id: randomUUID(),
  });
  if (result.error) throw new Error(`Test product could not be created (${result.error.code}).`);
  return (result.data as { id: string }).id;
}
function saleArgs(productId: string, requestId = randomUUID()) {
  return {
    p_items: [{ product_id: productId, quantity: "1.000", unit_price: "0.02", discount: "0.00" }],
    p_payment_method: "cash",
    p_customer_name: null,
    p_customer_contact: null,
    p_note: "Isolated concurrency verification",
    p_request_id: requestId,
  };
}
try {
  const single = await createProduct();
  const competing = await Promise.all([
    rpc("post_sale", saleArgs(single)),
    rpc("post_sale", saleArgs(single)),
  ]);
  assert.equal(
    competing.filter((result) => !result.error).length,
    1,
    "Exactly one competing sale must commit",
  );
  assert.equal(
    competing.filter((result) => result.error?.code === "23514").length,
    1,
    "The other sale must fail the stock guard",
  );
  const stock = await supabase
    .from("products")
    .select("current_stock::text")
    .eq("id", single)
    .single();
  assert.equal(
    Number((stock.data as unknown as { current_stock: string })?.current_stock),
    0,
    "Stock must be exactly zero",
  );

  const repeated = await createProduct();
  const key = randomUUID(),
    args = saleArgs(repeated, key);
  const retries = await Promise.all(Array.from({ length: 8 }, () => rpc("post_sale", args)));
  for (const result of retries)
    assert.equal(result.error, null, "Every identical retry must recover a committed result");
  assert.equal(
    new Set(retries.map((result) => (result.data as { id: string }).id)).size,
    1,
    "All retries must return the SAME sale ID",
  );
  const lines = await supabase
    .from("sale_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", repeated);
  assert.equal(lines.count, 1, "Retries must create only one sale line");
  const movements = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", repeated)
    .eq("kind", "sale");
  assert.equal(movements.count, 1, "Retries must deduct stock only once");
  console.log(
    "PASS: competing requests cannot oversell, eight simultaneous identical retries create one sale and one stock deduction.",
  );
  console.log(
    "Synthetic test records were deliberately retained in this isolated shop for audit; nothing was deleted.",
  );
} finally {
  await supabase.auth.signOut();
}
