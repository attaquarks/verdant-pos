/** Fixture-only compatibility checks; not a Supabase Storage conformance test. */
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_ORIGIN,
  FIXTURE_PUBLISHABLE_KEY,
  type FixtureState,
} from "./fixture-config";

const control = { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE };
const bucket = "product-photos";
const client = () =>
  createClient(FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

async function reset() {
  const response = await fetch(`${FIXTURE_ORIGIN}/__fixture/reset`, {
    method: "POST",
    headers: control,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as FixtureState;
}

// Send a chunked request with no Content-Length to exercise the streaming cap.
async function chunkedUpload(path: string, token: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      `${FIXTURE_ORIGIN}/storage/v1/object/${bucket}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: FIXTURE_PUBLISHABLE_KEY,
          authorization: `Bearer ${token}`,
          "content-type": "image/webp",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.write(Buffer.alloc(1024 * 1024));
    req.write(Buffer.alloc(1024 * 1024));
    req.end(Buffer.from([0]));
  });
}

test("fixture Storage upload/download uses real SQL RLS, limits, immutable keys and reset", async () => {
  const state = await reset();
  const owner = client(),
    staff = client(),
    other = client(),
    anon = client();
  const ownerLogin = await owner.auth.signInWithPassword(FIXTURE_CREDENTIALS.owner);
  const staffLogin = await staff.auth.signInWithPassword(FIXTURE_CREDENTIALS.staff);
  expect(ownerLogin.error).toBeNull();
  expect(staffLogin.error).toBeNull();
  expect((await other.auth.signInWithPassword(FIXTURE_CREDENTIALS.other)).error).toBeNull();
  const token = ownerLogin.data.session!.access_token;
  const staffToken = staffLogin.data.session!.access_token;
  const headers = { apikey: FIXTURE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` };
  const preflight = await fetch(`${FIXTURE_ORIGIN}/storage/v1/object/${bucket}/ignored`, {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:3000",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,apikey,content-type,cache-control,x-upsert",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-headers")).toContain("x-upsert");
  expect(preflight.headers.get("access-control-allow-headers")).toContain("cache-control");
  const shop = state.fixture.shopId,
    product = state.fixture.products.rice,
    version = randomUUID();
  const path = `${shop}/${product}/${version}`;
  const reserve = async (id: string) => {
    const r = await owner.rpc("reserve_product_photo", {
      p_shop_id: shop,
      p_product_id: product,
      p_upload_id: id,
    });
    expect(r.error).toBeNull();
  };
  await reserve(version);
  const bytes = await sharp({
    create: { width: 3, height: 3, channels: 3, background: "#3e8357" },
  })
    .webp()
    .toBuffer();
  const upload = await owner.storage.from(bucket).upload(path, bytes, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "0",
  });
  expect(upload.error).toBeNull();
  expect(upload.data).toMatchObject({ path, fullPath: `${bucket}/${path}` });
  expect(upload.data?.id).toMatch(/^[0-9a-f-]{36}$/);
  const download = await owner.storage.from(bucket).download(path, {}, { cache: "no-store" });
  expect(download.error).toBeNull();
  expect(download.data?.type).toBe("image/webp");
  expect(Buffer.from(await download.data!.arrayBuffer())).toEqual(bytes);
  const authenticatedUrl = `${FIXTURE_ORIGIN}/storage/v1/object/authenticated/${bucket}/${path}`;
  const authenticated = await fetch(authenticatedUrl, { headers });
  expect(authenticated.status).toBe(200);
  expect(authenticated.headers.get("content-type")).toBe("image/webp");
  expect(authenticated.headers.get("content-length")).toBe(String(bytes.length));
  expect(Buffer.from(await authenticated.arrayBuffer())).toEqual(bytes);

  const duplicate = await owner.storage.from(bucket).upload(path, Buffer.from("changed"), {
    contentType: "image/webp",
    upsert: false,
  });
  expect(duplicate.error?.status).toBe(409);
  expect(duplicate.error?.statusCode).toBe("409");
  expect(
    (
      await owner.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "image/webp", upsert: true })
    ).error?.status,
  ).toBe(400);
  expect(
    Buffer.from(await (await owner.storage.from(bucket).download(path)).data!.arrayBuffer()),
  ).toEqual(bytes);

  const linkArgs = {
    p_shop_id: shop,
    p_product_id: product,
    p_expected_version: null,
    p_request_id: version,
  };
  const linked = await owner.rpc("link_product_photo", linkArgs);
  expect(linked.error).toBeNull();
  expect(linked.data).toMatchObject({ product_id: product, version });
  expect((await owner.rpc("link_product_photo", linkArgs)).data).toEqual(linked.data);
  expect(
    (
      await owner
        .from("product_photos")
        .select("version")
        .eq("shop_id", shop)
        .eq("product_id", product)
        .single()
    ).data,
  ).toEqual({ version });
  expect(
    (await staff.from("product_photos").select("version").eq("product_id", product)).data,
  ).toEqual([{ version }]);
  expect(
    (await other.from("product_photos").select("version").eq("product_id", product)).data,
  ).toEqual([]);
  expect((await staff.storage.from(bucket).download(path)).error).toBeNull();
  expect((await other.storage.from(bucket).download(path)).error?.status).toBe(404);
  expect((await anon.storage.from(bucket).download(path)).error?.status).toBe(401);
  const deniedPath = `${shop}/${product}/${randomUUID()}`;
  expect(
    (await other.storage.from(bucket).upload(deniedPath, bytes, { contentType: "image/webp" }))
      .error?.status,
  ).toBe(403);
  // Failed RLS insertion must not leave bytes accessible to the shop owner.
  expect((await owner.storage.from(bucket).download(deniedPath)).error?.status).toBe(404);
  expect(
    (
      await owner.storage
        .from(bucket)
        .upload(`${shop}/${randomUUID()}/${randomUUID()}`, bytes, { contentType: "image/webp" })
    ).error?.status,
  ).toBe(403);

  // A stale expected version rolls back, and the same request ID can then
  // replace the first photo with the correct (non-null) expected version.
  const replacement = randomUUID();
  await reserve(replacement);
  const replacementPath = `${shop}/${product}/${replacement}`;
  expect(
    (
      await owner.storage.from(bucket).upload(replacementPath, bytes, {
        contentType: "image/webp",
      })
    ).error,
  ).toBeNull();
  const replacementArgs = { ...linkArgs, p_request_id: replacement };
  expect(
    (
      await owner.rpc("link_product_photo", {
        ...replacementArgs,
        p_expected_version: randomUUID(),
      })
    ).error?.code,
  ).toBe("23514");
  expect(
    (await owner.rpc("link_product_photo", { ...replacementArgs, p_expected_version: version }))
      .data,
  ).toMatchObject({ product_id: product, version: replacement });

  const concurrentId = randomUUID();
  await reserve(concurrentId);
  const concurrentPath = `${shop}/${product}/${concurrentId}`;
  const different = Buffer.from("second concurrent payload");
  const [a, b] = await Promise.all([
    owner.storage.from(bucket).upload(concurrentPath, bytes, { contentType: "image/webp" }),
    owner.storage.from(bucket).upload(concurrentPath, different, { contentType: "image/webp" }),
  ]);
  expect([a, b].filter((result) => !result.error)).toHaveLength(1);
  expect([a, b].filter((result) => result.error?.status === 409)).toHaveLength(1);
  const concurrentDownload = await owner.storage.from(bucket).download(concurrentPath);
  expect(Buffer.from(await concurrentDownload.data!.arrayBuffer())).toEqual(
    a.error ? different : bytes,
  );

  const badMimeId = randomUUID();
  await reserve(badMimeId);
  const badMimePath = `${shop}/${product}/${badMimeId}`;
  expect(
    (await owner.storage.from(bucket).upload(badMimePath, bytes, { contentType: "text/plain" }))
      .error?.status,
  ).toBe(415);
  expect((await owner.storage.from(bucket).download(badMimePath)).error?.status).toBe(404);
  const tooLargeId = randomUUID();
  await reserve(tooLargeId);
  const tooLargePath = `${shop}/${product}/${tooLargeId}`;
  expect(
    (
      await owner.storage
        .from(bucket)
        .upload(tooLargePath, Buffer.alloc(2 * 1024 * 1024 + 1), { contentType: "image/webp" })
    ).error?.status,
  ).toBe(413);
  expect(await chunkedUpload(tooLargePath, token)).toBe(413);
  expect((await owner.storage.from(bucket).download(tooLargePath)).error?.status).toBe(404);
  // Bucket MIME rules accept JPEG too; a fixture download preserves the
  // declared MIME. The Next photo path itself uploads normalized WebP.
  const jpegId = randomUUID();
  await reserve(jpegId);
  const jpegPath = `${shop}/${product}/${jpegId}`;
  expect(
    (await owner.storage.from(bucket).upload(jpegPath, bytes, { contentType: "image/jpeg" })).error,
  ).toBeNull();
  expect((await owner.storage.from(bucket).download(jpegPath)).data?.type).toBe("image/jpeg");
  const maxId = randomUUID();
  await reserve(maxId);
  const maxPath = `${shop}/${product}/${maxId}`;
  const maxBytes = Buffer.alloc(2 * 1024 * 1024, 7);
  expect(
    (await owner.storage.from(bucket).upload(maxPath, maxBytes, { contentType: "image/webp" }))
      .error,
  ).toBeNull();
  expect((await owner.storage.from(bucket).download(maxPath)).data?.size).toBe(maxBytes.length);
  for (const badPath of [
    `${shop.toUpperCase()}/${product}/${randomUUID()}`,
    `${shop}/${product}/${randomUUID()}/extra`,
    `${shop}/${product}/%2f${randomUUID()}`,
  ]) {
    expect(
      (await fetch(`${FIXTURE_ORIGIN}/storage/v1/object/${bucket}/${badPath}`, { headers })).status,
    ).toBe(400);
  }
  expect(
    (await fetch(`${FIXTURE_ORIGIN}/storage/v1/object/other-bucket/${path}`, { headers })).status,
  ).toBe(404);
  expect((await fetch(`${authenticatedUrl}?versionId=1`, { headers })).status).toBe(400);
  expect(
    (
      await fetch(authenticatedUrl, {
        headers: { apikey: FIXTURE_PUBLISHABLE_KEY, authorization: `Bearer ${staffToken}` },
      })
    ).status,
  ).toBe(200);

  const revoked = await owner.rpc("revoke_staff", {
    p_shop_id: shop,
    p_user_id: staffLogin.data.user!.id,
    p_reason: "fixture revocation test",
    p_request_id: randomUUID(),
  });
  expect(revoked.error).toBeNull();
  expect((await staff.storage.from(bucket).download(path)).error?.status).toBe(404);
  expect(
    (
      await staff.storage
        .from(bucket)
        .upload(`${shop}/${product}/${randomUUID()}`, bytes, { contentType: "image/webp" })
    ).error?.status,
  ).toBe(403);
  expect((await staff.from("product_photos").select("version")).data).toEqual([]);
  expect((await owner.storage.from(bucket).download(path)).error).toBeNull();

  // Reset revokes sessions and removes test objects/bytes; even a fresh session
  // cannot access an object from the previous fixture's discarded shop.
  await reset();
  expect((await fetch(authenticatedUrl, { headers })).status).toBe(401);
  expect((await owner.auth.signInWithPassword(FIXTURE_CREDENTIALS.owner)).error).toBeNull();
  expect((await owner.storage.from(bucket).download(path)).error?.status).toBe(404);
  await reset();
});
