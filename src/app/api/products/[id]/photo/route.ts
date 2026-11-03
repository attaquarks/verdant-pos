import { requireApiContext } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import {
  assertPhotoOrigin,
  normalizePhoto,
  photoMime,
  photoPath,
  photoUuid,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  readPhotoBody,
} from "@/lib/product-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function unavailable(): AppError {
  return new AppError("Photo service unavailable. Retry the same request safely.", 503);
}
function status(error: { status?: string | number; statusCode?: string | number }): number {
  return Number(error.status ?? error.statusCode ?? 0);
}

// Storage uploads do not currently accept an abort signal. A timeout can leave
// an object behind; the unchanged retry checks it byte-for-byte before linking.
async function timed<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertPhotoOrigin(request);
    const mime = photoMime(request);
    const productId = photoUuid((await context.params).id);
    const requestId = photoUuid(request.headers.get("x-photo-request-id"));
    const expectedHeader = request.headers.get("x-photo-expected-version");
    if (expectedHeader === null) throw new AppError("Expected photo version is required.", 400);
    const expected = expectedHeader === "none" ? null : photoUuid(expectedHeader);
    const { supabase, shop } = await requireApiContext();
    if (!shop) throw new AppError("Shop unavailable.", 403);
    const product = await supabase
      .from("products")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("id", productId)
      .maybeSingle();
    if (product.error) throw unavailable();
    if (!product.data) throw new AppError("Product not found.", 404);
    const normalized = await normalizePhoto(await readPhotoBody(request), mime);
    const reservation = await timed(
      Promise.resolve(
        supabase.rpc("reserve_product_photo", {
          p_shop_id: shop.id,
          p_product_id: productId,
          p_upload_id: requestId,
        }),
      ),
    );
    if (reservation.error) {
      if (reservation.error.code === "42501")
        throw new AppError("Shop access is no longer available.", 403);
      if (reservation.error.code === "23514")
        throw new AppError("Photo storage limit reached.", 429);
      if (["23505", "22023"].includes(reservation.error.code))
        throw new AppError("Photo request conflicts with another upload.", 409);
      throw unavailable();
    }
    if (!reservation.data || reservation.data.upload_id !== requestId) throw unavailable();
    const path = photoPath(shop.id, productId, requestId);
    const bucket = supabase.storage.from(PHOTO_BUCKET);
    const uploaded = await timed(
      bucket.upload(path, normalized, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "0",
      }),
    );
    if (uploaded.error) {
      // A prior response may have been lost, or another identical retry won.
      // Never accept a duplicate key with different normalized bytes.
      const prior = await bucket.download(
        path,
        {},
        { signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      if (prior.error || !prior.data) throw unavailable();
      if (
        prior.data.size > PHOTO_MAX_BYTES ||
        !Buffer.from(await prior.data.arrayBuffer()).equals(normalized)
      )
        throw new AppError("Photo request ID was already used for different content.", 409);
    }
    const linked = await supabase.rpc("link_product_photo", {
      p_shop_id: shop.id,
      p_product_id: productId,
      p_expected_version: expected,
      p_request_id: requestId,
    });
    if (linked.error) {
      if (linked.error.code === "42501")
        throw new AppError("Shop access is no longer available.", 403);
      if (["23514", "23505", "22023"].includes(linked.error.code))
        throw new AppError(
          "Photo changed or request ID was already used. Refresh and try again.",
          409,
        );
      throw unavailable();
    }
    if (!linked.data || linked.data.product_id !== productId || linked.data.version !== requestId)
      throw unavailable();
    return json({ ok: true, product_id: productId, version: requestId });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function GET(_request: Request, context: Context) {
  try {
    const productId = photoUuid((await context.params).id);
    const { supabase, shop } = await requireApiContext();
    if (!shop) throw new AppError("Shop unavailable.", 403);
    const metadata = await supabase
      .from("product_photos")
      .select("version")
      .eq("shop_id", shop.id)
      .eq("product_id", productId)
      .maybeSingle();
    if (metadata.error) throw unavailable();
    if (!metadata.data) throw new AppError("Photo not found.", 404);
    const path = photoPath(shop.id, productId, metadata.data.version);
    const download = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(path, {}, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (download.error) {
      if (status(download.error) === 404) throw new AppError("Photo not found.", 404);
      throw unavailable();
    }
    if (!download.data) throw unavailable();
    // Storage enforces the bucket cap; check again before reading/decoding.
    if (download.data.size > PHOTO_MAX_BYTES) throw new AppError("Photo unavailable.", 404);
    let normalized: Buffer;
    try {
      normalized = await normalizePhoto(Buffer.from(await download.data.arrayBuffer()));
    } catch {
      throw new AppError("Photo unavailable.", 404);
    }
    return new Response(new Uint8Array(normalized), {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
}
