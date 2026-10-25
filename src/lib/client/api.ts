"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Typed fetch helper for the /api/v1 REST API. Throws ApiError with field-level messages when available. */
export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; details?: Record<string, string> } } | null;
  if (!res.ok || !json || json.error) {
    if (res.status === 401) {
      // Session expired: a full navigation also clears any stale client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError(res.status, json?.error?.code ?? "error", json?.error?.message ?? "Something went wrong", json?.error?.details);
  }
  return json.data as T;
}

export const newKey = () => crypto.randomUUID();
