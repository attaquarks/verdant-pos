import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { ValidationError } from "./validation";

export function assertMutationOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new AppError("APP_URL must be configured before accepting changes.", 503);
  const expected = new URL(configured || request.url).origin;
  if (!origin || origin !== expected)
    throw new AppError(
      "This request did not come from the application. Reload the page and try again.",
      403,
    );
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new AppError("Use an application/json request.", 415);
}
export async function readLimitedJSON(request: Request, maxBytes = 600000): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new AppError("This request is too large.", 413);
  if (!request.body) throw new AppError("The request body is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError("This request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The request body is not valid JSON.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ValidationError)
    return NextResponse.json(
      { ok: false, error: error.message, fields: error.fields },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  // Do not leak SQL details, tokens, payloads, or customer data into responses or logs.
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json(
    { ok: false, error: "Something went wrong. Please try again; unchanged retries are safe." },
    { status: 500 },
  );
}
export function json(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
