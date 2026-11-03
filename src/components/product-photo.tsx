"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useT } from "./preferences";

const OUTPUT_LIMIT = 2 * 1024 * 1024;
const INPUT_LIMIT = 12 * 1024 * 1024;
const INPUT_PIXELS = 24_000_000;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export type PhotoAttempt = {
  productId: string;
  requestId: string;
  expected: string | null;
  bytes: Blob;
};
export class PhotoUploadError extends Error {
  constructor(public readonly status: number) {
    super("Photo upload failed");
  }
}

/** A client convenience, never a security boundary. The server revalidates every byte. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!TYPES.has(file.type)) throw new PhotoUploadError(415);
  if (!file.size || file.size > INPUT_LIMIT) throw new PhotoUploadError(413);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoUploadError(415);
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > INPUT_PIXELS)
      throw new PhotoUploadError(413);
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoUploadError(415);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const bytes = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8),
    );
    if (!bytes || !TYPES.has(bytes.type)) throw new PhotoUploadError(415);
    if (bytes.size > OUTPUT_LIMIT) throw new PhotoUploadError(413);
    return bytes;
  } finally {
    bitmap.close();
  }
}

/** Preserve this object after a lost response and retry it without changing bytes or UUID. */
export async function uploadPhoto(attempt: PhotoAttempt): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/products/${encodeURIComponent(attempt.productId)}/photo`, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": attempt.bytes.type,
        "X-Photo-Request-Id": attempt.requestId,
        "X-Photo-Expected-Version": attempt.expected ?? "none",
      },
      body: attempt.bytes,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new PhotoUploadError(503);
  }
  if (!response.ok) throw new PhotoUploadError(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PhotoUploadError(503);
  }
  const result = body as { ok?: boolean; product_id?: string; version?: string };
  if (!result.ok || result.product_id !== attempt.productId || result.version !== attempt.requestId)
    throw new PhotoUploadError(503);
  return result.version;
}

export function photoErrorKey(
  error: unknown,
):
  | "Photo is too large. Choose a smaller photo."
  | "Choose a JPEG, PNG or WebP photo."
  | "Photo changed. Close and reopen the product."
  | "Photo storage is full."
  | "Photo could not be saved. Try again." {
  const code = error instanceof PhotoUploadError ? error.status : 0;
  if (code === 413) return "Photo is too large. Choose a smaller photo.";
  if (code === 400 || code === 415) return "Choose a JPEG, PNG or WebP photo.";
  if (code === 409) return "Photo changed. Close and reopen the product.";
  if (code === 429) return "Photo storage is full.";
  return "Photo could not be saved. Try again.";
}

export function ProductPhoto({
  productId,
  name,
  version,
  size = "thumbnail",
}: {
  productId: string;
  name: string;
  version?: string | null;
  size?: "thumbnail" | "card";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [productId, version]);
  if (!version || failed)
    return <Package size={size === "card" ? 48 : 19} strokeWidth={1.5} aria-hidden="true" />;
  return (
    // Private same-origin image route rechecks authorization; optimizer caching could bypass it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/products/${encodeURIComponent(productId)}/photo?v=${encodeURIComponent(version)}`}
      alt={size === "card" ? name : ""}
      loading="lazy"
      className={`product-photo product-photo--${size}`}
      onError={() => setFailed(true)}
    />
  );
}

export function PhotoField({
  id,
  disabled,
  onChange,
}: {
  id: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const t = useT();
  return (
    <label className="field field--full" htmlFor={id}>
      <span>
        {t("Product photo")} <span className="optional">{t("(optional)")}</span>
      </span>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.files?.[0] ?? null)}
      />
    </label>
  );
}
