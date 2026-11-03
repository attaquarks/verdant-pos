import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { AppError } from "@/lib/errors";

export const PHOTO_BUCKET = "product-photos";
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PIXEL_LIMIT = 16_000_000;
const DIMENSION_LIMIT = 8192;
const TIMEOUT_MS = 10_000;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function photoUuid(value: string | null): string {
  if (!value || !z.uuid().safeParse(value).success)
    throw new AppError("Invalid photo reference.", 400);
  return value.toLowerCase();
}
export function photoPath(shop: string, product: string, version: string): string {
  return `${photoUuid(shop)}/${photoUuid(product)}/${photoUuid(version)}`;
}
export function assertPhotoOrigin(request: Request): void {
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new AppError("APP_URL must be configured before accepting changes.", 503);
  if (
    !request.headers.get("origin") ||
    request.headers.get("origin") !== new URL(configured || request.url).origin
  )
    throw new AppError("This request did not come from the application.", 403);
}
export function photoMime(request: Request): string {
  const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!MIME_TYPES.has(mime)) throw new AppError("Use a JPEG, PNG or WebP image.", 415);
  return mime;
}

/** Limit while reading, not just by the optional and untrusted Content-Length. */
export async function readPhotoBody(request: Request): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw new AppError("Invalid content length.", 400);
  if (length !== null && Number(length) > PHOTO_MAX_BYTES)
    throw new AppError("Photo is too large.", 413);
  if (!request.body) throw new AppError("Photo is empty.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError("Photo upload timed out.", 408)), TIMEOUT_MS);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > PHOTO_MAX_BYTES) throw new AppError("Photo is too large.", 413);
      chunks.push(value);
    }
    if (!size) throw new AppError("Photo is empty.", 400);
    return Buffer.concat(chunks, size);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError("Could not read the photo.", 400);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function magic(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** All reads (including objects uploaded directly to Storage) use this decoder.
 * No original EXIF/ICC/XMP/comments or user-chosen filenames reach the browser. */
export async function normalizePhoto(bytes: Buffer, declaredMime?: string): Promise<Buffer> {
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES)
    throw new AppError("Photo is too large or empty.", 413);
  const detected = magic(bytes);
  if (!detected || (declaredMime && detected !== declaredMime))
    throw new AppError("Photo content does not match a supported image type.", 415);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AppError("Photo processing timed out.", 408)),
        TIMEOUT_MS,
      );
    });
    const run = async () => {
      // animated:true lets metadata report all frames instead of silently dropping them.
      const input = sharp(bytes, {
        limitInputPixels: PIXEL_LIMIT,
        animated: true,
        failOn: "warning",
      });
      const info = await input.metadata();
      const format = detected.slice(6);
      if (
        info.format !== format ||
        (info.pages ?? 1) !== 1 ||
        !info.width ||
        !info.height ||
        info.width > DIMENSION_LIMIT ||
        info.height > DIMENSION_LIMIT ||
        info.width * info.height > PIXEL_LIMIT
      )
        throw new AppError("Photo must be a single, reasonably sized image.", 400);
      const output = await sharp(bytes, { limitInputPixels: PIXEL_LIMIT, failOn: "warning" })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .timeout({ seconds: 8 })
        .toBuffer();
      if (output.length > PHOTO_MAX_BYTES) throw new AppError("Processed photo is too large.", 413);
      return output;
    };
    return await Promise.race([run(), timeout]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Photo could not be decoded safely.", 400);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
