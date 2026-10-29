import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Report } from "../src/lib/types";
import {
  USERS,
  asUser,
  createDatabase,
  fixture,
  product,
  productInput,
  requestId,
  row,
  rpc,
  sale,
  stampAdjustment,
  stampPayment,
  stampSale,
} from "./helpers/database";

describe("PostgreSQL migration and public RPCs (real PGlite SQL; single-session)", () => {
  let db: PGlite;
  let shopId: string;
  let otherShopId: string;
  let bootstrapKey: string;
  beforeAll(async () => {
    db = await createDatabase();
    const counts = await row(
      db,
      "select (select count(*)::int from public.shops) shops,(select count(*)::int from public.sales) sales,(select count(*)::int from public.products) products",
    );
    expect(counts).toEqual({ shops: 0, sales: 0, products: 0 });
  });
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    ({ shopId, otherShopId, bootstrapKey } = await fixture(db));
  });

  async function itemId(saleId: string) {
    return (
      await row<{ id: string }>(db, "select id from public.sale_items where sale_id=$1", [saleId])
    ).id;
  }
  async function returned(
    saleId: string,
    lineId: string,
    quantity = "1.000",
    restock = true,
    key = requestId(),
  ) {
    return rpc(db, USERS.owner, "return_sale", [
      shopId,
      saleId,
      [{ sale_item_id: lineId, quantity, restock }],
      "Customer return",
      "cash",
      key,
    ]);
  }
  async function report(from = "2026-01-01T05:00:00Z", to = "2027-01-01T05:00:00Z") {
    return rpc<Report>(db, USERS.owner, "report_shop", [shopId, from, to]);
  }
  async function stock(productId: string) {
    return (
      await row<{ stock: string }>(
        db,
        "select current_stock::text stock from public.products where id=$1",
        [productId],
      )
    ).stock;
  }
  async function keyCount(key: string) {
    return (
      await row<{ n: number }>(
        db,
        "select count(*)::int n from public.idempotency_keys where request_id=$1",
        [key],
      )
    ).n;
  }

  it("bootstraps authenticated owners without seed data; retries return exactly the original shop", async () => {
    const same = await rpc(db, USERS.owner, "create_shop", [
      "Test shop",
      "USD",
      "America/New_York",
      bootstrapKey,
    ]);
    expect(same.id).toBe(shopId);
    expect(await keyCount(bootstrapKey)).toBe(1);
    await expect(
      rpc(db, USERS.owner, "create_shop", [
        "Changed name",
        "USD",
        "America/New_York",
        bootstrapKey,
      ]),
    ).rejects.toThrow(/Idempotency/);
    await expect(
      rpc(db, USERS.owner, "create_shop", ["Another shop", "USD", "UTC", requestId()]),
    ).rejects.toThrow(/already belongs/);
    await expect(
      rpc(db, null, "create_shop", ["Anonymous shop", "USD", "UTC", requestId()]),
    ).rejects.toThrow(/Authentication/);
  });

  it("validates bootstrap settings in SQL and leaves failed keys reusable", async () => {
    const key = requestId();
    await expect(
      rpc(db, USERS.outsider, "create_shop", ["Shop", "ZZZ", "UTC", key]),
    ).rejects.toThrow(/currency/);
    await expect(
      rpc(db, USERS.outsider, "create_shop", ["Shop", "USD", "No/Such_Zone", key]),
    ).rejects.toThrow(/time zone/);
    await expect(rpc(db, USERS.outsider, "create_shop", ["X", "USD", "UTC", key])).rejects.toThrow(
      /shop name/,
    );
    expect(await keyCount(key)).toBe(0);
    const result = await rpc(db, USERS.outsider, "create_shop", ["Valid shop", "USD", "UTC", key]);
    expect(result.id).toBeTruthy();
  });

  it("limits settings to owners and freezes currency after financial activity", async () => {
    await expect(
      rpc(db, USERS.staff, "update_shop", [shopId, "New shop", "USD", "UTC", requestId()]),
    ).rejects.toThrow(/membership/);
    await rpc(db, USERS.owner, "update_shop", [shopId, "New shop", "EUR", "UTC", requestId()]);
    const p = await product(db, shopId);
    await sale(db, shopId, p.id);
    const key = requestId();
    await expect(
      rpc(db, USERS.owner, "update_shop", [shopId, "New shop", "USD", "UTC", key]),
    ).rejects.toThrow(/Currency cannot change/);
    expect(await keyCount(key)).toBe(0);
    await rpc(db, USERS.owner, "update_shop", [shopId, "New shop", "EUR", "Asia/Karachi", key]);
  });

  it("creates normalized categories/products and permits authorized staff mutations", async () => {
    const cat = await rpc(db, USERS.staff, "create_category", [shopId, "  Grocery  ", requestId()]);
    const p = await product(
      db,
      shopId,
      { category_id: cat.id, sku: "SKU-A", barcode: "12345" },
      USERS.staff,
    );
    const stored = await row(
      db,
      "select p.name,c.name category,p.current_stock::text stock from public.products p join public.categories c on c.shop_id=p.shop_id and c.id=p.category_id where p.id=$1",
      [p.id],
    );
    expect(stored).toEqual({ name: "Test product", category: "Grocery", stock: "10.000" });
    expect(
      await row(
        db,
        "select quantity_delta::text delta,stock_after::text stock from public.inventory_movements where product_id=$1",
        [p.id],
      ),
    ).toEqual({ delta: "10.000", stock: "10.000" });
    await expect(product(db, shopId, { sku: "sku-a" })).rejects.toThrow(/unique/);
    await expect(product(db, shopId, { barcode: "12345" })).rejects.toThrow(/unique/);
    await expect(
      rpc(db, USERS.owner, "create_category", [shopId, "grocery", requestId()]),
    ).rejects.toThrow(/unique/);
  });

  it("exposes a stored derived stock_status for SQL filtering, including the exact threshold", async () => {
    const p = await product(db, shopId, { opening_stock: "3.000", low_stock_threshold: "2.000" });
    expect(
      (await row(db, "select stock_status from public.products where id=$1", [p.id])).stock_status,
    ).toBe("in");
    await sale(db, shopId, p.id, "1");
    expect(
      (await row(db, "select stock_status from public.products where id=$1", [p.id])).stock_status,
    ).toBe("low");
    await sale(db, shopId, p.id, "2");
    expect(
      (await row(db, "select stock_status from public.products where id=$1", [p.id])).stock_status,
    ).toBe("out");
    await expect(
      db.query("update public.products set stock_status='in' where id=$1", [p.id]),
    ).rejects.toThrow(/can only be updated to DEFAULT/);
  });

  it("validates nested product payload types, bounds, precision and strict keys inside SQL", async () => {
    const invalid = [
      { selling_price: "1.001" },
      { opening_stock: "0.0001" },
      { cost_price: "1.00001" },
      { low_stock_threshold: "-1" },
      { selling_price: "1000000000000" },
      { name: "x".repeat(161) },
      { is_active: "true" },
      { selling_price: "NaN" },
      { selling_price: {} },
      { cost_price: false },
      { extra: true },
    ];
    for (const bad of invalid) {
      const key = requestId();
      await expect(
        rpc(db, USERS.owner, "save_product", [shopId, null, { ...productInput(), ...bad }, key]),
      ).rejects.toThrow();
      expect(await keyCount(key)).toBe(0);
    }
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.products")).n).toBe(0);
    const { sku: _sku, ...missingNullable } = productInput();
    await expect(
      rpc(db, USERS.owner, "save_product", [shopId, null, missingNullable, requestId()]),
    ).rejects.toThrow(/Missing payload field/);
    const p = await product(db, shopId);
    await expect(
      rpc(db, USERS.owner, "save_product", [
        shopId,
        p.id,
        productInput({ opening_stock: "1" }),
        requestId(),
      ]),
    ).rejects.toThrow(/Opening stock/);
    expect(await stock(p.id)).toBe("10.000");
  });

  it("idempotency binds actor, operation, shop and full payload, and does not duplicate audit/history", async () => {
    const key = requestId();
    const args = [shopId, null, productInput(), key];
    const first = await rpc(db, USERS.owner, "save_product", args);
    expect(await rpc(db, USERS.owner, "save_product", args)).toEqual(first);
    await expect(
      rpc(db, USERS.owner, "save_product", [
        shopId,
        null,
        productInput({ name: "Different" }),
        key,
      ]),
    ).rejects.toThrow(/different payload/);
    await expect(
      rpc(db, USERS.owner, "create_category", [shopId, "Category", key]),
    ).rejects.toThrow(/different payload/);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.inventory_movements where product_id=$1",
          [first.id],
        )
      ).n,
    ).toBe(1);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.audit_records where entity_id=$1",
          [first.id],
        )
      ).n,
    ).toBe(1);
    // One actor cannot repurpose a key in a second shop, even with both memberships.
    await db.query(
      "insert into public.shop_memberships(shop_id,user_id,role) values($1,$2,'staff')",
      [otherShopId, USERS.owner],
    );
    await expect(
      rpc(db, USERS.owner, "create_category", [otherShopId, "Category", key]),
    ).rejects.toThrow(/different payload/);
    // The same UUID is independent for a different authenticated actor.
    await rpc(db, USERS.other, "create_category", [otherShopId, "Other category", key]);
    expect(await keyCount(key)).toBe(2);
  });

  it("imports atomically, creates/reuses categories, rejects duplicate SKUs and caps 500 rows", async () => {
    const imported = { ...productInput({ sku: "IMP-1" }), category_name: "Imported" };
    const { category_id: _unused, ...entry } = imported;
    const key = requestId();
    await expect(
      rpc(db, USERS.owner, "import_products", [shopId, [entry, { ...entry, name: "Second" }], key]),
    ).rejects.toThrow(/unique/);
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.products")).n).toBe(0);
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.categories")).n).toBe(
      0,
    );
    expect(await keyCount(key)).toBe(0);
    const result = await rpc(db, USERS.owner, "import_products", [
      shopId,
      [entry, { ...entry, name: "Second", sku: "IMP-2", category_name: "imported" }],
      key,
    ]);
    expect(result.count).toBe(2);
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.categories")).n).toBe(
      1,
    );
    await expect(
      rpc(db, USERS.owner, "import_products", [shopId, Array(501).fill(entry), requestId()]),
    ).rejects.toThrow(/count/);
    await expect(
      rpc(db, USERS.owner, "import_products", [shopId, [], requestId()]),
    ).rejects.toThrow(/count/);
  });

  it("receives stock at weighted average cost, with separate purchase/cash/inventory events", async () => {
    const p = await product(db, shopId);
    const key = requestId();
    const args = [shopId, p.id, "10.000", "4.0000", "Supplier", "digital", "Receipt note", key];
    const receipt = await rpc(db, USERS.owner, "receive_stock", args);
    expect(receipt).toMatchObject({
      total: "40.00",
      cost_price: "3.0000",
      current_stock: "20.000",
    });
    expect(await rpc(db, USERS.owner, "receive_stock", args)).toEqual(receipt);
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.purchases")).n).toBe(
      1,
    );
    expect(
      await row(
        db,
        "select amount::text amount,direction,method from public.cashbook_entries where purchase_id=$1",
        [receipt.id],
      ),
    ).toEqual({ amount: "40.00", direction: "out", method: "digital" });
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        p.id,
        "10.000",
        "4.0001",
        "Supplier",
        "digital",
        "Receipt note",
        key,
      ]),
    ).rejects.toThrow(/Idempotency/);
  });

  it("explicitly retains unknown receipt costs until previously unknown stock is depleted", async () => {
    const p = await product(db, shopId, { cost_price: null });
    const first = await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "1",
      "7.1234",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    expect(first.cost_price).toBeNull();
    expect(
      (await row<{ n: number }>(db, "select count(*)::int n from public.cashbook_entries")).n,
    ).toBe(0);
    await sale(db, shopId, p.id, "11.000");
    const second = await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "1",
      "7.1234",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    expect(second.cost_price).toBe("7.1234");
    expect(
      await row(
        db,
        "select unit_cost::text cost,cost_total::text total from public.sale_items where product_id=$1",
        [p.id],
      ),
    ).toEqual({ cost: null, total: null });
  });

  it("enforces signed stock corrections, upper/lower boundaries, notes and precise numeric arguments", async () => {
    const p = await product(db, shopId, { opening_stock: "0.001" });
    await rpc(db, USERS.owner, "adjust_stock", [
      shopId,
      p.id,
      "-0.001",
      "damage",
      "Damaged item",
      requestId(),
    ]);
    expect(await stock(p.id)).toBe("0.000");
    for (const [delta, kind, note] of [
      ["-0.001", "missing", "Missing item"],
      ["1", "damage", "Wrong direction"],
      ["0", "correction", "Zero change"],
      ["0.0001", "correction", "Too precise"],
      ["1", "sale", "Invalid kind"],
      ["1", "correction", "x"],
    ]) {
      const key = requestId();
      await expect(
        rpc(db, USERS.owner, "adjust_stock", [shopId, p.id, delta, kind, note, key]),
      ).rejects.toThrow();
      expect(await keyCount(key)).toBe(0);
    }
    const max = await product(db, shopId, { opening_stock: "999999999.999" });
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        max.id,
        "0.001",
        "0",
        null,
        "unpaid",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/resulting stock/);
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        p.id,
        "1.0000",
        "0",
        null,
        "unpaid",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/precision/);
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        p.id,
        "NaN",
        "0",
        null,
        "unpaid",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/quantity/);
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        p.id,
        "1",
        "1.00001",
        null,
        "unpaid",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/unit_cost/);
  });

  it("posts multi-line sales atomically, with DB-computed totals, signed payments and stock histories", async () => {
    const a = await product(db, shopId);
    const b = await product(db, shopId, { name: "Second product" });
    const key = requestId();
    const args = [
      shopId,
      [
        { product_id: b.id, quantity: "0.125", unit_price: "3.99", discount: "0.10" },
        { product_id: a.id, quantity: "2.000", unit_price: "5.00", discount: "1.25" },
      ],
      "digital",
      null,
      null,
      "Posted note",
      key,
    ];
    const s = await rpc(db, USERS.owner, "post_sale", args);
    expect(s.total).toBe("9.15");
    expect(await rpc(db, USERS.owner, "post_sale", args)).toEqual(s);
    expect(
      await row(
        db,
        "select subtotal::text subtotal,discount_total::text discount,total::text total from public.sales where id=$1",
        [s.id],
      ),
    ).toEqual({ subtotal: "10.50", discount: "1.35", total: "9.15" });
    expect(await stock(a.id)).toBe("8.000");
    expect(await stock(b.id)).toBe("9.875");
    expect(
      await row(db, "select amount::text amount,kind from public.payments where sale_id=$1", [
        s.id,
      ]),
    ).toEqual({ amount: "9.15", kind: "sale" });
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.inventory_movements where sale_id=$1",
          [s.id],
        )
      ).n,
    ).toBe(2);
    const view = (
      await asUser(
        db,
        USERS.owner,
        "select total::text total,balance_due::text due,payment_status from public.sales_ledger where id=$1",
        [s.id],
      )
    ).rows[0];
    expect(view).toEqual({ total: "9.15", due: "0.00", payment_status: "paid" });
  });

  it("rolls back a failed multi-product sale entirely and permits retrying its unconsumed key", async () => {
    const a = await product(db, shopId, { opening_stock: "5" });
    const b = await product(db, shopId, { opening_stock: "1" });
    const key = requestId();
    const args = [
      shopId,
      [
        { product_id: a.id, quantity: "2", unit_price: "5.00", discount: "0" },
        { product_id: b.id, quantity: "2", unit_price: "5.00", discount: "0" },
      ],
      "cash",
      null,
      null,
      null,
      key,
    ];
    await expect(rpc(db, USERS.owner, "post_sale", args)).rejects.toThrow(/Insufficient stock/);
    expect(await stock(a.id)).toBe("5");
    expect(await stock(b.id)).toBe("1");
    for (const table of ["sales", "sale_items", "payments", "cashbook_entries"]) {
      expect((await row<{ n: number }>(db, `select count(*)::int n from public.${table}`)).n).toBe(
        0,
      );
    }
    expect(await keyCount(key)).toBe(0);
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      b.id,
      "1",
      "2",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    expect((await rpc(db, USERS.owner, "post_sale", args)).total).toBe("20.00");
  });

  it("serial stock-boundary requests cannot oversell (not a multi-session concurrency proof)", async () => {
    const p = await product(db, shopId, { opening_stock: "1.000" });
    const key = requestId();
    const s = await sale(db, shopId, p.id, "1.000", "5.00", "cash", key);
    expect(await stock(p.id)).toBe("0.000");
    expect(await sale(db, shopId, p.id, "1.000", "5.00", "cash", key)).toEqual(s);
    await expect(sale(db, shopId, p.id)).rejects.toThrow(/Insufficient/);
    expect(await stock(p.id)).toBe("0.000");
  });

  it("rejects duplicate/foreign/inactive products, invalid discounts, precision, arrays, fields and credit names", async () => {
    const p = await product(db, shopId);
    const inactive = await product(db, shopId, { is_active: false });
    const foreign = await product(db, otherShopId, {}, USERS.other);
    const line = { product_id: p.id, quantity: "1", unit_price: "5.00", discount: "0" };
    const badItems: unknown[] = [
      [],
      {},
      [line, line],
      [{ ...line, product_id: foreign.id }],
      [{ ...line, product_id: inactive.id }],
      [{ ...line, quantity: "-1" }],
      [{ ...line, quantity: "1.0001" }],
      [{ ...line, unit_price: "1.001" }],
      [{ ...line, discount: "5.01" }],
      [{ ...line, discount: "-0.01" }],
      [{ ...line, injected: true }],
      Array(101).fill(line),
    ];
    for (const items of badItems)
      await expect(
        rpc(db, USERS.owner, "post_sale", [shopId, items, "cash", null, null, null, requestId()]),
      ).rejects.toThrow();
    await expect(
      rpc(db, USERS.owner, "post_sale", [shopId, [line], "credit", " ", null, null, requestId()]),
    ).rejects.toThrow(/customer name/);
    await expect(
      rpc(db, USERS.owner, "post_sale", [shopId, [line], "cheque", null, null, null, requestId()]),
    ).rejects.toThrow(/method/);
    expect(await stock(p.id)).toBe("10.000");
  });

  it("preserves sale name/category/SKU/unit/price/discount/cost snapshots after catalog edits", async () => {
    const cat = await rpc(db, USERS.owner, "create_category", [
      shopId,
      "Original category",
      requestId(),
    ]);
    const p = await product(db, shopId, {
      name: "Original name",
      category_id: cat.id,
      sku: "ORIGINAL",
    });
    const s = await sale(db, shopId, p.id, "2", "7.50", "cash", requestId(), "0.50");
    await rpc(db, USERS.owner, "save_product", [
      shopId,
      p.id,
      productInput({
        name: "New name",
        category_id: null,
        sku: "NEW",
        unit: "box",
        selling_price: "99.00",
        cost_price: "9.0000",
        opening_stock: "0",
      }),
      requestId(),
    ]);
    expect(
      await row(
        db,
        "select product_name,category_name,sku,unit,unit_price::text price,discount::text discount,line_total::text total,unit_cost::text cost,cost_total::text cost_total from public.sale_items where sale_id=$1",
        [s.id],
      ),
    ).toEqual({
      product_name: "Original name",
      category_name: "Original category",
      sku: "ORIGINAL",
      unit: "piece",
      price: "7.50",
      discount: "0.50",
      total: "14.50",
      cost: "2.0000",
      cost_total: "4.00",
    });
    const r = await report();
    expect(r.products[0]).toMatchObject({
      name: "Original name",
      category: "Original category",
      sku: "ORIGINAL",
    });
  });

  it("supports zero-price sales without inventing zero or negative payment/cash records", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "1", "0.00");
    expect(s.total).toBe("0.00");
    expect((await row<{ n: number }>(db, "select count(*)::int n from public.payments")).n).toBe(0);
    expect(
      (await row(db, "select payment_status from public.sales_ledger where id=$1", [s.id]))
        .payment_status,
    ).toBe("paid");
    const ret = await returned(s.id, await itemId(s.id));
    expect(ret.refund).toBe("0.00");
    expect(ret.status).toBe("returned");
  });

  it("can reverse full-range costs across multiple zero-price lines without aggregate overflow", async () => {
    const a = await product(db, shopId, { cost_price: "999999999999.9900" });
    const b = await product(db, shopId, { cost_price: "999999999999.9900" });
    const s = await rpc(db, USERS.owner, "post_sale", [
      shopId,
      [a.id, b.id].map((product_id) => ({
        product_id,
        quantity: "1",
        unit_price: "0",
        discount: "0",
      })),
      "cash",
      null,
      null,
      null,
      requestId(),
    ]);
    const result = await rpc(db, USERS.owner, "reverse_sale", [
      shopId,
      s.id,
      "Reverse zero-price transaction",
      "cash",
      requestId(),
    ]);
    expect(result.status).toBe("reversed");
    expect(
      (
        await row(db, "select cost_total::text cost from public.sale_adjustments where id=$1", [
          result.id,
        ])
      ).cost,
    ).toBe("1999999999999.98");
  });

  it("returns cumulative rounded totals, discounts and costs exactly; last fractional return exhausts originals", async () => {
    const p = await product(db, shopId, { cost_price: "0.3333" });
    const s = await sale(db, shopId, p.id, "3.000", "1.00", "cash", requestId(), "0.01");
    const si = await itemId(s.id);
    const a = await returned(s.id, si);
    const b = await returned(s.id, si);
    const c = await returned(s.id, si);
    expect([a.total, b.total, c.total]).toEqual(["1.00", "0.99", "1.00"]);
    expect(c.status).toBe("returned");
    expect(
      await row(
        db,
        "select sum(quantity)::text quantity,sum(line_total)::text total,sum(discount)::text discount,sum(cost_total)::text cost from public.sale_adjustment_items where sale_item_id=$1",
        [si],
      ),
    ).toEqual({ quantity: "3.000", total: "2.99", discount: "0.01", cost: "1.00" });
    const amounts = await db.query<{ cost: string; discount: string }>(
      "select ai.cost_total::text cost,ai.discount::text discount from public.sale_adjustment_items ai join public.sale_adjustments a on a.id=ai.adjustment_id where ai.sale_item_id=$1 order by a.occurred_at,a.id",
      [si],
    );
    expect(amounts.rows.map((v) => v.cost)).toEqual(["0.33", "0.34", "0.33"]);
    expect(amounts.rows.map((v) => v.discount)).toEqual(["0.00", "0.01", "0.00"]);
    expect(await stock(p.id)).toBe("10.000");
    expect(
      await row(
        db,
        "select returned_total::text returned,net_total::text net,collected_total::text collected,balance_due::text due,payment_status from public.sales_ledger where id=$1",
        [s.id],
      ),
    ).toEqual({
      returned: "2.99",
      net: "0.00",
      collected: "0.00",
      due: "0.00",
      payment_status: "refunded",
    });
    expect(
      (
        await row(
          db,
          "select returned_quantity::text quantity from public.sale_items_ledger where id=$1",
          [si],
        )
      ).quantity,
    ).toBe("3.000");
  });

  it("returns fractional quantities, supports no-restock disposition and keeps sale snapshots untouched", async () => {
    const p = await product(db, shopId, { unit: "kg", cost_price: "0.1234" });
    const s = await sale(db, shopId, p.id, "0.333", "1.01", "cash", requestId(), "0.01");
    const si = await itemId(s.id);
    const key = requestId();
    const first = await returned(s.id, si, "0.111", false, key);
    expect(await returned(s.id, si, "0.111", false, key)).toEqual(first);
    await expect(returned(s.id, si, "0.112", false, key)).rejects.toThrow(/Idempotency/);
    await returned(s.id, si, "0.111", true);
    await returned(s.id, si, "0.111", true);
    expect(await stock(p.id)).toBe("9.889");
    expect(
      await row(
        db,
        "select sum(line_total)::text total,sum(cost_total)::text cost from public.sale_adjustment_items where sale_item_id=$1",
        [si],
      ),
    ).toEqual({ total: "0.33", cost: "0.04" });
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.inventory_movements where kind='return'",
        )
      ).n,
    ).toBe(2);
    expect(
      (await row(db, "select line_total::text total from public.sale_items where id=$1", [si]))
        .total,
    ).toBe("0.33");
  });

  it("rolls back multi-item returns if any quantity or link is invalid, without refund or key consumption", async () => {
    const a = await product(db, shopId);
    const b = await product(db, shopId);
    const s = await rpc(db, USERS.owner, "post_sale", [
      shopId,
      [a.id, b.id].map((product_id) => ({
        product_id,
        quantity: "1",
        unit_price: "5.00",
        discount: "0",
      })),
      "cash",
      null,
      null,
      null,
      requestId(),
    ]);
    const lines = await db.query<{ id: string }>(
      "select id from public.sale_items where sale_id=$1 order by id",
      [s.id],
    );
    const key = requestId();
    const items = [
      { sale_item_id: lines.rows[0].id, quantity: "1", restock: true },
      { sale_item_id: lines.rows[1].id, quantity: "2", restock: true },
    ];
    await expect(
      rpc(db, USERS.owner, "return_sale", [shopId, s.id, items, "Return reason", "cash", key]),
    ).rejects.toThrow(/exceeds remaining/);
    expect(await keyCount(key)).toBe(0);
    expect(await stock(a.id)).toBe("9.000");
    expect(
      (await row<{ n: number }>(db, "select count(*)::int n from public.sale_adjustments")).n,
    ).toBe(0);
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.payments where kind='refund'",
        )
      ).n,
    ).toBe(0);
    items[1].quantity = "1";
    expect(
      (
        await rpc(db, USERS.owner, "return_sale", [
          shopId,
          s.id,
          items,
          "Return reason",
          "cash",
          key,
        ])
      ).status,
    ).toBe("returned");
  });

  it("rolls back late return failures, including inserted adjustments and restocked products", async () => {
    const p = await product(db, shopId, { opening_stock: "1.000" });
    const s = await sale(db, shopId, p.id);
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "999999999.999",
      "0",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    const key = requestId();
    await expect(returned(s.id, await itemId(s.id), "1.000", true, key)).rejects.toThrow(
      /resulting stock/,
    );
    expect(await keyCount(key)).toBe(0);
    expect(
      (await row<{ n: number }>(db, "select count(*)::int n from public.sale_adjustments")).n,
    ).toBe(0);
    expect((await row(db, "select status from public.sales where id=$1", [s.id])).status).toBe(
      "posted",
    );
    expect(await stock(p.id)).toBe("999999999.999");
    await rpc(db, USERS.owner, "adjust_stock", [
      shopId,
      p.id,
      "-1.000",
      "correction",
      "Make space for return",
      requestId(),
    ]);
    expect((await returned(s.id, await itemId(s.id), "1.000", true, key)).status).toBe("returned");
  });

  it("rejects duplicate return items, invalid restock types, overprecision and a line from a different sale", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id);
    const other = await sale(db, shopId, p.id);
    const si = await itemId(s.id);
    const line = { sale_item_id: si, quantity: "1", restock: true };
    for (const items of [
      [line, line],
      [{ ...line, restock: "true" }],
      [{ ...line, quantity: "0.0001" }],
      [{ ...line, sale_item_id: await itemId(other.id) }],
    ]) {
      await expect(
        rpc(db, USERS.owner, "return_sale", [
          shopId,
          s.id,
          items,
          "Return reason",
          "cash",
          requestId(),
        ]),
      ).rejects.toThrow();
    }
    await expect(
      rpc(db, USERS.owner, "return_sale", [shopId, s.id, [line], "x", "cash", requestId()]),
    ).rejects.toThrow(/reason/);
    await returned(s.id, si);
    await expect(returned(s.id, si)).rejects.toThrow(/Returnable/);
  });

  it("reverses a posted sale as a new event, refunds/restocks once, and disallows reversal after any return", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "2", "5.00");
    const key = requestId();
    const args = [shopId, s.id, "Duplicate transaction", "digital", key];
    const reversed = await rpc(db, USERS.owner, "reverse_sale", args);
    expect(reversed).toMatchObject({ status: "reversed", total: "10.00", refund: "10.00" });
    expect(await rpc(db, USERS.owner, "reverse_sale", args)).toEqual(reversed);
    expect(await stock(p.id)).toBe("10.000");
    expect(
      await row(db, "select total::text total,status from public.sales where id=$1", [s.id]),
    ).toEqual({ total: "10.00", status: "reversed" });
    expect(
      (await row(db, "select payment_status from public.sales_ledger where id=$1", [s.id]))
        .payment_status,
    ).toBe("reversed");
    await expect(
      rpc(db, USERS.owner, "reverse_sale", [shopId, s.id, "Again reverse", "cash", requestId()]),
    ).rejects.toThrow(/Returnable/);
    const next = await sale(db, shopId, p.id, "2");
    await returned(next.id, await itemId(next.id));
    await expect(
      rpc(db, USERS.owner, "reverse_sale", [
        shopId,
        next.id,
        "Reverse remainder",
        "cash",
        requestId(),
      ]),
    ).rejects.toThrow(/prior returns/);
  });

  it("credit sales create revenue/receivable but no cash; collections never add revenue and cannot overcollect", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "2", "5.00", "credit");
    expect(
      await row(
        db,
        "select balance_due::text due,payment_status from public.sales_ledger where id=$1",
        [s.id],
      ),
    ).toEqual({ due: "10.00", payment_status: "unpaid" });
    const before = await report();
    expect(before.summary).toMatchObject({
      revenue: "10.00",
      credit_sales: "10.00",
      cash_received: "0",
      digital_received: "0",
      net_cash_movement: "0",
    });
    const key = requestId();
    const args = [shopId, s.id, "4.00", "cash", "Collection note", key];
    const collected = await rpc(db, USERS.owner, "collect_payment", args);
    expect(collected.balance_due).toBe("6.00");
    expect(await rpc(db, USERS.owner, "collect_payment", args)).toEqual(collected);
    const failedKey = requestId();
    await expect(
      rpc(db, USERS.owner, "collect_payment", [shopId, s.id, "6.01", "digital", null, failedKey]),
    ).rejects.toThrow(/exceeds balance/);
    expect(await keyCount(failedKey)).toBe(0);
    await rpc(db, USERS.owner, "collect_payment", [
      shopId,
      s.id,
      "6.00",
      "digital",
      null,
      failedKey,
    ]);
    expect(
      (await row(db, "select payment_status from public.sales_ledger where id=$1", [s.id]))
        .payment_status,
    ).toBe("paid");
    expect((await report()).summary).toMatchObject({
      revenue: "10.00",
      cash_received: "4.00",
      digital_received: "6.00",
      net_cash_movement: "10.00",
    });
    for (const amount of ["0", "-1", "0.001", "Infinity"])
      await expect(
        rpc(db, USERS.owner, "collect_payment", [shopId, s.id, amount, "cash", null, requestId()]),
      ).rejects.toThrow();
  });

  it("unpaid/part-paid credit returns reduce debt first and refund only genuinely overpaid cash", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "4", "5.00", "credit");
    const si = await itemId(s.id);
    await rpc(db, USERS.owner, "collect_payment", [
      shopId,
      s.id,
      "8.00",
      "digital",
      null,
      requestId(),
    ]);
    expect((await returned(s.id, si, "2")).refund).toBe("0");
    expect(
      (await row(db, "select balance_due::text due from public.sales_ledger where id=$1", [s.id]))
        .due,
    ).toBe("2.00");
    expect((await returned(s.id, si, "1")).refund).toBe("3.00");
    expect((await returned(s.id, si, "1")).refund).toBe("5.00");
    expect(
      (await row(db, "select sum(amount)::text paid from public.payments where sale_id=$1", [s.id]))
        .paid,
    ).toBe("0.00");
    const unpaid = await sale(db, shopId, p.id, "1", "5.00", "credit");
    expect((await returned(unpaid.id, await itemId(unpaid.id))).refund).toBe("0.00");
    expect(
      (
        await row<{ n: number }>(
          db,
          "select count(*)::int n from public.payments where sale_id=$1",
          [unpaid.id],
        )
      ).n,
    ).toBe(0);
  });

  it("reversing partially collected credit refunds exactly collections, not the original credit total", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "2", "5.00", "credit");
    await rpc(db, USERS.owner, "collect_payment", [
      shopId,
      s.id,
      "3.25",
      "cash",
      null,
      requestId(),
    ]);
    const result = await rpc(db, USERS.owner, "reverse_sale", [
      shopId,
      s.id,
      "Entered in error",
      "cash",
      requestId(),
    ]);
    expect(result.refund).toBe("3.25");
    expect(
      (await row(db, "select balance_due::text due from public.sales_ledger where id=$1", [s.id]))
        .due,
    ).toBe("0.00");
    await expect(
      rpc(db, USERS.owner, "collect_payment", [shopId, s.id, "1", "cash", null, requestId()]),
    ).rejects.toThrow(/Collectable/);
  });

  it("records dated expenses and non-profit cash movements with validation and idempotency", async () => {
    const key = requestId();
    const args = [shopId, "Electricity bill", "Utilities", "12.50", "cash", "2026-03-08", key];
    const expense = await rpc(db, USERS.owner, "record_expense", args);
    expect(await rpc(db, USERS.owner, "record_expense", args)).toEqual(expense);
    const saved = await row<{ time: string }>(
      db,
      "select to_char(occurred_at at time zone 'UTC','YYYY-MM-DD HH24:MI') time from public.expenses where id=$1",
      [expense.id],
    );
    expect(saved.time).toBe("2026-03-08 05:00");
    await rpc(db, USERS.owner, "record_cash_movement", [
      shopId,
      "owner_deposit",
      "Owner working capital",
      "100.00",
      "digital",
      "2026-03-08",
      requestId(),
    ]);
    await rpc(db, USERS.owner, "record_cash_movement", [
      shopId,
      "owner_withdrawal",
      "Owner draw",
      "20.00",
      "cash",
      "2026-03-08",
      requestId(),
    ]);
    await rpc(db, USERS.owner, "record_cash_movement", [
      shopId,
      "supplier_payment",
      "Supplier bill",
      "10.00",
      "cash",
      "2026-03-08",
      requestId(),
    ]);
    const r = await report("2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z");
    expect(r.summary).toMatchObject({
      revenue: "0",
      expenses: "12.50",
      gross_profit: "0",
      estimated_net_profit: "-12.50",
      net_cash_movement: "57.50",
      cash_received: "0",
      digital_received: "0",
    });
    expect(r.payment_methods).toEqual([
      { method: "cash", inflow: "0", outflow: "42.50", net: "-42.50" },
      { method: "digital", inflow: "100.00", outflow: "0", net: "100.00" },
    ]);
    expect(
      await rpc(db, USERS.owner, "cashbook_totals", [
        shopId,
        "2026-03-08T05:00:00Z",
        "2026-03-09T04:00:00Z",
      ]),
    ).toEqual({ inflow: "100.00", outflow: "42.50", net: "57.50" });
    await expect(
      rpc(db, USERS.other, "cashbook_totals", [
        shopId,
        "2026-03-08T05:00:00Z",
        "2026-03-09T04:00:00Z",
      ]),
    ).rejects.toThrow(/membership/);
    for (const amount of ["0", "-1", "1.001", "1000000000000"])
      await expect(
        rpc(db, USERS.owner, "record_expense", [
          shopId,
          "Valid description",
          "Other",
          amount,
          "cash",
          "2026-03-08",
          requestId(),
        ]),
      ).rejects.toThrow();
    await expect(
      rpc(db, USERS.owner, "record_expense", [
        shopId,
        "x",
        "Other",
        "1",
        "cash",
        "2026-03-08",
        requestId(),
      ]),
    ).rejects.toThrow(/description/);
    await expect(
      rpc(db, USERS.owner, "record_cash_movement", [
        shopId,
        "sale",
        "Not permitted",
        "1",
        "cash",
        "2026-03-08",
        requestId(),
      ]),
    ).rejects.toThrow(/kind/);
  });

  it("reports original and return events in their own periods even after sale status becomes reversed", async () => {
    const p = await product(db, shopId, { cost_price: "2.0000" });
    const s = await sale(db, shopId, p.id, "2", "5.00");
    await stampSale(db, s.id, "2026-01-10T12:00:00Z");
    const rev = await rpc(db, USERS.owner, "reverse_sale", [
      shopId,
      s.id,
      "Duplicate transaction",
      "cash",
      requestId(),
    ]);
    await stampAdjustment(db, rev.id, "2026-02-10T12:00:00Z");
    const jan = await report("2026-01-01T05:00:00Z", "2026-02-01T05:00:00Z");
    const feb = await report("2026-02-01T05:00:00Z", "2026-03-01T05:00:00Z");
    expect(jan.summary).toMatchObject({
      revenue: "10.00",
      units: "2",
      cost_of_goods: "4.00",
      gross_profit: "6.00",
      sales_count: 1,
      cash_received: "10.00",
      refunds: "0",
      net_cash_movement: "10.00",
    });
    expect(feb.summary).toMatchObject({
      revenue: "-10.00",
      units: "-2",
      cost_of_goods: "-4.00",
      gross_profit: "-6.00",
      sales_count: 0,
      cash_received: "0",
      refunds: "10.00",
      net_cash_movement: "-10.00",
    });
    const all = await report();
    expect(all.summary).toMatchObject({ revenue: "0.00", gross_profit: "0.00", sales_count: 1 });
    expect(jan.trend.find((t) => t.date === "2026-01-10")?.revenue).toBe("10.00");
    expect(feb.trend.find((t) => t.date === "2026-02-10")?.revenue).toBe("-10.00");
  });

  it("reports partial returns additively and collections as cash-only on their actual dates", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "2", "5.00", "credit");
    await stampSale(db, s.id, "2026-01-15T12:00:00Z");
    const col = await rpc(db, USERS.owner, "collect_payment", [
      shopId,
      s.id,
      "8.00",
      "digital",
      null,
      requestId(),
    ]);
    await stampPayment(db, col.id, "2026-02-15T12:00:00Z");
    const ret = await returned(s.id, await itemId(s.id), "1");
    await stampAdjustment(db, ret.id, "2026-03-15T12:00:00Z");
    const feb = await report("2026-02-01T05:00:00Z", "2026-03-01T05:00:00Z");
    const mar = await report("2026-03-01T05:00:00Z", "2026-04-01T04:00:00Z");
    expect(feb.summary).toMatchObject({
      revenue: "0",
      digital_received: "8.00",
      credit_sales: "0",
      net_cash_movement: "8.00",
    });
    expect(mar.summary).toMatchObject({
      revenue: "-5.00",
      cost_of_goods: "-2.00",
      gross_profit: "-3.00",
      credit_sales: "-5.00",
      refunds: "3.00",
      net_cash_movement: "-3.00",
    });
    expect((await report()).summary).toMatchObject({
      revenue: "5.00",
      credit_sales: "5.00",
      digital_received: "8.00",
      refunds: "3.00",
    });
  });

  it("zero-fills local dates across DST and respects half-open UTC date boundaries", async () => {
    const p = await product(db, shopId);
    const before = await sale(db, shopId, p.id);
    const start = await sale(db, shopId, p.id);
    const nearEnd = await sale(db, shopId, p.id);
    const end = await sale(db, shopId, p.id);
    await stampSale(db, before.id, "2026-03-08T04:59:59.999Z");
    await stampSale(db, start.id, "2026-03-08T05:00:00Z");
    await stampSale(db, nearEnd.id, "2026-03-09T03:59:59.999Z");
    await stampSale(db, end.id, "2026-03-09T04:00:00Z");
    const r = await report("2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z");
    expect(r.summary.revenue).toBe("10.00");
    expect(r.summary.sales_count).toBe(2);
    expect(r.trend).toEqual([{ date: "2026-03-08", revenue: "10.00", units: "2.000" }]);
    const days = await report("2026-03-08T05:00:00Z", "2026-03-12T04:00:00Z");
    expect(days.trend.map((t) => t.date)).toEqual([
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ]);
    expect(days.trend[2]).toEqual({ date: "2026-03-10", revenue: "0", units: "0" });
    const fall = await report("2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z");
    expect(fall.trend).toEqual([{ date: "2026-11-01", revenue: "0", units: "0" }]);
  });

  it("keeps profit unavailable for unknown cost while separating known profit, expenses and cash", async () => {
    const known = await product(db, shopId, { name: "Known", cost_price: "2.0000" });
    const unknown = await product(db, shopId, { name: "Unknown", cost_price: null });
    await sale(db, shopId, known.id, "2", "10.00");
    const us = await sale(db, shopId, unknown.id, "1", "5.00");
    await rpc(db, USERS.owner, "record_expense", [
      shopId,
      "Operating expense",
      "Other",
      "3.00",
      "cash",
      "2026-06-01",
      requestId(),
    ]);
    const r = await report();
    expect(r.summary).toMatchObject({
      revenue: "25.00",
      cost_of_goods: "4.00",
      gross_profit: null,
      known_gross_profit: "16.00",
      unknown_cost_lines: 1,
      expenses: "3.00",
      estimated_net_profit: null,
      cash_received: "25.00",
      net_cash_movement: "22.00",
    });
    expect(r.products.map((v) => v.name)).toEqual(["Known", "Unknown"]);
    expect(r.products[1].gross_profit).toBeNull();
    expect(r.categories[0].gross_profit).toBeNull();
    await returned(us.id, await itemId(us.id));
    const after = await report();
    expect(after.summary.gross_profit).toBeNull();
    expect(after.summary.unknown_cost_lines).toBe(2);
  });

  it("purchase cash outflow does not double count COGS as an expense", async () => {
    const p = await product(db, shopId, { opening_stock: "0", cost_price: null });
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "10",
      "2.00",
      null,
      "cash",
      null,
      requestId(),
    ]);
    await sale(db, shopId, p.id, "1", "5.00");
    const r = await report();
    expect(r.summary).toMatchObject({
      revenue: "5.00",
      cost_of_goods: "2.00",
      expenses: "0",
      gross_profit: "3.00",
      estimated_net_profit: "3.00",
      cash_received: "5.00",
      net_cash_movement: "-15.00",
    });
  });

  it("returns an honest empty report and rejects unauthorized, invalid and unbounded intervals", async () => {
    const r = await report("2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z");
    expect(r.products).toEqual([]);
    expect(r.categories).toEqual([]);
    expect(r.summary).toMatchObject({
      revenue: "0",
      gross_profit: "0",
      estimated_net_profit: "0",
      sales_count: 0,
    });
    for (const args of [
      [shopId, "2026-01-01", "2026-01-01"],
      [shopId, "2027-01-01", "2026-01-01"],
      [shopId, "infinity", "infinity"],
      [shopId, "2000-01-01", "2100-01-01"],
    ])
      await expect(rpc(db, USERS.owner, "report_shop", args)).rejects.toThrow(/interval/);
    await expect(
      rpc(db, USERS.other, "report_shop", [shopId, "2026-01-01", "2026-02-01"]),
    ).rejects.toThrow(/membership/);
  });

  it("RLS isolates every table/view and neither anonymous nor non-members read tenant records", async () => {
    const category = await rpc(db, USERS.owner, "create_category", [
      shopId,
      "Local category",
      requestId(),
    ]);
    const p = await product(db, shopId, { category_id: category.id });
    const s = await sale(db, shopId, p.id, "2");
    await returned(s.id, await itemId(s.id));
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "1",
      "2",
      null,
      "cash",
      null,
      requestId(),
    ]);
    await rpc(db, USERS.owner, "record_expense", [
      shopId,
      "Local expense",
      "Other",
      "1",
      "cash",
      "2026-01-01",
      requestId(),
    ]);
    for (const table of [
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
    ]) {
      const ownFilter = table === "shops" ? "id" : "shop_id";
      const own = await asUser<{ n: number }>(
        db,
        USERS.owner,
        `select count(*)::int n from public.${table} where ${ownFilter}=$1`,
        [shopId],
      );
      expect(own.rows[0].n, `${table} has real fixture rows`).toBeGreaterThan(0);
      const outsider = await asUser<{ n: number }>(
        db,
        USERS.other,
        `select count(*)::int n from public.${table} where ${ownFilter}=$1`,
        [shopId],
      );
      expect(outsider.rows[0].n, table).toBe(0);
      const noAuth = await asUser<{ n: number }>(
        db,
        null,
        `select count(*)::int n from public.${table}`,
      );
      expect(noAuth.rows[0].n, table).toBe(0);
      await expect(asUser(db, null, `select * from public.${table}`, [], "anon")).rejects.toThrow(
        /permission denied/,
      );
    }
    expect(
      (await asUser(db, USERS.owner, "select id from public.sales_ledger where id=$1", [s.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await asUser(db, USERS.staff, "select id from public.sales_ledger where id=$1", [s.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await asUser<{ member: boolean }>(
          db,
          USERS.outsider,
          "select public.is_shop_member($1) member",
          [shopId],
        )
      ).rows[0].member,
    ).toBe(false);
  });

  it("ALL mutation entry points recheck auth and membership, even if HTTP is bypassed", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id, "1", "5.00", "credit");
    const calls: [string, unknown[]][] = [
      ["update_shop", [shopId, "New name", "USD", "UTC", requestId()]],
      ["create_category", [shopId, "Category", requestId()]],
      ["save_product", [shopId, null, productInput(), requestId()]],
      ["import_products", [shopId, [], requestId()]],
      ["receive_stock", [shopId, p.id, "1", "1", null, "unpaid", null, requestId()]],
      ["adjust_stock", [shopId, p.id, "1", "correction", "Reason", requestId()]],
      ["post_sale", [shopId, [], "cash", null, null, null, requestId()]],
      ["collect_payment", [shopId, s.id, "1", "cash", null, requestId()]],
      ["return_sale", [shopId, s.id, [], "Reason", "cash", requestId()]],
      ["reverse_sale", [shopId, s.id, "Reason", "cash", requestId()]],
      ["record_expense", [shopId, "Expense", "Other", "1", "cash", "2026-01-01", requestId()]],
      [
        "record_cash_movement",
        [shopId, "owner_deposit", "Deposit", "1", "cash", "2026-01-01", requestId()],
      ],
    ];
    for (const [name, args] of calls) {
      await expect(rpc(db, null, name, args), name).rejects.toThrow(/Authentication/);
      await expect(rpc(db, USERS.other, name, args), name).rejects.toThrow(/membership/);
    }
    await expect(
      rpc(db, USERS.owner, "save_product", [shopId, null, productInput(), null]),
    ).rejects.toThrow(/request_id/);
  });

  it("rejects cross-tenant links both in RPCs and in composite foreign keys as database owner", async () => {
    const foreignCat = await rpc(db, USERS.other, "create_category", [
      otherShopId,
      "Foreign category",
      requestId(),
    ]);
    const foreignProduct = await product(db, otherShopId, {}, USERS.other);
    const foreignSale = await rpc(db, USERS.other, "post_sale", [
      otherShopId,
      [{ product_id: foreignProduct.id, quantity: "1", unit_price: "5.00", discount: "0" }],
      "credit",
      "Customer",
      null,
      null,
      requestId(),
    ]);
    await expect(product(db, shopId, { category_id: foreignCat.id })).rejects.toThrow(/Category/);
    await expect(
      rpc(db, USERS.owner, "receive_stock", [
        shopId,
        foreignProduct.id,
        "1",
        "2",
        null,
        "unpaid",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/Product/);
    await expect(
      rpc(db, USERS.owner, "collect_payment", [
        shopId,
        foreignSale.id,
        "1",
        "cash",
        null,
        requestId(),
      ]),
    ).rejects.toThrow(/not found/);
    await expect(
      rpc(db, USERS.owner, "reverse_sale", [shopId, foreignSale.id, "Reason", "cash", requestId()]),
    ).rejects.toThrow(/not found/);
    const local = await product(db, shopId);
    await expect(
      db.query("update public.products set category_id=$1 where id=$2", [foreignCat.id, local.id]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.query(
        "insert into public.sale_items(shop_id,sale_id,product_id,product_name,unit,quantity,unit_price,discount,line_total) values($1,$2,$3,'Bad','piece',1,1,0,1)",
        [shopId, foreignSale.id, local.id],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.query(
        "insert into public.sale_items(shop_id,sale_id,product_id,product_name,unit,quantity,unit_price,discount,line_total) values($1,$2,$3,'Bad','piece',1,1,0,1)",
        [otherShopId, foreignSale.id, local.id],
      ),
    ).rejects.toThrow(/foreign key/);
    const purchase = await rpc(db, USERS.other, "receive_stock", [
      otherShopId,
      foreignProduct.id,
      "1",
      "2",
      null,
      "unpaid",
      null,
      requestId(),
    ]);
    await expect(
      db.query(
        "insert into public.purchase_items(shop_id,purchase_id,product_id,product_name,quantity,unit_cost,total) values($1,$2,$3,'Bad',1,1,1)",
        [shopId, purchase.id, local.id],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("ordinary roles have SELECT only; views do not bypass RLS; private helpers are inaccessible", async () => {
    const p = await product(db, shopId);
    await expect(
      asUser(db, USERS.owner, "update public.products set current_stock=100 where id=$1", [p.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, USERS.owner, "insert into public.categories(shop_id,name) values($1,'Bypass')", [
        shopId,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, USERS.owner, "delete from public.products where id=$1", [p.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, USERS.owner, "select pos_private.save_product_core($1,null,$2::jsonb)", [
        shopId,
        JSON.stringify(productInput()),
      ]),
    ).rejects.toThrow(/permission denied/);
    const grants = await db.query<{ table_name: string; privilege_type: string }>(
      "select table_name,privilege_type from information_schema.role_table_grants where grantee='authenticated' and table_schema='public'",
    );
    expect(grants.rows.length).toBeGreaterThanOrEqual(18);
    expect(grants.rows.every((g) => g.privilege_type === "SELECT")).toBe(true);
    const functions = await db.query<{
      proname: string;
      secured: boolean;
      safe_path: boolean;
      anon_execute: boolean;
    }>(
      "select p.proname,p.prosecdef secured,coalesce('search_path=\"\"'=any(p.proconfig),false) safe_path,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_shop','update_shop','create_category','save_product','import_products','receive_stock','adjust_stock','post_sale','collect_payment','return_sale','reverse_sale','record_expense','record_cash_movement','report_shop','cashbook_totals')",
    );
    expect(functions.rows).toHaveLength(15);
    expect(functions.rows.every((f) => f.secured && f.safe_path && !f.anon_execute)).toBe(true);
    const views = await db.query<{ reloptions: string[] }>(
      "select reloptions from pg_class where oid in ('public.sales_ledger'::regclass,'public.sale_items_ledger'::regclass)",
    );
    expect(views.rows.every((v) => v.reloptions.includes("security_invoker=true"))).toBe(true);
  });

  it("financial histories and sale snapshots are immutable even for accidental owner UPDATE/DELETE", async () => {
    const p = await product(db, shopId);
    const s = await sale(db, shopId, p.id);
    await returned(s.id, await itemId(s.id));
    await rpc(db, USERS.owner, "receive_stock", [
      shopId,
      p.id,
      "1",
      "2",
      null,
      "cash",
      null,
      requestId(),
    ]);
    await rpc(db, USERS.owner, "record_expense", [
      shopId,
      "Expense",
      "Other",
      "1",
      "cash",
      "2026-01-01",
      requestId(),
    ]);
    await expect(db.query("update public.sales set total=0 where id=$1", [s.id])).rejects.toThrow(
      /immutable/,
    );
    await expect(db.query("delete from public.sales where id=$1", [s.id])).rejects.toThrow(
      /cannot be deleted/,
    );
    for (const table of [
      "sale_items",
      "sale_adjustments",
      "sale_adjustment_items",
      "payments",
      "expenses",
      "purchases",
      "purchase_items",
      "inventory_movements",
      "cashbook_entries",
      "audit_records",
    ]) {
      await expect(db.exec(`delete from public.${table}`), table).rejects.toThrow(/immutable/);
      await expect(db.exec(`update public.${table} set shop_id=shop_id`), table).rejects.toThrow(
        /immutable/,
      );
    }
  });
});
