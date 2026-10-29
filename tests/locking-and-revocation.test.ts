import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Report } from "../src/lib/types";
import {
  USERS,
  asUser,
  createDatabase,
  fixture,
  product,
  requestId,
  row,
  rpc,
} from "./helpers/database";

describe("mixed-return lock ordering and retained staff revocation", () => {
  let db: PGlite, shopId: string, otherShopId: string;
  beforeAll(async () => {
    db = await createDatabase();
  });
  beforeEach(async () => {
    ({ shopId, otherShopId } = await fixture(db));
  });
  afterAll(async () => {
    await db?.close();
  });

  it("locks every return-referenced product in UUID order, not just restocked products", async () => {
    const definition = await row<{ definition: string }>(
      db,
      "select pg_get_functiondef('pos_private.return_core(uuid,uuid,jsonb,text,text,boolean)'::regprocedure) definition",
    );
    const lock = definition.definition.match(
      /perform p\.id[\s\S]*?order by p\.id for update/i,
    )?.[0];
    expect(lock).toContain("jsonb_array_elements(v_lines)");
    expect(lock).not.toMatch(/where\s+\(x->>'restock'\)/i);
    expect(lock).not.toContain("restock");
    // Structural regression guard only, not an independent-session deadlock proof.
  });

  it("mixed dispositions still restock only selected goods and retain discarded COGS", async () => {
    const a = await product(db, shopId, { name: "No-restock item", opening_stock: "3" });
    const b = await product(db, shopId, { name: "Restock item", opening_stock: "3" });
    const s = await rpc(db, USERS.owner, "post_sale", [
      shopId,
      [
        { product_id: a.id, quantity: "1", unit_price: "5.00", discount: "0" },
        { product_id: b.id, quantity: "1", unit_price: "5.00", discount: "0" },
      ],
      "cash",
      null,
      null,
      null,
      requestId(),
    ]);
    const items = (
      await db.query<{ id: string; product_id: string }>(
        "select id,product_id from public.sale_items where sale_id=$1",
        [s.id],
      )
    ).rows;
    const adjusted = await rpc(db, USERS.owner, "return_sale", [
      shopId,
      s.id,
      items.map((i) => ({ sale_item_id: i.id, quantity: "1", restock: i.product_id === b.id })),
      "Mixed return disposition",
      "cash",
      requestId(),
    ]);
    expect(adjusted.refund).toBe("10.00");
    expect(
      (
        await row<{ stock: string }>(
          db,
          "select current_stock::text stock from public.products where id=$1",
          [a.id],
        )
      ).stock,
    ).toBe("2");
    expect(
      (
        await row<{ stock: string }>(
          db,
          "select current_stock::text stock from public.products where id=$1",
          [b.id],
        )
      ).stock,
    ).toBe("3");
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.inventory_movements where kind='return'",
        )
      ).n,
    ).toBe(1);
    const r = await rpc<Report>(db, USERS.owner, "report_shop", [
      shopId,
      "2026-01-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
    ]);
    expect(Number(r.summary.revenue)).toBe(0);
    expect(Number(r.summary.cost_of_goods)).toBe(2);
    expect(Number(r.summary.estimated_net_profit)).toBe(-2);
  });

  it("mutations share-lock active membership before posting, while stable reports use the read checker", async () => {
    const start = await row<{ definition: string }>(
      db,
      "select pg_get_functiondef('pos_private.start_request(uuid,text,jsonb,uuid)'::regprocedure) definition",
    );
    const member = await row<{ definition: string }>(
      db,
      "select pg_get_functiondef('pos_private.lock_member(uuid,boolean)'::regprocedure) definition",
    );
    const report = await row<{ definition: string }>(
      db,
      "select pg_get_functiondef('public.report_shop(uuid,timestamptz,timestamptz)'::regprocedure) definition",
    );
    expect(start.definition).toContain("pos_private.lock_member");
    expect(member.definition).toMatch(/is_active for share/i);
    expect(report.definition).toContain("pos_private.require_member");
    expect(report.definition).not.toContain("pos_private.lock_member");
  });

  it("revokes staff without deleting their referenced audit, sale or membership history", async () => {
    const p = await product(db, shopId);
    const oldKey = requestId();
    await rpc(db, USERS.staff, "create_category", [shopId, "Staff-created category", oldKey]);
    const s = await rpc(db, USERS.staff, "post_sale", [
      shopId,
      [{ product_id: p.id, quantity: "1", unit_price: "5.00", discount: "0" }],
      "cash",
      null,
      null,
      null,
      requestId(),
    ]);
    const revoked = await rpc(db, USERS.owner, "revoke_staff", [
      shopId,
      USERS.staff,
      "Staff offboarding",
      requestId(),
    ]);
    expect(revoked).toEqual({ id: USERS.staff, is_active: false });
    expect(
      await row(
        db,
        "select is_active,revoked_at is not null stamped from public.shop_memberships where user_id=$1",
        [USERS.staff],
      ),
    ).toEqual({ is_active: false, stamped: true });
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.audit_records where user_id=$1",
          [USERS.staff],
        )
      ).n,
    ).toBe(2);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.sales where id=$1 and created_by=$2",
          [s.id, USERS.staff],
        )
      ).n,
    ).toBe(1);
    await expect(
      db.query("delete from public.shop_memberships where shop_id=$1 and user_id=$2", [
        shopId,
        USERS.staff,
      ]),
    ).rejects.toThrow(/foreign key/);
    const ownerReport = await rpc<Report>(db, USERS.owner, "report_shop", [
      shopId,
      "2026-01-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
    ]);
    expect(Number(ownerReport.summary.revenue)).toBe(5);
    await expect(
      rpc(db, USERS.staff, "create_category", [shopId, "Staff-created category", oldKey]),
    ).rejects.toThrow(/Active shop membership/);
  });

  it("a revoked member can see only their own tombstone, no shop data or RPC results", async () => {
    await product(db, shopId);
    await rpc(db, USERS.owner, "revoke_staff", [
      shopId,
      USERS.staff,
      "Access removed",
      requestId(),
    ]);
    const membership = await asUser(
      db,
      USERS.staff,
      "select user_id,is_active from public.shop_memberships",
    );
    expect(membership.rows).toEqual([{ user_id: USERS.staff, is_active: false }]);
    for (const table of ["shops", "products", "sales_ledger", "audit_records", "idempotency_keys"])
      expect((await asUser(db, USERS.staff, `select * from public.${table}`)).rows).toEqual([]);
    expect(
      (await asUser(db, USERS.staff, "select public.is_shop_member($1) allowed", [shopId])).rows,
    ).toEqual([{ allowed: false }]);
    await expect(
      rpc(db, USERS.staff, "report_shop", [shopId, "2026-01-01", "2027-01-01"]),
    ).rejects.toThrow(/Active shop membership/);
    await expect(
      rpc(db, USERS.staff, "create_shop", ["New shop", "USD", "UTC", requestId()]),
    ).rejects.toThrow(/already belongs/);
    await expect(
      asUser(
        db,
        USERS.staff,
        "update public.shop_memberships set is_active=true,revoked_at=null where user_id=$1",
        [USERS.staff],
      ),
    ).rejects.toThrow(/permission/);
  });

  it("only an active owner can revoke staff, never themselves or another owner", async () => {
    await expect(
      rpc(db, USERS.staff, "revoke_staff", [
        shopId,
        USERS.owner,
        "Unauthorized attempt",
        requestId(),
      ]),
    ).rejects.toThrow(/membership/);
    await expect(
      rpc(db, USERS.other, "revoke_staff", [shopId, USERS.staff, "Wrong shop", requestId()]),
    ).rejects.toThrow(/membership/);
    await expect(
      rpc(db, null, "revoke_staff", [shopId, USERS.staff, "Anonymous attempt", requestId()]),
    ).rejects.toThrow(/Authentication/);
    await expect(
      rpc(db, USERS.owner, "revoke_staff", [shopId, USERS.owner, "Self revocation", requestId()]),
    ).rejects.toThrow(/own owner/);
    await expect(
      rpc(db, USERS.owner, "revoke_staff", [shopId, USERS.other, "Different shop", requestId()]),
    ).rejects.toThrow(/Staff member/);
    await db.query(
      "insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,'owner')",
      [shopId, USERS.outsider],
    );
    await expect(
      rpc(db, USERS.owner, "revoke_staff", [shopId, USERS.outsider, "Other owner", requestId()]),
    ).rejects.toThrow(/Staff member/);
    expect(
      (await asUser(db, USERS.other, "select id from public.shops where id=$1", [otherShopId]))
        .rows,
    ).toHaveLength(1);
  });

  it("revocation is idempotent and audited once; invalid requests do not consume keys", async () => {
    const key = requestId(),
      args = [shopId, USERS.staff, "Staff contract ended", key];
    const first = await rpc(db, USERS.owner, "revoke_staff", args);
    expect(await rpc(db, USERS.owner, "revoke_staff", args)).toEqual(first);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.audit_records where action='revoke_staff'",
        )
      ).n,
    ).toBe(1);
    expect(
      (
        await row<{ reason: string }>(
          db,
          "select details->>'reason' reason from public.audit_records where action='revoke_staff'",
        )
      ).reason,
    ).toBe("Staff contract ended");
    await expect(
      rpc(db, USERS.owner, "revoke_staff", [shopId, USERS.staff, "Changed reason", key]),
    ).rejects.toThrow(/Idempotency/);
    const failed = requestId();
    await expect(
      rpc(db, USERS.owner, "revoke_staff", [shopId, USERS.staff, "New request", failed]),
    ).rejects.toThrow(/already revoked/);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.idempotency_keys where request_id=$1",
          [failed],
        )
      ).n,
    ).toBe(0);
  });

  it("retained revocation state is constrained and private locking helpers stay inaccessible", async () => {
    await expect(
      db.query("update public.shop_memberships set is_active=false where user_id=$1", [
        USERS.staff,
      ]),
    ).rejects.toThrow(/membership_revocation_state/);
    await expect(
      asUser(db, USERS.owner, "select pos_private.lock_member($1)", [shopId]),
    ).rejects.toThrow(/permission/);
    const grants = await row(
      db,
      "select has_function_privilege('anon','public.revoke_staff(uuid,uuid,text,uuid)','EXECUTE') anon,has_function_privilege('authenticated','public.revoke_staff(uuid,uuid,text,uuid)','EXECUTE') member",
    );
    expect(grants).toEqual({ anon: false, member: true });
  });
});
