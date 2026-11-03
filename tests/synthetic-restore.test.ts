import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, fixture, product, sale, row, USERS } from "./helpers/database";

describe("synthetic isolated recovery exercise", () => {
  it("restores a local PGlite snapshot and preserves ledger, inventory, membership and tenant isolation", async () => {
    // NOT a hosted Supabase backup, cloud restore, Auth configuration or Storage-object drill.
    const source = await createDatabase();
    let restored: PGlite | undefined;
    try {
      const f = await fixture(source);
      const p = await product(source, f.shopId, {
        name: "Synthetic recovery notebook",
        opening_stock: "3",
        selling_price: "10.00",
        cost_price: "4.0000",
      });
      const posted = await sale(source, f.shopId, p.id, "1", "10.00", "credit");
      const snap = await source.dumpDataDir();
      expect(snap.size).toBeGreaterThan(0);
      restored = new PGlite({ loadDataDir: snap });
      await restored.waitReady;
      const balance = await row<{ current_stock: string; due: string }>(
        restored,
        "select p.current_stock::text, s.balance_due::text as due from public.products p join public.sales_ledger s on s.shop_id=p.shop_id where p.id=$1 and s.id=$2",
        [p.id, posted.id],
      );
      expect(balance).toEqual({ current_stock: "2", due: "10.00" });
      expect(
        (await asUser(restored, USERS.owner, "select id from public.products where id=$1", [p.id]))
          .rows,
      ).toHaveLength(1);
      expect(
        (await asUser(restored, USERS.other, "select id from public.products where id=$1", [p.id]))
          .rows,
      ).toHaveLength(0);
      await expect(
        asUser(restored, null, "select id from public.products where id=$1", [p.id], "anon"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await restored?.close();
      await source.close();
    }
  }, 30000);
});
