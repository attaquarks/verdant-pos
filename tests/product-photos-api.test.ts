import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  requireApiContext: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  rpc: vi.fn(),
  productResult: null as unknown,
  photoResult: null as unknown,
  listResult: null as unknown,
}));
vi.mock("@/lib/auth", () => ({ requireApiContext: m.requireApiContext }));
import { GET, PUT } from "../src/app/api/products/[id]/photo/route";
import { GET as versions } from "../src/app/api/products/photo-versions/route";
import { AppError } from "../src/lib/errors";
import { PHOTO_MAX_BYTES } from "../src/lib/product-photos";

const shop = "10000000-0000-4000-8000-000000000001";
const product = "20000000-0000-4000-8000-000000000002";
const key = "30000000-0000-4000-8000-000000000003";
const version = "40000000-0000-4000-8000-000000000004";
const animated = Buffer.from(
  "UklGRsQAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GSgAAAAAAAAAAAAEAAAEAAGQAAAJWUDggMgAAADABAJ0BKgIAAgABQCYloAADcAD+8ut///mwP/bz/wR6Af//0uD//pcH//S4P/SkAAAAQU5NRkYAAAAAAAAAAAABAAABAABkAAAAVlA4IC4AAAA0AQCdASoCAAIAAAAmJaAAA3AA/vtV4///S4P/+lwf/9Lg/9Lg//rV5Vesq6AA",
  "base64",
);
let png: Buffer, jpeg: Buffer;
const ctx = (id = product) => ({ params: Promise.resolve({ id }) });
function request(body: Buffer, headers: Record<string, string> = {}) {
  return new Request(`https://shop.example/api/products/${product}/photo`, {
    method: "PUT",
    headers: {
      origin: "https://shop.example",
      "content-type": "image/png",
      "x-photo-request-id": key,
      "x-photo-expected-version": "none",
      ...headers,
    },
    body: new Uint8Array(body),
  });
}
function get() {
  return new Request(`https://shop.example/api/products/${product}/photo`);
}
function chain(table: string) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => (table === "products" ? m.productResult : m.photoResult),
    in: async () => m.listResult,
  };
  return q;
}
beforeAll(async () => {
  png = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#c32" } })
    .png()
    .toBuffer();
  jpeg = await sharp(png).jpeg().withMetadata({ orientation: 6 }).toBuffer();
});
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://shop.example");
  m.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  m.download.mockReset().mockResolvedValue({ data: new Blob([new Uint8Array(png)]), error: null });
  m.rpc
    .mockReset()
    .mockImplementation(async (name: string) =>
      name === "reserve_product_photo"
        ? { data: { upload_id: key }, error: null }
        : { data: { product_id: product, version: key }, error: null },
    );
  m.productResult = { data: { id: product }, error: null };
  m.photoResult = { data: { version }, error: null };
  m.listResult = { data: [{ product_id: product, version }], error: null };
  m.requireApiContext.mockReset().mockResolvedValue({
    shop: { id: shop },
    user: { id: "user" },
    supabase: {
      from: chain,
      storage: { from: () => ({ upload: m.upload, download: m.download }) },
      rpc: m.rpc,
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("product photo API", () => {
  it("re-encodes a JPEG as WebP, strips metadata, uses an immutable user-scoped path and links with expected version", async () => {
    const result = await PUT(
      request(jpeg, { "content-type": "image/jpeg", "x-photo-expected-version": version }),
      ctx(),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, product_id: product, version: key });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(m.upload).toHaveBeenCalledOnce();
    const [path, bytes, options] = m.upload.mock.calls[0];
    expect(path).toBe(`${shop}/${product}/${key}`);
    expect(options).toEqual({ contentType: "image/webp", upsert: false, cacheControl: "0" });
    const info = await sharp(bytes).metadata();
    expect(info.format).toBe("webp");
    expect(info.exif).toBeUndefined();
    expect(info.icc).toBeUndefined();
    expect(m.rpc).toHaveBeenCalledWith("link_product_photo", {
      p_shop_id: shop,
      p_product_id: product,
      p_expected_version: version,
      p_request_id: key,
    });
  });
  it("refuses cross-origin, invalid IDs, unsupported type, and missing expected version before storage", async () => {
    expect((await PUT(request(png, { origin: "https://evil.example" }), ctx())).status).toBe(403);
    expect((await PUT(request(png, { "content-type": "image/svg+xml" }), ctx())).status).toBe(415);
    expect((await PUT(request(png, { "x-photo-request-id": "bad" }), ctx())).status).toBe(400);
    expect((await PUT(request(png), ctx("bad"))).status).toBe(400);
    const noVersion = request(png);
    noVersion.headers.delete("x-photo-expected-version");
    expect((await PUT(noVersion, ctx())).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("authenticates and rejects absent or cross-tenant product before ingest", async () => {
    m.requireApiContext.mockRejectedValueOnce(new AppError("Sign in", 401));
    expect((await PUT(request(png), ctx())).status).toBe(401);
    m.requireApiContext.mockRejectedValueOnce(new AppError("revoked", 403));
    expect((await PUT(request(png), ctx())).status).toBe(403);
    m.productResult = { data: null, error: null };
    expect((await PUT(request(png), ctx())).status).toBe(404);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("rejects MIME spoofing, garbage, truncation, animation, and oversized data", async () => {
    expect((await PUT(request(png, { "content-type": "image/jpeg" }), ctx())).status).toBe(415);
    expect((await PUT(request(Buffer.from("<svg onload=alert(1)>")), ctx())).status).toBe(415);
    expect((await PUT(request(png.subarray(0, 20)), ctx())).status).toBe(400);
    expect((await PUT(request(animated, { "content-type": "image/webp" }), ctx())).status).toBe(
      400,
    );
    expect((await PUT(request(Buffer.alloc(PHOTO_MAX_BYTES + 1)), ctx())).status).toBe(413);
    expect(
      (await PUT(request(png, { "content-length": String(PHOTO_MAX_BYTES + 1) }), ctx())).status,
    ).toBe(413);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("stops an upload stream that stalls without calling Storage", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start() {} });
      const init = {
        method: "PUT",
        headers: {
          origin: "https://shop.example",
          "content-type": "image/png",
          "x-photo-request-id": key,
          "x-photo-expected-version": "none",
        },
        body: stream,
        duplex: "half",
      } as RequestInit;
      const pending = PUT(
        new Request(`https://shop.example/api/products/${product}/photo`, init),
        ctx(),
      );
      await vi.advanceTimersByTimeAsync(10_001);
      expect((await pending).status).toBe(408);
      expect(m.upload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("limits dimensions and decoded pixels even for a small compressed image", async () => {
    const bomb = await sharp({
      create: { width: 4200, height: 4000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const tooWide = await sharp({
      create: { width: 8200, height: 1, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(bomb.length).toBeLessThan(PHOTO_MAX_BYTES);
    expect((await PUT(request(bomb), ctx())).status).toBe(400);
    expect((await PUT(request(tooWide), ctx())).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("idempotently recovers from duplicate storage uploads only for byte-identical normalized content", async () => {
    m.upload.mockImplementation(async (_path, bytes) => {
      m.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(bytes)]), error: null });
      return { data: null, error: { status: 409 } };
    });
    expect((await PUT(request(png), ctx())).status).toBe(200);
    m.download
      .mockReset()
      .mockResolvedValue({ data: new Blob([new Uint8Array(jpeg)]), error: null });
    m.upload.mockReset().mockResolvedValue({ data: null, error: { status: 409 } });
    expect((await PUT(request(png), ctx())).status).toBe(409);
    expect(m.rpc.mock.calls.filter(([name]) => name === "link_product_photo")).toHaveLength(1);
  });
  it("never claims success when storage or linking fails, and hides provider details", async () => {
    m.upload.mockResolvedValueOnce({ data: null, error: { status: 500, message: "secret-path" } });
    m.download.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    const error = await PUT(request(png), ctx());
    expect(error.status).toBe(503);
    expect(JSON.stringify(await error.json())).not.toContain("secret-path");
    m.rpc.mockResolvedValueOnce({ data: { upload_id: key }, error: null });
    m.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "sensitive details" },
    });
    const stale = await PUT(request(png), ctx());
    expect(stale.status).toBe(409);
    expect(JSON.stringify(await stale.json())).not.toContain("sensitive");
  });
  it("serves re-decoded bytes with no-store/nosniff, never raw potentially spoofed objects", async () => {
    m.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(jpeg)]), error: null });
    const result = await GET(get(), ctx());
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/webp");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).exif).toBeUndefined();
    m.download.mockResolvedValueOnce({
      data: new Blob(["<script>alert(1)</script>"]),
      error: null,
    });
    const bad = await GET(get(), ctx());
    expect(bad.status).toBe(404);
    expect(bad.headers.get("cache-control")).toBe("private, no-store");
  });
  it("enforces authorization and hides absent/cross-shop metadata or missing object", async () => {
    m.requireApiContext.mockRejectedValueOnce(new AppError("Sign in", 401));
    expect((await GET(get(), ctx())).status).toBe(401);
    m.requireApiContext.mockRejectedValueOnce(new AppError("revoked", 403));
    expect((await GET(get(), ctx())).status).toBe(403);
    m.photoResult = { data: null, error: null };
    expect((await GET(get(), ctx())).status).toBe(404);
    expect(m.download).not.toHaveBeenCalled();
    m.photoResult = { data: { version }, error: null };
    m.download.mockResolvedValueOnce({ data: null, error: { statusCode: 404 } });
    expect((await GET(get(), ctx())).status).toBe(404);
  });
  it("offers isolated bounded version lookup without changing existing product APIs", async () => {
    const url = `https://shop.example/api/products/photo-versions?ids=${product}`;
    const response = await versions(new Request(url));
    expect(await response.json()).toEqual({ photos: [{ product_id: product, version }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (await versions(new Request("https://shop.example/api/products/photo-versions?ids=bad")))
        .status,
    ).toBe(400);
    m.listResult = { data: null, error: { code: "PGRST205" } };
    expect((await versions(new Request(url))).status).toBe(503);
  });
});
