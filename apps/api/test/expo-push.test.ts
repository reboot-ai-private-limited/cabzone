import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpoPushService } from '../src/modules/dispatch/application/expoPush.service.js';
import { MemoryPushTokenRepository } from '../src/modules/dispatch/infrastructure/pushToken.repository.js';
import { MemoryPushReceiptRepository } from '../src/modules/dispatch/infrastructure/pushReceipt.repository.js';

afterEach(() => vi.unstubAllGlobals());

describe('driver push tokens', () => {
  it('survives service recreation and detaches an installation when the account changes', async () => {
    const tokens = new MemoryPushTokenRepository();
    const receipts = new MemoryPushReceiptRepository();
    const send = vi.fn(async () => {});
    const first = new ExpoPushService(tokens, receipts, send);
    await first.register('first-user', 'installation-1', 'ExpoPushToken[first]');
    const restarted = new ExpoPushService(tokens, receipts, send);
    await restarted.notify(['first-user'], { title: 'Offer', body: 'Open Cabzone' });
    expect(send).toHaveBeenCalledTimes(1);

    await restarted.register('second-user', 'installation-1', 'ExpoPushToken[second]');
    await restarted.notify(['first-user'], { title: 'Offer', body: 'Open Cabzone' });
    expect(send).toHaveBeenCalledTimes(1);
    await restarted.notify(['second-user'], { title: 'Offer', body: 'Open Cabzone' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('removes a device token when Expo reports DeviceNotRegistered in a receipt', async () => {
    const tokens = new MemoryPushTokenRepository();
    const receipts = new MemoryPushReceiptRepository();
    const push = new ExpoPushService(
      tokens,
      receipts,
      async () => [{ status: 'ok', id: 'ticket-1' }],
      async () => ({ 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
    );
    await push.register('driver', 'installation-1', 'ExpoPushToken[device]');
    await push.notify(['driver'], { title: 'Offer', body: 'Open Cabzone' });
    expect(await tokens.list(['driver'])).toHaveLength(1);
    await push.checkReceipts(new Date(Date.now() + 16 * 60_000));
    expect(await tokens.list(['driver'])).toEqual([]);
  });

  it('retries a transient Expo response before recording the ticket', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ status: 'ok', id: 'ticket-2' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const tokens = new MemoryPushTokenRepository();
    const receipts = new MemoryPushReceiptRepository();
    const push = new ExpoPushService(tokens, receipts);
    await push.register('driver', 'installation-1', 'ExpoPushToken[device]');
    await push.notify(['driver'], { title: 'Offer', body: 'Open Cabzone' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await receipts.due(new Date(Date.now() + 16 * 60_000), 10)).toEqual([
      { id: 'ticket-2', token: 'ExpoPushToken[device]' },
    ]);
  });
});
