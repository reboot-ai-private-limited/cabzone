import { describe, expect, it, vi } from 'vitest';
import { ExpoPushService } from '../src/modules/dispatch/application/expoPush.service.js';
import { MemoryPushTokenRepository } from '../src/modules/dispatch/infrastructure/pushToken.repository.js';
import { MemoryPushReceiptRepository } from '../src/modules/dispatch/infrastructure/pushReceipt.repository.js';

const APNS_TOKEN = 'a'.repeat(64);

function build(apns: ReturnType<typeof vi.fn>) {
  const tokens = new MemoryPushTokenRepository();
  const push = new ExpoPushService(
    tokens,
    new MemoryPushReceiptRepository(),
    vi.fn(async () => {}),
    async () => ({}),
    vi.fn(async () => []),
    apns as never,
  );
  return { tokens, push };
}

describe('direct APNs push', () => {
  it('rejects a non-hex token and accepts a 64-char hex token', async () => {
    const { push } = build(vi.fn(async () => []));
    expect(await push.register('rider', 'i1', 'not-a-token', { transport: 'APNS' })).toBe(false);
    expect(await push.register('rider', 'i1', APNS_TOKEN, { transport: 'APNS', platform: 'ios' })).toBe(true);
  });

  it('sends to APNs with the ring sound and drops an unregistered token', async () => {
    const apns = vi.fn(async () => [{ status: 'unregistered' as const }]);
    const { push, tokens } = build(apns);
    await push.register('rider', 'i1', APNS_TOKEN, { transport: 'APNS', platform: 'ios' });
    await push.notify(['rider'], {
      title: 'Incoming call',
      body: 'Tap to answer',
      channelId: 'ride-calls-ring',
      data: { type: 'ride.call.incoming' },
    });
    expect(apns).toHaveBeenCalledTimes(1);
    const sent = (apns.mock.calls[0] as unknown as [Array<{ token: string; sound: string }>])[0];
    expect(sent[0]).toMatchObject({ token: APNS_TOKEN, sound: 'ring_long.wav' });
    expect(await tokens.list(['rider'], 'APNS')).toEqual([]);
  });
});
