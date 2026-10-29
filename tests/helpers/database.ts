import { PGlite, type Results } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ProductInput } from "../../src/lib/types";

export const USERS = {
  owner: "10000000-0000-4000-8000-000000000001",
  other: "10000000-0000-4000-8000-000000000002",
  staff: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
} as const;
export interface RpcResult {
  id: string;
  [key: string]: unknown;
}
export const requestId = () => randomUUID();

/** Real PostgreSQL engine in memory, not a mocked repository or mocked RPC. */
export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin noinherit nobypassrls;
    create role authenticated nologin noinherit nobypassrls;
    create role service_role nologin noinherit bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
  const files = (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort();
  if (!files.length) throw new Error("No migrations found on disk");
  for (const name of files) await db.exec(await readFile(`${migrations}/${name}`, "utf8"));
  return db;
}

export async function asUser<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
  role: "authenticated" | "anon" = "authenticated",
): Promise<Results<T>> {
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [userId ?? "", JSON.stringify(userId ? { sub: userId, role } : { role })],
    );
    await tx.exec(`set local role ${role}`);
    return tx.query<T>(sql, params);
  });
}

/** Calls RPCs under the same non-owner database role used by Supabase clients. */
export async function rpc<T = RpcResult>(
  db: PGlite,
  userId: string | null,
  name: string,
  args: unknown[],
): Promise<T> {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Unsafe test RPC name");
  const values = args.map((value) =>
    typeof value === "object" && value !== null ? JSON.stringify(value) : value,
  );
  const result = await asUser<{ data: T }>(
    db,
    userId,
    `select public.${name}(${values.map((_, i) => `$${i + 1}`).join(",")}) as data`,
    values,
  );
  return result.rows[0].data;
}

export async function fixture(db: PGlite) {
  // Administrative fixture reset is intentionally not an application operation.
  await db.exec("truncate public.shops,auth.users cascade");
  for (const id of Object.values(USERS))
    await db.query("insert into auth.users(id) values($1)", [id]);
  const bootstrapKey = requestId();
  const shop = await rpc(db, USERS.owner, "create_shop", [
    "Test shop",
    "USD",
    "America/New_York",
    bootstrapKey,
  ]);
  const otherShop = await rpc(db, USERS.other, "create_shop", [
    "Other shop",
    "EUR",
    "UTC",
    requestId(),
  ]);
  await db.query(
    "insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,'staff')",
    [shop.id, USERS.staff],
  );
  return { shopId: shop.id, otherShopId: otherShop.id, bootstrapKey };
}

export function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Test product",
    category_id: null,
    sku: null,
    barcode: null,
    unit: "piece",
    cost_price: "2.0000",
    selling_price: "5.00",
    opening_stock: "10.000",
    low_stock_threshold: "2.000",
    is_active: true,
    ...overrides,
  };
}
export async function product(
  db: PGlite,
  shopId: string,
  overrides: Partial<ProductInput> = {},
  user: string = USERS.owner,
) {
  return rpc(db, user, "save_product", [shopId, null, productInput(overrides), requestId()]);
}
export async function sale(
  db: PGlite,
  shopId: string,
  productId: string,
  quantity = "1.000",
  price = "5.00",
  method = "cash",
  key = requestId(),
  discount = "0.00",
) {
  return rpc(db, USERS.owner, "post_sale", [
    shopId,
    [{ product_id: productId, quantity, unit_price: price, discount }],
    method,
    method === "credit" ? "Credit customer" : null,
    null,
    null,
    key,
  ]);
}
export async function row<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}

/** Test-only clock fixtures: temporarily disable immutable triggers as the owner.
 * No production RPC accepts an override for posting timestamps.
 */
export async function stampSale(db: PGlite, id: string, time: string) {
  await db.transaction(async (tx) => {
    await tx.exec(
      "alter table public.sales disable trigger user; alter table public.payments disable trigger user; alter table public.cashbook_entries disable trigger user",
    );
    await tx.query("update public.sales set occurred_at=$2::timestamptz where id=$1", [id, time]);
    await tx.query("update public.payments set occurred_at=$2::timestamptz where sale_id=$1", [
      id,
      time,
    ]);
    await tx.query(
      "update public.cashbook_entries set occurred_at=$2::timestamptz where payment_id in (select id from public.payments where sale_id=$1)",
      [id, time],
    );
    await tx.exec(
      "alter table public.sales enable trigger user; alter table public.payments enable trigger user; alter table public.cashbook_entries enable trigger user",
    );
  });
}
export async function stampAdjustment(db: PGlite, id: string, time: string) {
  await db.transaction(async (tx) => {
    await tx.exec(
      "alter table public.sale_adjustments disable trigger user; alter table public.payments disable trigger user; alter table public.cashbook_entries disable trigger user",
    );
    await tx.query("update public.sale_adjustments set occurred_at=$2::timestamptz where id=$1", [
      id,
      time,
    ]);
    await tx.query(
      "update public.payments set occurred_at=$2::timestamptz where adjustment_id=$1",
      [id, time],
    );
    await tx.query(
      "update public.cashbook_entries set occurred_at=$2::timestamptz where payment_id in (select id from public.payments where adjustment_id=$1)",
      [id, time],
    );
    await tx.exec(
      "alter table public.sale_adjustments enable trigger user; alter table public.payments enable trigger user; alter table public.cashbook_entries enable trigger user",
    );
  });
}
export async function stampPayment(db: PGlite, id: string, time: string) {
  await db.transaction(async (tx) => {
    await tx.exec(
      "alter table public.payments disable trigger user; alter table public.cashbook_entries disable trigger user",
    );
    await tx.query("update public.payments set occurred_at=$2::timestamptz where id=$1", [
      id,
      time,
    ]);
    await tx.query(
      "update public.cashbook_entries set occurred_at=$2::timestamptz where payment_id=$1",
      [id, time],
    );
    await tx.exec(
      "alter table public.payments enable trigger user; alter table public.cashbook_entries enable trigger user",
    );
  });
}
