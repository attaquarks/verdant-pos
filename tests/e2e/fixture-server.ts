/**
 * TEST ONLY. A deliberately small HTTP compatibility adapter, NOT GoTrue or
 * PostgREST. The Next application is unchanged and uses its normal SSR/client
 * Supabase code. SQL, grants, transactions, RLS, and RPCs are the real migrations.
 * Never import this module from src/ or deploy this service.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, product, requestId, rpc, sale, USERS } from "../helpers/database";
import {
  APP_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_NAMES,
  FIXTURE_ORIGIN,
  FIXTURE_PUBLISHABLE_KEY,
  type FixtureState,
} from "./fixture-config";

const HOST = "127.0.0.1";
const PORT = 54321;
const BODY_LIMIT = 600_000;
const MAX_ROWS = 1000;
// Intentionally public fixture material, not a production JWT signing secret.
const JWT_FIXTURE_KEY = "verdant-test-only-synthetic-signature-not-a-secret";
const TOKEN_SECONDS = 3600;
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const TABLES = new Set([
  "shops",
  "shop_memberships",
  "categories",
  "products",
  "sales_ledger",
  "sale_items_ledger",
  "inventory_movements",
  "payments",
  "sale_adjustments",
  "cashbook_entries",
  "expenses",
]);
type SqlType = "uuid" | "text" | "jsonb" | "numeric" | "timestamptz" | "date";
type RpcArgument = readonly [string, SqlType];
/** Explicit signatures: no arbitrary function names, argument names, or casts. */
const RPCS: Record<string, readonly RpcArgument[]> = {
  create_shop: [
    ["p_name", "text"],
    ["p_currency", "text"],
    ["p_time_zone", "text"],
    ["p_request_id", "uuid"],
  ],
  update_shop: [
    ["p_shop_id", "uuid"],
    ["p_name", "text"],
    ["p_currency", "text"],
    ["p_time_zone", "text"],
    ["p_request_id", "uuid"],
  ],
  create_category: [
    ["p_shop_id", "uuid"],
    ["p_name", "text"],
    ["p_request_id", "uuid"],
  ],
  revoke_staff: [
    ["p_shop_id", "uuid"],
    ["p_user_id", "uuid"],
    ["p_reason", "text"],
    ["p_request_id", "uuid"],
  ],
  save_product: [
    ["p_shop_id", "uuid"],
    ["p_product_id", "uuid"],
    ["p_product", "jsonb"],
    ["p_request_id", "uuid"],
  ],
  import_products: [
    ["p_shop_id", "uuid"],
    ["p_products", "jsonb"],
    ["p_request_id", "uuid"],
  ],
  receive_stock: [
    ["p_shop_id", "uuid"],
    ["p_product_id", "uuid"],
    ["p_quantity", "numeric"],
    ["p_unit_cost", "numeric"],
    ["p_supplier", "text"],
    ["p_payment_method", "text"],
    ["p_note", "text"],
    ["p_request_id", "uuid"],
  ],
  adjust_stock: [
    ["p_shop_id", "uuid"],
    ["p_product_id", "uuid"],
    ["p_quantity_delta", "numeric"],
    ["p_kind", "text"],
    ["p_note", "text"],
    ["p_request_id", "uuid"],
  ],
  post_sale: [
    ["p_shop_id", "uuid"],
    ["p_items", "jsonb"],
    ["p_payment_method", "text"],
    ["p_customer_name", "text"],
    ["p_customer_contact", "text"],
    ["p_note", "text"],
    ["p_request_id", "uuid"],
  ],
  collect_payment: [
    ["p_shop_id", "uuid"],
    ["p_sale_id", "uuid"],
    ["p_amount", "numeric"],
    ["p_method", "text"],
    ["p_note", "text"],
    ["p_request_id", "uuid"],
  ],
  return_sale: [
    ["p_shop_id", "uuid"],
    ["p_sale_id", "uuid"],
    ["p_items", "jsonb"],
    ["p_reason", "text"],
    ["p_refund_method", "text"],
    ["p_request_id", "uuid"],
  ],
  reverse_sale: [
    ["p_shop_id", "uuid"],
    ["p_sale_id", "uuid"],
    ["p_reason", "text"],
    ["p_refund_method", "text"],
    ["p_request_id", "uuid"],
  ],
  record_expense: [
    ["p_shop_id", "uuid"],
    ["p_description", "text"],
    ["p_category", "text"],
    ["p_amount", "numeric"],
    ["p_method", "text"],
    ["p_occurred_on", "date"],
    ["p_request_id", "uuid"],
  ],
  record_cash_movement: [
    ["p_shop_id", "uuid"],
    ["p_kind", "text"],
    ["p_description", "text"],
    ["p_amount", "numeric"],
    ["p_method", "text"],
    ["p_occurred_on", "date"],
    ["p_request_id", "uuid"],
  ],
  report_shop: [
    ["p_shop_id", "uuid"],
    ["p_from", "timestamptz"],
    ["p_to", "timestamptz"],
  ],
  cashbook_totals: [
    ["p_shop_id", "uuid"],
    ["p_from", "timestamptz"],
    ["p_to", "timestamptz"],
  ],
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "FIXTURE_UNSUPPORTED",
    public details: string | null = null,
  ) {
    super(message);
  }
}
function unsupported(message: string): never {
  throw new HttpError(400, message);
}
function quote(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    unsupported("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function hasOwn(record: object, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}
function one(params: URLSearchParams, key: string, fallback?: string): string | undefined {
  if (params.getAll(key).length > 1) unsupported(`Repeated ${key} is not supported.`);
  return params.get(key) ?? fallback;
}
function boundedInteger(value: string, name: string, max: number) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max)
    unsupported(`Invalid ${name}.`);
  return Number(value);
}
/** Split a shallow PostgREST list, never use its contents directly as SQL. */
function splitList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0,
    quoted = false,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (depth < 0 || depth > 1 || ch === "\\")
      unsupported("Unsupported nested or escaped query grammar.");
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0 || quoted) unsupported("Unbalanced query list.");
  parts.push(value.slice(start));
  if (parts.some((part) => !part.trim())) unsupported("Empty query-list item.");
  return parts.map((part) => part.trim());
}

interface FixtureUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string;
  confirmed_at: string;
  phone: string;
  created_at: string;
  updated_at: string;
  app_metadata: { provider: string; providers: string[] };
  user_metadata: Record<string, never>;
  identities: {
    id: string;
    identity_id: string;
    user_id: string;
    provider: string;
    identity_data: { sub: string; email: string };
    created_at: string;
    updated_at: string;
    last_sign_in_at: string;
  }[];
  is_anonymous: boolean;
}
interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: FixtureUser;
}
function userFor(kind: keyof typeof FIXTURE_CREDENTIALS): FixtureUser {
  const id = USERS[kind],
    email = FIXTURE_CREDENTIALS[kind].email;
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: CREATED_AT,
    confirmed_at: CREATED_AT,
    phone: "",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    is_anonymous: false,
    identities: [
      {
        id,
        identity_id: id,
        user_id: id,
        provider: "email",
        identity_data: { sub: id, email },
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
        last_sign_in_at: CREATED_AT,
      },
    ],
  };
}
function signJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const content = `${header}.${body}`;
  return `${content}.${createHmac("sha256", JWT_FIXTURE_KEY).update(content).digest("base64url")}`;
}

async function seed(db: PGlite): Promise<FixtureState["fixture"]> {
  // Only fixture administration runs as database owner. auth.users is the tiny
  // existing test auth shim. ALL business rows below are created by real RPCs.
  await db.exec("truncate public.shops, auth.users cascade");
  for (const id of [USERS.owner, USERS.other, USERS.outsider, USERS.staff])
    await db.query("insert into auth.users(id) values ($1)", [id]);
  const shop = await rpc(db, USERS.owner, "create_shop", [
    FIXTURE_NAMES.shop,
    "USD",
    "UTC",
    requestId(),
  ]);
  const otherShop = await rpc(db, USERS.other, "create_shop", [
    "Other Fixture Shop",
    "EUR",
    "UTC",
    requestId(),
  ]);
  await db.query(
    "insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,'staff')",
    [shop.id, USERS.staff],
  );
  const category = await rpc(db, USERS.owner, "create_category", [
    shop.id,
    FIXTURE_NAMES.category,
    requestId(),
  ]);
  const rice = await product(db, shop.id, {
    name: FIXTURE_NAMES.rice,
    category_id: category.id,
    sku: "FIX-RICE",
    opening_stock: "12.000",
    selling_price: "5.00",
  });
  const soap = await product(db, shop.id, {
    name: FIXTURE_NAMES.soap,
    sku: "FIX-SOAP",
    opening_stock: "3.000",
    low_stock_threshold: "3.000",
    selling_price: "3.50",
  });
  const empty = await product(db, shop.id, {
    name: FIXTURE_NAMES.empty,
    sku: "FIX-EMPTY",
    opening_stock: "0.000",
    selling_price: "1.00",
  });
  const tea = await product(db, shop.id, {
    name: FIXTURE_NAMES.tea,
    category_id: category.id,
    sku: "FIX-TEA",
    opening_stock: "8.000",
    selling_price: "7.00",
  });
  const other = await product(
    db,
    otherShop.id,
    { name: FIXTURE_NAMES.other, opening_stock: "999.000" },
    USERS.other,
  );
  const cash = await sale(db, shop.id, rice.id, "2.000", "5.00");
  const credit = await rpc(db, USERS.owner, "post_sale", [
    shop.id,
    [{ product_id: tea.id, quantity: "1.000", unit_price: "7.00", discount: "0.00" }],
    "credit",
    "Fixture Credit Customer",
    null,
    null,
    requestId(),
  ]);
  return {
    shopId: shop.id,
    otherShopId: otherShop.id,
    categoryId: category.id,
    products: { rice: rice.id, soap: soap.id, empty: empty.id, tea: tea.id, other: other.id },
    sales: { cash: cash.id, credit: credit.id },
  };
}

type ColumnMap = Map<string, Map<string, string>>;
async function columnsFor(db: PGlite): Promise<ColumnMap> {
  const { rows } = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    "select table_name,column_name,data_type from information_schema.columns where table_schema='public'",
  );
  const result: ColumnMap = new Map();
  for (const row of rows) {
    if (!TABLES.has(row.table_name)) continue;
    if (!result.has(row.table_name)) result.set(row.table_name, new Map());
    result.get(row.table_name)!.set(row.column_name, row.data_type);
  }
  for (const table of TABLES)
    if (!result.has(table)) throw new Error(`Real migrations did not create ${table}.`);
  return result;
}
interface ReadPlan {
  sql: string;
  values: unknown[];
  offset: number;
  count: boolean;
  singular: boolean;
}
function buildRead(url: URL, req: IncomingMessage, metadata: ColumnMap): ReadPlan {
  const table = url.pathname.slice("/rest/v1/".length);
  if (!TABLES.has(table)) unsupported(`Table ${table} is not supported by this fixture.`);
  const columns = metadata.get(table)!;
  const column = (name: string, textOnly = false) => {
    if (!columns.has(name)) unsupported(`Unsupported ${table} column: ${name}.`);
    if (textOnly && !["text", "character varying", "character"].includes(columns.get(name)!))
      unsupported("ilike requires a text column.");
    return `t.${quote(name)}`;
  };
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  // Numeric SELECT fields travel as exact decimal strings, avoiding a lossy
  // numeric -> SQL JSON -> JS float round trip in this small HTTP adapter.
  const projectedColumn = (name: string) =>
    `${column(name)}${columns.get(name) === "numeric" ? "::text" : ""} as ${quote(name)}`;
  const selected = splitList(one(url.searchParams, "select", "*")!);
  let embedding = false;
  const projection = selected
    .map((item) => {
      if (item === "*") return Array.from(columns.keys(), projectedColumn).join(",");
      if (item === "category:categories(id,shop_id,name)" && table === "products" && !embedding) {
        embedding = true;
        return `(select jsonb_build_object('id',c.id,'shop_id',c.shop_id,'name',c.name) from public.categories c where c.id=t.category_id and c.shop_id=t.shop_id) as category`;
      }
      const scalar = /^([a-z_]+)(?:::text)?$/.exec(item);
      if (!scalar)
        unsupported("Unsupported scalar selection; only column and column::text are supported.");
      return projectedColumn(scalar[1]);
    })
    .join(",");
  const conditions: string[] = [];
  const comparisons: Record<string, string> = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  };
  for (const [name, filter] of url.searchParams) {
    if (["select", "order", "offset", "limit"].includes(name)) continue;
    if (name === "or") {
      one(url.searchParams, "or");
      if (!filter.startsWith("(") || !filter.endsWith(")"))
        unsupported("or must be a parenthesized ilike list.");
      const terms = splitList(filter.slice(1, -1));
      if (terms.length > 8) unsupported("Too many OR terms.");
      const clauses = terms.map((term) => {
        const match = /^([a-z_]+)\.ilike\.([^(),]{1,256})$/.exec(term);
        if (!match) unsupported("Only column.ilike.pattern is supported inside or.");
        return `${column(match[1], true)} ilike ${bind(match[2].replaceAll("*", "%"))}`;
      });
      conditions.push(`(${clauses.join(" or ")})`);
      continue;
    }
    const target = column(name);
    const dot = filter.indexOf(".");
    if (dot < 1) unsupported("A filter operator is required.");
    const operator = filter.slice(0, dot),
      value = filter.slice(dot + 1);
    if (hasOwn(comparisons, operator))
      conditions.push(`${target} ${comparisons[operator]} ${bind(value)}`);
    else if (operator === "is" && ["null", "true", "false"].includes(value))
      conditions.push(`${target} is ${value}`);
    else if (operator === "in") {
      if (!value.startsWith("(") || !value.endsWith(")"))
        unsupported("in requires a parenthesized list.");
      const items = splitList(value.slice(1, -1));
      if (items.length > 100) unsupported("Too many in-list values.");
      const placeholders = items.map((item) => {
        if (!/^(?:[\w@+:/ .%-]+|"[^"\\()]*")$/.test(item))
          unsupported("Unsupported in-list literal.");
        return bind(item.startsWith('"') ? item.slice(1, -1) : item);
      });
      conditions.push(`${target} in (${placeholders.join(",")})`);
    } else unsupported(`Filter operator ${operator} is not supported.`);
  }
  const order = one(url.searchParams, "order");
  const orderSql = order
    ? ` order by ${splitList(order)
        .map((item) => {
          const match = /^([a-z_]+)(?:\.(asc|desc))?(?:\.(nullsfirst|nullslast))?$/.exec(item);
          if (!match) unsupported("Unsupported ordering grammar.");
          return `${column(match[1])} ${match[2] === "desc" ? "desc" : "asc"}${match[3] ? ` nulls ${match[3] === "nullsfirst" ? "first" : "last"}` : ""}`;
        })
        .join(",")}`
    : "";
  let offset = boundedInteger(one(url.searchParams, "offset", "0")!, "offset", 50_000);
  let limit = boundedInteger(one(url.searchParams, "limit", String(MAX_ROWS))!, "limit", MAX_ROWS);
  if (req.headers.range) {
    if (url.searchParams.has("offset") || url.searchParams.has("limit"))
      unsupported("Do not combine range headers with limit/offset.");
    if (req.headers["range-unit"] && req.headers["range-unit"] !== "items")
      unsupported("Only items range units are supported.");
    const match = /^(\d+)-(\d+)$/.exec(req.headers.range);
    if (!match) unsupported("Only a bounded items range is supported.");
    offset = boundedInteger(match[1], "range start", 50_000);
    const end = boundedInteger(match[2], "range end", 51_000);
    limit = end - offset + 1;
    if (limit < 0 || limit > MAX_ROWS) unsupported("Invalid range size.");
  }
  const preferences = String(req.headers.prefer ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (preferences.some((item) => item !== "count=exact"))
    unsupported("Only Prefer: count=exact is supported on reads.");
  const count = preferences.includes("count=exact");
  const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
  const source = `public.${quote(table)} t${where}`;
  const rowSql =
    req.method === "HEAD" ? "'[]'::jsonb" : "coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)";
  const sql =
    req.method === "HEAD"
      ? `select ${rowSql} as data, ${count ? `(select count(*) from ${source})` : "null::bigint"} as count`
      : `select ${rowSql} as data, ${count ? `(select count(*) from ${source})` : "null::bigint"} as count from (select ${projection} from ${source}${orderSql} limit ${limit} offset ${offset}) r`;
  const accept = String(req.headers.accept ?? "application/json");
  if (!["application/json", "application/vnd.pgrst.object+json", "*/*"].includes(accept))
    unsupported("Unsupported response media type.");
  return { sql, values, offset, count, singular: accept === "application/vnd.pgrst.object+json" };
}

function databaseStatus(code: string) {
  if (code === "42501") return 403;
  if (["23505", "23503", "23514", "P0001"].includes(code)) return 409;
  if (code.startsWith("22")) return 400;
  return 500;
}
async function jsonBody(req: IncomingMessage) {
  if (
    !String(req.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Use application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > BODY_LIMIT) throw new HttpError(413, "Fixture body exceeds its size limit.");
    chunks.push(bytes);
  }
  try {
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON body.");
  }
}
function send(
  res: ServerResponse,
  status: number,
  data?: unknown,
  headers: Record<string, string> = {},
) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data === undefined ? undefined : JSON.stringify(data));
}

export async function startFixtureServer() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Refusing to start the TEST-ONLY fixture with NODE_ENV=production.");
  const db = await createDatabase();
  let metadata: ColumnMap;
  let fixture: FixtureState["fixture"];
  try {
    metadata = await columnsFor(db);
    fixture = await seed(db);
  } catch (error) {
    await db.close();
    throw error;
  }
  const sessions = new Map<string, Session>();
  const refreshTokens = new Map<string, string>();
  let calls: FixtureState["calls"] = {
    signIn: 0,
    getUser: 0,
    refresh: 0,
    reads: 0,
    rpcs: 0,
    rejected: 0,
  };
  // One PGlite instance, a bounded fixture dataset, and a single database queue.
  // Never interleave SET LOCAL/ROLLBACK/reset operations between HTTP requests.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>) {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  }
  function issue(user: FixtureUser): Session {
    // Bound session memory even during long manual test sessions.
    for (const [token, old] of sessions)
      if (old.expires_at <= Date.now() / 1000) {
        sessions.delete(token);
        refreshTokens.delete(old.refresh_token);
      }
    if (sessions.size >= 100)
      throw new HttpError(429, "Too many local test sessions; reset the fixture.");
    const now = Math.floor(Date.now() / 1000),
      expires_at = now + TOKEN_SECONDS;
    const access_token = signJwt({
      iss: `${FIXTURE_ORIGIN}/auth/v1`,
      aud: "authenticated",
      sub: user.id,
      role: "authenticated",
      email: user.email,
      phone: "",
      iat: now,
      exp: expires_at,
      session_id: randomUUID(),
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      app_metadata: user.app_metadata,
      user_metadata: {},
      is_anonymous: false,
    });
    const session: Session = {
      access_token,
      refresh_token: `fixture-refresh-${randomUUID()}`,
      token_type: "bearer",
      expires_in: TOKEN_SECONDS,
      expires_at,
      user,
    };
    sessions.set(access_token, session);
    refreshTokens.set(session.refresh_token, access_token);
    return session;
  }
  function authenticate(req: IncomingMessage) {
    const authorization = req.headers.authorization ?? "";
    const token = /^Bearer ([\w.-]+)$/i.exec(authorization)?.[1];
    const session = token ? sessions.get(token) : undefined;
    if (!session || session.expires_at <= Date.now() / 1000)
      throw new HttpError(401, "Invalid or expired local fixture session.", "bad_jwt");
    const [header, body, signature] = session.access_token.split(".");
    const expected = createHmac("sha256", JWT_FIXTURE_KEY).update(`${header}.${body}`).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(expected, provided))
      throw new HttpError(401, "Invalid fixture JWT.", "bad_jwt");
    // User identity always comes from a session minted by this process, NEVER a
    // caller-provided sub/role, header, cookie body, or arbitrary unsigned JWT.
    return session;
  }
  function requireKey(req: IncomingMessage) {
    if (req.headers.apikey !== FIXTURE_PUBLISHABLE_KEY)
      throw new HttpError(
        401,
        "Use the explicit local fixture publishable key.",
        "invalid_api_key",
      );
  }
  function control(req: IncomingMessage) {
    if (req.headers[FIXTURE_CONTROL_HEADER] !== FIXTURE_CONTROL_VALUE)
      throw new HttpError(403, "Fixture control header required.");
  }
  async function snapshot(): Promise<FixtureState> {
    const products = await asUser<FixtureState["products"][number]>(
      db,
      USERS.owner,
      "select id,name,current_stock::text,stock_status,category_id from public.products order by name",
    );
    const sales = await asUser<FixtureState["sales"][number]>(
      db,
      USERS.owner,
      "select id,reference,payment_method,total::text,collected_total::text,balance_due::text,customer_name from public.sales_ledger order by occurred_at,id",
    );
    const counts = await asUser<FixtureState["counts"]>(
      db,
      USERS.owner,
      "select (select count(*)::int from public.sales) sales,(select count(*)::int from public.payments) payments,(select count(*)::int from public.inventory_movements) movements,(select count(*)::int from public.cashbook_entries) cashbook,(select count(*)::int from public.idempotency_keys) requests",
    );
    return {
      fixture,
      products: products.rows,
      sales: sales.rows,
      counts: counts.rows[0],
      calls: { ...calls },
    };
  }
  const server = createServer((req, res) => {
    void (async () => {
      if (!req.url || req.url.length > 16_384) throw new HttpError(414, "Fixture URL too long.");
      if (req.headers.host !== `${HOST}:${PORT}`)
        throw new HttpError(403, "Only the explicit loopback fixture host is allowed.");
      const origin = req.headers.origin;
      if (origin && origin !== APP_ORIGIN)
        throw new HttpError(403, "Only the local Next test origin is allowed.");
      if (origin) {
        res.setHeader("access-control-allow-origin", APP_ORIGIN);
        res.setHeader("access-control-allow-credentials", "true");
        res.setHeader("vary", "Origin");
      }
      res.setHeader(
        "access-control-expose-headers",
        "Content-Range,Range-Unit,X-Supabase-Api-Version",
      );
      res.setHeader("x-supabase-api-version", "2024-01-01");
      res.setHeader("x-content-type-options", "nosniff");
      if (req.method === "OPTIONS") {
        send(res, 204, undefined, {
          "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,range-unit,accept-profile,content-profile",
          "access-control-max-age": "600",
        });
        return;
      }
      const url = new URL(req.url, FIXTURE_ORIGIN);
      if (url.pathname === "/__fixture/ready" && req.method === "GET") {
        send(res, 200, { ready: true, engine: "PGlite", testOnly: true });
        return;
      }
      if (url.pathname.startsWith("/__fixture/")) {
        control(req);
        if (url.search) unsupported("Fixture control endpoints do not accept query parameters.");
        if (url.pathname === "/__fixture/reset" && req.method === "POST") {
          const data = await serial(async () => {
            fixture = await seed(db);
            sessions.clear();
            refreshTokens.clear();
            calls = { signIn: 0, getUser: 0, refresh: 0, reads: 0, rpcs: 0, rejected: 0 };
            return snapshot();
          });
          send(res, 200, data);
          return;
        }
        if (url.pathname === "/__fixture/state" && req.method === "GET") {
          send(res, 200, await serial(snapshot));
          return;
        }
        throw new HttpError(404, "Unknown test-only fixture endpoint or method.");
      }
      requireKey(req);
      if (url.pathname === "/auth/v1/token" && req.method === "POST") {
        const body = await jsonBody(req),
          grant = one(url.searchParams, "grant_type");
        if (grant === "password") {
          const kind = (
            Object.keys(FIXTURE_CREDENTIALS) as (keyof typeof FIXTURE_CREDENTIALS)[]
          ).find(
            (key) =>
              FIXTURE_CREDENTIALS[key].email === body.email &&
              FIXTURE_CREDENTIALS[key].password === body.password,
          );
          if (!kind) throw new HttpError(400, "Invalid login credentials", "invalid_credentials");
          calls.signIn++;
          send(res, 200, issue(userFor(kind)));
          return;
        }
        if (grant === "refresh_token") {
          const token =
            typeof body.refresh_token === "string"
              ? refreshTokens.get(body.refresh_token)
              : undefined;
          const current = token ? sessions.get(token) : undefined;
          if (!current)
            throw new HttpError(
              400,
              "Invalid local fixture refresh token.",
              "refresh_token_not_found",
            );
          sessions.delete(current.access_token);
          refreshTokens.delete(current.refresh_token);
          calls.refresh++;
          send(res, 200, issue(current.user));
          return;
        }
        unsupported("Only password and refresh_token grants are implemented.");
      }
      if (url.pathname === "/auth/v1/user" && req.method === "GET") {
        const session = authenticate(req);
        calls.getUser++;
        send(res, 200, session.user);
        return;
      }
      if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
        const session = authenticate(req);
        sessions.delete(session.access_token);
        refreshTokens.delete(session.refresh_token);
        send(res, 204);
        return;
      }
      if (url.pathname.startsWith("/rest/v1/")) {
        if (
          (req.headers["accept-profile"] && req.headers["accept-profile"] !== "public") ||
          (req.headers["content-profile"] && req.headers["content-profile"] !== "public")
        )
          unsupported("Only the public schema is supported.");
        const session = authenticate(req);
        if (url.pathname.startsWith("/rest/v1/rpc/") && req.method === "POST") {
          const name = url.pathname.slice("/rest/v1/rpc/".length);
          if (!hasOwn(RPCS, name)) unsupported(`RPC ${name} is not supported by this fixture.`);
          if (url.search) unsupported("RPC query parameters are not supported.");
          const args = await jsonBody(req),
            signature = RPCS[name];
          const names = signature.map(([argument]) => argument);
          if (
            Object.keys(args).length !== names.length ||
            names.some((argument) => !hasOwn(args, argument))
          )
            unsupported("Supply exactly the allowlisted named RPC arguments.");
          const values = signature.map(([argument, type]) => {
            const value = args[argument];
            if (type === "jsonb") return value === null ? null : JSON.stringify(value);
            if (value !== null && !["string", "number", "boolean"].includes(typeof value))
              unsupported(`Invalid scalar RPC argument ${argument}.`);
            return value;
          });
          const sql = `select public.${quote(name)}(${signature.map(([argument, type], index) => `${quote(argument)} => $${index + 1}::${type}`).join(",")}) as data`;
          // asUser uses transaction(), SET LOCAL authenticated + auth.uid(), and
          // automatic rollback on EVERY SQL error (including failed idempotency).
          const result = await serial(() =>
            asUser<{ data: unknown }>(db, session.user.id, sql, values),
          );
          calls.rpcs++;
          send(res, 200, result.rows[0].data);
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD")
          throw new HttpError(405, "Fixture tables are read-only; use an allowlisted SQL RPC.");
        const plan = buildRead(url, req, metadata);
        const result = await serial(() =>
          asUser<{ data: Record<string, unknown>[]; count: string | number | null }>(
            db,
            session.user.id,
            plan.sql,
            plan.values,
          ),
        );
        calls.reads++;
        const rows = result.rows[0].data,
          total = result.rows[0].count;
        if (plan.singular && rows.length !== 1)
          throw new HttpError(
            406,
            "Cannot coerce the result to a single JSON object",
            "PGRST116",
            `The result contains ${rows.length} rows`,
          );
        const contentRange = rows.length
          ? `${plan.offset}-${plan.offset + rows.length - 1}/${plan.count ? total : "*"}`
          : `*/${plan.count ? total : "*"}`;
        send(res, 200, req.method === "HEAD" ? undefined : plan.singular ? rows[0] : rows, {
          "content-range": contentRange,
          "range-unit": "items",
          ...(plan.singular ? { "content-type": "application/vnd.pgrst.object+json" } : {}),
        });
        return;
      }
      throw new HttpError(404, "This test-only adapter does not implement that endpoint.");
    })().catch((error: unknown) => {
      calls.rejected++;
      if (error instanceof HttpError) {
        send(res, error.status, {
          code: error.code,
          error_code: error.code,
          message: error.message,
          msg: error.message,
          details: error.details,
          hint: null,
        });
        return;
      }
      const sqlError = error as { code?: string; message?: string; detail?: string };
      if (typeof sqlError.code === "string") {
        send(res, databaseStatus(sqlError.code), {
          code: sqlError.code,
          message: sqlError.message || "SQL request failed",
          details: sqlError.detail ?? null,
          hint: null,
        });
      } else {
        console.error(
          "[fixture] Unexpected adapter error:",
          error instanceof Error ? error.message : "Unknown error",
        );
        send(res, 500, {
          code: "FIXTURE_INTERNAL",
          message: "Unexpected local fixture adapter failure",
          details: null,
          hint: null,
        });
      }
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 1000;
  try {
    await new Promise<void>((done, reject) => {
      server.once("error", reject);
      server.listen(PORT, HOST, () => {
        server.off("error", reject);
        done();
      });
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (stopping) return stopping;
    stopping = (async () => {
      const force = setTimeout(() => server.closeAllConnections(), 2000);
      force.unref();
      await new Promise<void>((done) => server.close(() => done()));
      clearTimeout(force);
      await tail;
      await db.close();
    })();
    return stopping;
  }
  return { stop };
}

// Importing for the self-check does not start a listener. No production imports.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startFixtureServer()
    .then(({ stop }) => {
      console.log(
        `[fixture] TEST ONLY: ${FIXTURE_ORIGIN} ready; real migrations + authenticated RLS in one in-memory PGlite.`,
      );
      const shutdown = () => {
        const deadline = setTimeout(() => process.exit(1), 10_000);
        deadline.unref();
        void stop().then(
          () => {
            clearTimeout(deadline);
            process.exit(0);
          },
          () => process.exit(1),
        );
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    })
    .catch((error: unknown) => {
      console.error(
        "[fixture] Startup failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exitCode = 1;
    });
}
