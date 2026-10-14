import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { RealtimeHub } from '../src/shared/realtime/index.js';
import type { RealtimeEnvelope } from '../src/shared/realtime/realtime.port.js';

class RedisSubscriberFake extends EventEmitter {
  readonly channels = new Set<string>();
  disconnected = false;

  async subscribe(channel: string): Promise<number> {
    this.channels.add(channel);
    return this.channels.size;
  }

  disconnect(): void {
    this.disconnected = true;
    this.channels.clear();
    this.removeAllListeners();
  }
}

class RedisPubSubFake {
  readonly subscribers: RedisSubscriberFake[] = [];
  readonly leases = new Map<string, Map<string, number>>();

  multi() {
    let key = '';
    let member = '';
    let expiresAt = 0;
    return {
      zadd: (nextKey: string, nextExpiry: number, nextMember: string) => {
        key = nextKey; member = nextMember; expiresAt = nextExpiry;
        return { expire: () => ({ exec: async () => {
          const entries = this.leases.get(key) ?? new Map<string, number>();
          entries.set(member, expiresAt);
          this.leases.set(key, entries);
        } }) };
      },
    };
  }

  async zrem(key: string, member: string): Promise<number> {
    return this.leases.get(key)?.delete(member) ? 1 : 0;
  }

  async zcount(key: string, since: number): Promise<number> {
    return [...(this.leases.get(key)?.values() ?? [])].filter((expiry) => expiry >= since).length;
  }

  duplicate(): RedisSubscriberFake {
    const subscriber = new RedisSubscriberFake();
    this.subscribers.push(subscriber);
    return subscriber;
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscribed = this.subscribers.filter((subscriber) => subscriber.channels.has(channel));
    for (const subscriber of subscribed) subscriber.emit('message', channel, message);
    return subscribed.length;
  }
}

class WsProbe {
  readonly messages: RealtimeEnvelope[] = [];
  readonly ws: WebSocket;

  constructor(url: string, userId: string) {
    this.ws = new WebSocket(url, { headers: { Authorization: `Bearer ${userId}` } });
    this.ws.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }

  async waitFor(event: string): Promise<RealtimeEnvelope> {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const message = this.messages.find((entry) => entry.event === event);
      if (message) return message;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    throw new Error(`Timed out waiting for ${event}`);
  }
}

const hubs: RealtimeHub[] = [];
const servers: Server[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const hub of hubs.splice(0)) hub.close();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

async function setup(redis: RedisPubSubFake) {
  const hub = new RealtimeHub();
  hubs.push(hub);
  await hub.enableSharedDelivery(redis as unknown as Redis);
  const server = createServer();
  servers.push(server);
  hub.attach(server, async (userId) => ({ userId, role: 'RIDER', sessionId: 'session' }));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  const connect = async (userId: string) => {
    const probe = new WsProbe(url, userId);
    sockets.push(probe.ws);
    await probe.waitFor('connection.ready');
    return probe;
  };
  return { hub, connect };
}

describe('Realtime delivery across API instances', () => {
  it('delivers targeted events across servers once per socket and closes shared subscribers', async () => {
    const redis = new RedisPubSubFake();
    const first = await setup(redis);
    const second = await setup(redis);
    const remote = await second.connect('remote-user');
    const localShared = await first.connect('shared-user');
    const remoteShared = await second.connect('shared-user');
    const unrelated = await second.connect('other-user');
    expect(await first.hub.isConnected('remote-user')).toBe(true);

    first.hub.publishToUser('remote-user', 'ride.remote', { rideId: 'remote-ride' });
    expect(await remote.waitFor('ride.remote')).toMatchObject({ data: { rideId: 'remote-ride' } });

    first.hub.publishToUser('shared-user', 'ride.shared', { rideId: 'shared-ride' });
    const [localEvent, remoteEvent] = await Promise.all([
      localShared.waitFor('ride.shared'),
      remoteShared.waitFor('ride.shared'),
    ]);
    expect(localEvent.eventId).toBe(remoteEvent.eventId);
    expect(localEvent.eventId).toBeTruthy();
    expect(remoteEvent).toEqual(localEvent);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    expect(localShared.messages.filter((message) => message.event === 'ride.shared')).toHaveLength(
      1,
    );
    expect(remoteShared.messages.filter((message) => message.event === 'ride.shared')).toHaveLength(
      1,
    );
    expect(unrelated.messages.map((message) => message.event)).toEqual(['connection.ready']);
    expect(remote.messages.filter((message) => message.event === 'ride.shared')).toHaveLength(0);

    first.hub.close();
    second.hub.close();
    hubs.splice(0);
    expect(redis.subscribers).toHaveLength(2);
    expect(redis.subscribers.every((subscriber) => subscriber.disconnected)).toBe(true);
  });
});
