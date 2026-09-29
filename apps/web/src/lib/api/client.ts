import type { HttpBody } from '@cabzone/contracts';
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

const ACCESS_KEY = 'Cabzonee_access_token';
const REFRESH_KEY = 'Cabzonee_refresh_token';
const DEVICE_ID = 'admin-web-console';

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Access tokens live 15 minutes. Exchange the stored refresh token for a new pair, once at a
 * time — refresh tokens rotate, so two concurrent refreshes would trip reuse detection and
 * revoke the whole session.
 */
function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;
      const res = await fetch(new URL(BASE_URL + '/v1/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, deviceId: DEVICE_ID }),
      });
      const payload = (await res.json().catch(() => null)) as HttpBody<{
        accessToken: string;
        refreshToken: string;
      }> | null;
      if (payload === null || payload.success !== true) return null;
      localStorage.setItem(ACCESS_KEY, payload.data.accessToken);
      localStorage.setItem(REFRESH_KEY, payload.data.refreshToken);
      return payload.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const { method = 'GET', body, token: explicitToken, query, idempotencyKey, signal } = options;

  const token =
    (isRetry ? undefined : explicitToken) ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('Cabzonee_access_token') ?? undefined
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

  if (payload.success === false) {
    if (
      response.status === 401 &&
      !isRetry &&
      !path.startsWith('/v1/auth/') &&
      typeof window !== 'undefined'
    ) {
      const fresh = await refreshAccessToken();
      if (fresh !== null) return request<T>(path, { ...options, token: fresh }, true);
    }
    throw new ApiError(payload);
  }

  return payload.data;
}
