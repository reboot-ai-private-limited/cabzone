import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchApi, subscribeAccessToken } from './api';

const storage = vi.hoisted(() => ({
  access: 'expired-access',
  refresh: 'refresh-1',
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
  saveAuthTokens: vi.fn(),
}));

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('./storage', () => ({
  getAccessToken: storage.getAccessToken.mockImplementation(async () => storage.access),
  getRefreshToken: storage.getRefreshToken.mockImplementation(async () => storage.refresh),
  getOrCreateDeviceId: storage.getOrCreateDeviceId.mockResolvedValue('device-1'),
  saveAuthTokens: storage.saveAuthTokens.mockImplementation(async (access: string, refresh: string) => {
    storage.access = access;
    storage.refresh = refresh;
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  storage.access = 'expired-access';
  storage.refresh = 'refresh-1';
});

describe('driver API access-token recovery', () => {
  it('refreshes once, retries location upload and publishes the new token', async () => {
    const updated = vi.fn();
    const unsubscribe = subscribeAccessToken(updated);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ success: true, data: {
        accessToken: 'fresh-access', refreshToken: 'refresh-2',
      } }) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ success: true, data: { ok: true } }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchApi.updateLocation('expired-access', { lat: 26.7, lng: 88.4 }))
      .resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/v1/auth/refresh');
    expect(fetchMock.mock.calls[2]?.[1].headers.Authorization).toBe('Bearer fresh-access');
    expect(updated).toHaveBeenCalledWith('fresh-access');
    unsubscribe();
  });

  it('does not replay an old request after stored credentials change', async () => {
    storage.access = 'another-session';
    const updated = vi.fn();
    const unsubscribe = subscribeAccessToken(updated);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));

    await expect(dispatchApi.updateLocation('expired-access', { lat: 26.7, lng: 88.4 }))
      .rejects.toThrow('Session changed');
    expect(updated).toHaveBeenCalledWith('another-session');
    expect(storage.saveAuthTokens).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ends the session when refresh is rejected', async () => {
    const updated = vi.fn();
    const unsubscribe = subscribeAccessToken(updated);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: async () => ({ success: false, error: { message: 'Refresh token expired' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchApi.updateLocation('expired-access', { lat: 26.7, lng: 88.4 }))
      .rejects.toThrow('Refresh token expired');
    expect(updated).toHaveBeenCalledWith(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('shares one refresh across simultaneous expired requests', async () => {
    const fetchMock = vi.fn(async (url: string, options: { headers?: { Authorization?: string } }) => {
      if (url.includes('/auth/refresh')) {
        return { status: 200, ok: true, json: async () => ({ success: true, data: {
          accessToken: 'fresh-access', refreshToken: 'refresh-2',
        } }) };
      }
      if (options.headers?.Authorization === 'Bearer expired-access') return { status: 401 };
      return { status: 200, ok: true, json: async () => ({ success: true, data: { ok: true } }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      dispatchApi.updateLocation('expired-access', { lat: 26.7, lng: 88.4 }),
      dispatchApi.updateLocation('expired-access', { lat: 26.7, lng: 88.4 }),
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/auth/refresh'))).toHaveLength(1);
  });
});
