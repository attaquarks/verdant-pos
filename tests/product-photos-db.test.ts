import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  USERS,
  asUser as authenticatedQuery,
  createDatabase,
  fixture,
  product,
  requestId,
  row,
  rpc,
} from "./helpers/database";

// The fixture mimics Storage's transaction-local operation marker. Normal app
// calls use authenticated download/upload; signing has a distinct operation.
function asUser<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
  role: "authenticated" | "anon" = "authenticated",
  operation?: string,
) {
  const op =
    operation ??
    (/^\s*insert into storage\.objects/i.test(sql)
      ? "storage.object.upload"
      : "storage.object.get_authenticated");
  return authenticatedQuery<T>(db, user, sql, params, role, op);
}

describe("product photo storage and metadata authorization", () => {
  let db: PGlite, shopId: string, otherShopId: string, productId: string, otherProductId: string;
  const path = (shop: string, product: string, version: string) => `${shop}/${product}/${version}`;
  async function upload(
    user: string | null,
    name: string,
    owner: string | null = user,
    role: "authenticated" | "anon" = "authenticated",
  ) {
    const parts = name.split("/");
    if (
      user &&
      role === "authenticated" &&
      parts.length === 3 &&
      parts.every((p) => /^[0-9a-f-]{36}$/.test(p))
    ) {
      // A failed reservation leaves the direct INSERT to exercise RLS denial.
      await rpc(db, user, "reserve_product_photo", parts).catch(() => undefined);
    }
    return asUser(
      db,
      user,
      "insert into storage.objects(bucket_id,name,owner_id) values('product-photos',$1,$2)",
      [name, owner],
      role,
    );
  }
  beforeAll(async () => {
    db = await createDatabase();
  });
  beforeEach(async () => {
    ({ shopId, otherShopId } = await fixture(db));
    productId = (await product(db, shopId)).id;
    otherProductId = (await product(db, otherShopId, {}, USERS.other)).id;
  });
  afterAll(async () => {
    await db?.close();
  });

  it("creates a private, capped bucket and grants no direct metadata writes", async () => {
    expect(
      await row(
        db,
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id='product-photos'",
      ),
    ).toEqual({
      public: false,
      file_size_limit: 2097152,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
    await expect(
      asUser(
        db,
        USERS.owner,
        "insert into public.product_photos(shop_id,product_id,version) values($1,$2,$3)",
        [shopId, productId, requestId()],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, null, "select * from public.product_photos", [], "anon"),
    ).rejects.toThrow(/permission denied/i);
    const grants = await row<{ anon_rpc: boolean; auth_rpc: boolean }>(
      db,
      "select has_function_privilege('anon','public.link_product_photo(uuid,uuid,uuid,uuid)','execute') anon_rpc, has_function_privilege('authenticated','public.link_product_photo(uuid,uuid,uuid,uuid)','execute') auth_rpc",
    );
    expect(grants).toEqual({ anon_rpc: false, auth_rpc: true });
    expect(
      await row(
        db,
        "select prosecdef from pg_proc where oid='public.product_photo_path_allowed(text)'::regprocedure",
      ),
    ).toEqual({ prosecdef: false });
    expect(
      (
        await asUser(
          db,
          null,
          "select public.product_photo_path_allowed($1) as allowed",
          [path(shopId, productId, requestId())],
          "anon",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  });

  it("accepts only an active member's canonical path for an existing own-shop product and own uploader", async () => {
    const good = path(shopId, productId, requestId());
    await upload(USERS.staff, good);
    const names = (
      await asUser<{ name: string }>(
        db,
        USERS.owner,
        "select name from storage.objects where name=$1",
        [good],
      )
    ).rows;
    expect(names).toEqual([{ name: good }]);
    expect(
      (await asUser(db, USERS.other, "select name from storage.objects where name=$1", [good]))
        .rows,
    ).toEqual([]);
    expect(
      (await asUser(db, null, "select name from storage.objects where name=$1", [good], "anon"))
        .rows,
    ).toEqual([]);
    for (const invalid of [
      path(otherShopId, otherProductId, requestId()),
      path(shopId, otherProductId, requestId()),
      path(shopId, requestId(), requestId()),
      `${shopId}/not-a-uuid/${requestId()}`,
      `${good}/extra`,
      `/${good}`,
      `${shopId.toUpperCase()}/${productId}/${requestId()}`,
    ])
      await expect(upload(USERS.owner, invalid)).rejects.toThrow(/row.level security/i);
    await expect(upload(null, path(shopId, productId, requestId()), null, "anon")).rejects.toThrow(
      /row.level security/i,
    );
    await expect(
      upload(USERS.staff, path(shopId, productId, requestId()), USERS.owner),
    ).rejects.toThrow(/row.level security/i);
    await expect(upload(USERS.staff, good)).rejects.toThrow(/duplicate/i);
  });

  it("restrictive guards prevent broad unrelated permissive policies from opening this bucket", async () => {
    await db.exec(
      "create policy test_broad on storage.objects for all to anon,authenticated using (true) with check (true)",
    );
    try {
      const name = path(shopId, productId, requestId());
      await upload(USERS.owner, name);
      expect(
        (await asUser(db, USERS.other, "select name from storage.objects where name=$1", [name]))
          .rows,
      ).toEqual([]);
      expect(
        (await asUser(db, null, "select name from storage.objects where name=$1", [name], "anon"))
          .rows,
      ).toEqual([]);
      await expect(upload(USERS.other, path(shopId, productId, requestId()))).rejects.toThrow(
        /row.level security/i,
      );
      expect(
        (
          await asUser(
            db,
            USERS.owner,
            "update storage.objects set name=$2 where name=$1 returning name",
            [name, path(shopId, productId, requestId())],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await asUser(
            db,
            USERS.owner,
            "delete from storage.objects where name=$1 returning name",
            [name],
          )
        ).rows,
      ).toEqual([]);
      // The extra guards do not change another bucket's policy behavior.
      await db.query(
        "insert into storage.buckets(id,name,public) values('other-bucket','other-bucket',false) on conflict do nothing",
      );
      await asUser(
        db,
        USERS.other,
        "insert into storage.objects(bucket_id,name,owner_id) values('other-bucket',$1,$2)",
        [requestId(), USERS.other],
      );
    } finally {
      await db.exec("drop policy test_broad on storage.objects");
    }
  });

  it("denies signed URLs and signed uploads while allowing authenticated downloads", async () => {
    const name = path(shopId, productId, requestId());
    await upload(USERS.owner, name);
    const query = "select name from storage.objects where name=$1";
    expect(
      (
        await asUser(
          db,
          USERS.owner,
          query,
          [name],
          "authenticated",
          "storage.object.get_authenticated",
        )
      ).rows,
    ).toHaveLength(1);
    for (const operation of [
      "storage.object.sign",
      "storage.object.sign_many",
      "storage.object.get_public",
      "storage.object.list",
    ]) {
      expect(
        (await asUser(db, USERS.owner, query, [name], "authenticated", operation)).rows,
      ).toHaveLength(0);
    }
    await expect(
      asUser(
        db,
        USERS.owner,
        "insert into storage.objects(bucket_id,name,owner_id) values('product-photos',$1,$2)",
        [path(shopId, productId, requestId()), USERS.owner],
        "authenticated",
        "storage.object.sign_upload_url",
      ),
    ).rejects.toThrow(/row.level security/i);
  });

  it("requires a scoped reservation and bounds pending and uploaded photos", async () => {
    const key = requestId();
    const name = path(shopId, productId, key);
    await expect(
      asUser(
        db,
        USERS.owner,
        "insert into storage.objects(bucket_id,name,owner_id) values('product-photos',$1,$2)",
        [name, USERS.owner],
      ),
    ).rejects.toThrow(/row.level security/i);
    const first = await rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, key]);
    expect(await rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, key])).toEqual(
      first,
    );
    await asUser(
      db,
      USERS.owner,
      "insert into storage.objects(bucket_id,name,owner_id) values('product-photos',$1,$2)",
      [name, USERS.owner],
    );
    await expect(
      rpc(db, USERS.other, "reserve_product_photo", [shopId, productId, requestId()]),
    ).rejects.toThrow(/Active shop membership/i);
    const secondProduct = (await product(db, shopId, { name: "Second product" })).id;
    await expect(
      rpc(db, USERS.owner, "reserve_product_photo", [shopId, secondProduct, key]),
    ).rejects.toThrow(/already in use/i);
    const pending: string[] = [];
    for (let i = 0; i < 149; i++) {
      const id = requestId();
      await rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, id]);
      pending.push(id);
    }
    await expect(
      rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, requestId()]),
    ).rejects.toThrow(/Photo storage limit reached/i);
    // Expired, never-uploaded reservations release capacity without deleting image objects.
    await db.query(
      "update public.product_photo_reservations set expires_at=now()-interval '1 minute' where upload_id=$1",
      [pending[0]],
    );
    expect(
      await rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, requestId()]),
    ).toMatchObject({ upload_id: expect.any(String) });
    await expect(
      rpc(db, USERS.owner, "reserve_product_photo", [shopId, productId, pending[0]]),
    ).rejects.toThrow(/Photo storage limit reached/i);
  }, 30000);

  it("links only an existing object owned by the caller, idempotently, with stale-version compare and no catalog update", async () => {
    const v1 = requestId(),
      v2 = requestId(),
      v3 = requestId();
    await upload(USERS.owner, path(shopId, productId, v1));
    const before = await row(db, "select updated_at from public.products where id=$1", [productId]);
    const first = await rpc(db, USERS.owner, "link_product_photo", [shopId, productId, null, v1]);
    expect(first).toEqual({ product_id: productId, version: v1 });
    expect(await rpc(db, USERS.owner, "link_product_photo", [shopId, productId, null, v1])).toEqual(
      first,
    );
    await expect(
      rpc(db, USERS.owner, "link_product_photo", [shopId, productId, v1, v1]),
    ).rejects.toThrow(/Idempotency key reused/i);
    await upload(USERS.staff, path(shopId, productId, v2));
    await expect(
      rpc(db, USERS.owner, "link_product_photo", [shopId, productId, v1, v2]),
    ).rejects.toThrow(/upload not found/i);
    await expect(
      rpc(db, USERS.owner, "link_product_photo", [shopId, productId, v1, v3]),
    ).rejects.toThrow(/upload not found/i);
    await upload(USERS.owner, path(shopId, productId, v3));
    // Both candidates observed v1. Only the first one can replace it.
    const second = await rpc(db, USERS.staff, "link_product_photo", [shopId, productId, v1, v2]);
    expect(second.version).toBe(v2);
    await expect(
      rpc(db, USERS.owner, "link_product_photo", [shopId, productId, v1, v3]),
    ).rejects.toThrow(/Photo changed/i);
    expect(
      await row(db, "select updated_at from public.products where id=$1", [productId]),
    ).toEqual(before);
    expect(
      (
        await asUser(db, USERS.other, "select * from public.product_photos where product_id=$1", [
          productId,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await asUser(
          db,
          USERS.owner,
          "select version from public.product_photos where product_id=$1",
          [productId],
        )
      ).rows,
    ).toEqual([{ version: v2 }]);
    expect(
      await row(
        db,
        "select count(*)::int count from public.audit_records where action='link_product_photo' and entity_id=$1",
        [productId],
      ),
    ).toEqual({ count: 2 });
    // Historical idempotent result is not a claim that it remains the current version.
    expect(await rpc(db, USERS.owner, "link_product_photo", [shopId, productId, null, v1])).toEqual(
      first,
    );
  });

  it("revocation blocks reads, inserts and RPC retries", async () => {
    const key = requestId();
    await upload(USERS.staff, path(shopId, productId, key));
    await rpc(db, USERS.staff, "link_product_photo", [shopId, productId, null, key]);
    await rpc(db, USERS.owner, "revoke_staff", [
      shopId,
      USERS.staff,
      "No longer employed",
      requestId(),
    ]);
    expect((await asUser(db, USERS.staff, "select * from public.product_photos")).rows).toEqual([]);
    expect(
      (
        await asUser(db, USERS.staff, "select * from storage.objects where name=$1", [
          path(shopId, productId, key),
        ])
      ).rows,
    ).toEqual([]);
    await expect(upload(USERS.staff, path(shopId, productId, requestId()))).rejects.toThrow(
      /row.level security/i,
    );
    await expect(
      rpc(db, USERS.staff, "link_product_photo", [shopId, productId, null, key]),
    ).rejects.toThrow(/Active shop membership/i);
    await expect(
      rpc(db, USERS.other, "link_product_photo", [shopId, productId, null, requestId()]),
    ).rejects.toThrow(/Active shop membership/i);
  });
});
