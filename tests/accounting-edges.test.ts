import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import type { Report } from "../src/lib/types";
import {
  USERS,
  createDatabase,
  fixture,
  product,
  productInput,
  requestId,
  row,
  rpc,
  sale,
} from "./helpers/database";

describe("integration accounting and stale-edit safeguards", () => {
  let db: PGlite, shopId: string;
  beforeAll(async () => {
    db = await createDatabase();
  });
  beforeEach(async () => {
    ({ shopId } = await fixture(db));
  });
  afterAll(async () => {
    await db?.close();
  });
  const report = () =>
    rpc<Report>(db, USERS.owner, "report_shop", [
      shopId,
      "2026-01-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
    ]);
  async function lineId(saleId: string) {
    return (
      await row<{ id: string }>(db, "select id from public.sale_items where sale_id=$1", [saleId])
    ).id;
  }

  it("retains COGS when a refunded product is not returned to saleable stock", async () => {
    const p = await product(db, shopId, { opening_stock: "1" });
    const s = await sale(db, shopId, p.id, "1", "5.00");
    await rpc(db, USERS.owner, "return_sale", [
      shopId,
      s.id,
      [{ sale_item_id: await lineId(s.id), quantity: "1", restock: false }],
      "Damaged return",
      "cash",
      requestId(),
    ]);
    const r = await report();
    expect(Number(r.summary.revenue)).toBe(0);
    expect(Number(r.summary.cost_of_goods)).toBe(2);
    expect(Number(r.summary.gross_profit)).toBe(-2);
    expect(Number(r.summary.refunds)).toBe(5);
    expect(
      (
        await row<{ stock: string }>(
          db,
          "select current_stock::text stock from public.products where id=$1",
          [p.id],
        )
      ).stock,
    ).toBe("0");
  });
  it("reverses COGS only for the restocked part of mixed returns", async () => {
    const p = await product(db, shopId, { opening_stock: "2" });
    const s = await sale(db, shopId, p.id, "2", "5.00");
    const item = await lineId(s.id);
    for (const restock of [true, false])
      await rpc(db, USERS.owner, "return_sale", [
        shopId,
        s.id,
        [{ sale_item_id: item, quantity: "1", restock }],
        "Customer return",
        "cash",
        requestId(),
      ]);
    const r = await report();
    expect(Number(r.summary.revenue)).toBe(0);
    expect(Number(r.summary.cost_of_goods)).toBe(2);
    expect(Number(r.summary.gross_profit)).toBe(-2);
    expect(
      (
        await row<{ stock: string }>(
          db,
          "select current_stock::text stock from public.products where id=$1",
          [p.id],
        )
      ).stock,
    ).toBe("1");
  });
  it("keeps unknown original cost unavailable after a non-restocked refund", async () => {
    const p = await product(db, shopId, { opening_stock: "1", cost_price: null });
    const s = await sale(db, shopId, p.id);
    await rpc(db, USERS.owner, "return_sale", [
      shopId,
      s.id,
      [{ sale_item_id: await lineId(s.id), quantity: "1", restock: false }],
      "Unsaleable return",
      "cash",
      requestId(),
    ]);
    expect((await report()).summary.gross_profit).toBeNull();
  });
  it("rejects a stale catalog form after receiving changes weighted cost, without consuming its key", async () => {
    const p = await product(db, shopId);
    const before = await row<{ updated_at: string }>(
      db,
      "select updated_at::text from public.products where id=$1",
      [p.id],
    );
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "10",
      "4.0000",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    const key = requestId();
    await expect(
      rpc(db, USERS.owner, "save_product", [
        shopId,
        p.id,
        {
          ...productInput({ name: "Stale name", opening_stock: "0", is_active: false }),
          expected_updated_at: before.updated_at,
        },
        key,
      ]),
    ).rejects.toThrow(/changed since/);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.idempotency_keys where request_id=$1",
          [key],
        )
      ).n,
    ).toBe(0);
    const current = await row<{ updated_at: string; cost: string; is_active: boolean }>(
      db,
      "select updated_at::text,cost_price::text cost,is_active from public.products where id=$1",
      [p.id],
    );
    expect(current.cost).toBe("3.0000");
    expect(current.is_active).toBe(true);
    const edited = {
      ...productInput({ name: "Fresh name", opening_stock: "0", cost_price: current.cost }),
      expected_updated_at: current.updated_at,
    };
    const result = await rpc(db, USERS.owner, "save_product", [shopId, p.id, edited, key]);
    expect(await rpc(db, USERS.owner, "save_product", [shopId, p.id, edited, key])).toEqual(result);
    const audit = await row<{ before_name: string; after_name: string }>(
      db,
      "select details->'before'->>'name' before_name,details->'after'->>'name' after_name from public.audit_records where entity_id=$1 and details->>'request_id'=$2",
      [p.id, key],
    );
    expect(audit).toEqual({ before_name: "Test product", after_name: "Fresh name" });
  });
  it("never reposts a shop request if a different operator retries a persisted checkout", async () => {
    const p = await product(db, shopId);
    const key = requestId();
    const original = await sale(db, shopId, p.id, "1.000", "5.00", "cash", key);
    await expect(
      rpc(db, USERS.staff, "post_sale", [
        shopId,
        [{ product_id: p.id, quantity: "1.000", unit_price: "5.00", discount: "0.00" }],
        "cash",
        null,
        null,
        null,
        key,
      ]),
    ).rejects.toThrow(/idempotency_shop_request_idx/);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.sale_items where product_id=$1",
          [p.id],
        )
      ).n,
    ).toBe(1);
    expect(await sale(db, shopId, p.id, "1.000", "5.00", "cash", key)).toEqual(original);
  });
  it("runs the published read-only reconciliation queries against sale, return, collection and expense records", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "2", "5.00", "credit");
    await rpc(db, USERS.owner, "collect_payment", [
      shopId,
      s.id,
      "3.00",
      "digital",
      null,
      requestId(),
    ]);
    await rpc(db, USERS.owner, "return_sale", [
      shopId,
      s.id,
      [{ sale_item_id: await lineId(s.id), quantity: "1", restock: true }],
      "Customer return",
      "digital",
      requestId(),
    ]);
    await rpc(db, USERS.owner, "record_expense", [
      shopId,
      "Shop cleaning",
      "Maintenance",
      "1.00",
      "cash",
      "2026-02-01",
      requestId(),
    ]);
    const sql = await readFile(new URL("../scripts/reconcile.sql", import.meta.url), "utf8");
    for (const result of await db.exec(sql)) expect(result.rows).toEqual([]);
  });
  it("rejects malformed optional revision timestamps inside SQL", async () => {
    const p = await product(db, shopId);
    for (const expected of [null, false, "not-a-date", "infinity"])
      await expect(
        rpc(db, USERS.owner, "save_product", [
          shopId,
          p.id,
          { ...productInput({ opening_stock: "0" }), expected_updated_at: expected },
          requestId(),
        ]),
      ).rejects.toThrow(/expected_updated_at/);
  });
  it("freezes currency as soon as catalog money values exist, before a first sale", async () => {
    await product(db, shopId);
    await expect(
      rpc(db, USERS.owner, "update_shop", [shopId, "Same shop", "EUR", "UTC", requestId()]),
    ).rejects.toThrow(/Currency cannot change/);
  });
  it("enforces actual rather than future-dated expenses and cash movements even through direct RPC", async () => {
    await expect(
      rpc(db, USERS.owner, "record_expense", [
        shopId,
        "Future rent",
        "Rent",
        "10.00",
        "cash",
        "9999-12-31",
        requestId(),
      ]),
    ).rejects.toThrow(/Future-dated/);
    await expect(
      rpc(db, USERS.owner, "record_cash_movement", [
        shopId,
        "owner_deposit",
        "Future deposit",
        "10.00",
        "cash",
        "9999-12-31",
        requestId(),
      ]),
    ).rejects.toThrow(/Future-dated/);
    expect(
      (await row<{ n: number }>(db, "select count(*)::int n from public.cashbook_entries")).n,
    ).toBe(0);
  });
});
