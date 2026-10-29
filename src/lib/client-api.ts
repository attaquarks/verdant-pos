"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string[]> = {},
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export { ApiError as APIError };

async function responseJSON<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Retry without changing the form to avoid duplicates.",
      {},
      response.status,
    );
  }
  const result = data as { ok?: boolean; error?: string; fields?: Record<string, string[]> };
  if (!response.ok || result.ok === false)
    throw new ApiError(
      result.error || "The request could not be completed.",
      result.fields,
      response.status,
    );
  return data as T;
}
export async function mutate(
  action: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`/api/actions/${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ ...payload, request_id: requestId }),
    });
  } catch {
    throw new ApiError(
      "Connection interrupted. Your sale may have been saved. Retry this unchanged form to safely recover the original result.",
    );
  }
  const result = await responseJSON<{ ok: true; data: Record<string, unknown> }>(response);
  return result.data;
}
export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(20000),
  });
  return responseJSON<T>(response);
}
