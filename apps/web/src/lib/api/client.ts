import type { HttpBody } from '@Cabzone/contracts';
import { ApiError, NetworkError } from './ApiError.js';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | undefined;
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token: explicitToken, query, idempotencyKey, signal } = options;

  const token =
    explicitToken ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('Cabzone_access_token') ?? undefined
      : undefined);

  const url = new URL(BASE_URL + path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError();
  }

  const payload = (await response.json().catch(() => null)) as HttpBody<T> | null;

  if (payload === null || typeof payload !== 'object' || !('success' in payload)) {
    throw new NetworkError();
  }

  if (payload.success === false) throw new ApiError(payload);

  return payload.data;
}
