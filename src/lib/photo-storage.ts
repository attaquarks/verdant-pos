import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { PHOTO_BUCKET, PHOTO_MAX_BYTES } from "@/lib/product-photos";

/** Read with the user's session through the S3 protocol, which does not use
 * Supabase's authenticated-download CDN cache. Never trust a cookie session
 * for authorization: callers first run requireApiContext/getUser and RLS.
 */
export async function readPhotoObject(supabase: SupabaseClient, path: string): Promise<Buffer> {
  const config = getSupabaseConfig();
  if (!config) throw new AppError("Photo service unavailable.", 503);
  const endpoint = new URL(config.url);
  // The loopback fixture is a test-only Storage double, not a hosted Supabase claim.
  if (endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname)) {
    const result = await supabase.storage.from(PHOTO_BUCKET).download(
      path,
      {},
      {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (result.error || !result.data) throw new AppError("Photo unavailable.", 404);
    if (result.data.size > PHOTO_MAX_BYTES) throw new AppError("Photo unavailable.", 404);
    return Buffer.from(await result.data.arrayBuffer());
  }
  const match = /^([a-z]{20})\.supabase\.co$/.exec(endpoint.hostname);
  const anon =
    process.env.SUPABASE_STORAGE_LEGACY_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const region = process.env.SUPABASE_STORAGE_S3_REGION;
  if (!match || !anon || !region || !/^[a-z]{2}-[a-z]+-\d+$/.test(region))
    throw new AppError("Photo service unavailable.", 503);
  try {
    const payload = JSON.parse(
      Buffer.from(anon.split(".")[1] || "", "base64url").toString("utf8"),
    ) as { role?: string; ref?: string };
    if (payload.role !== "anon" || payload.ref !== match[1]) throw new Error("invalid public key");
  } catch {
    throw new AppError("Photo service unavailable.", 503);
  }
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (session.error || !token) throw new AppError("Sign in to continue.", 401);
  const s3 = new S3Client({
    endpoint: `${endpoint.origin}/storage/v1/s3`,
    region,
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: { accessKeyId: match[1], secretAccessKey: anon, sessionToken: token },
  });
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: path }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    if (!response.Body || (response.ContentLength ?? 0) > PHOTO_MAX_BYTES)
      throw new AppError("Photo unavailable.", 404);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > PHOTO_MAX_BYTES) throw new AppError("Photo unavailable.", 404);
      chunks.push(bytes);
    }
    if (!size) throw new AppError("Photo unavailable.", 404);
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 403 || status === 404) throw new AppError("Photo unavailable.", 404);
    throw new AppError("Photo service unavailable.", 503);
  } finally {
    s3.destroy();
  }
}
