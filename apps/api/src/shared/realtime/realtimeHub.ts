import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { AuthContext } from '@cabzone/contracts';
import { newUuid } from '../ids.js';
import { logger } from '../logging/logger.js';
import type { RealtimeEnvelope, RealtimePublisherPort } from './realtime.port.js';
import type { Redis } from 'ioredis';

export type VerifyToken = (token: string) => Promise<AuthContext>;

export const WS_PATH = '/ws';
const HEARTBEAT_MS = 30_000;
const SHARED_CHANNEL = 'cabzone:realtime';
const socketLeaseKey = (userId: string) => `cabzone:realtime:sockets:${userId}`;

/**
 * In-process WebSocket hub keyed by user id. One user may hold several sockets (multiple devices).
 * Multi-instance deployments need a Redis pub/sub fan-out in front of this.
 */
export class RealtimeHub implements RealtimePublisherPort {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly socketIds = new Map<WebSocket, string>();
  private heartbeat: NodeJS.Timeout | undefined;
  private readonly instanceId = newUuid();
  private publisher: Redis | undefined;
  private subscriber: Redis | undefined;

  async enableSharedDelivery(redis: Redis): Promise<void> {
    if (this.subscriber) return;
    this.publisher = redis;
    this.subscriber = redis.duplicate();
    this.subscriber.on('error', (err: Error) => logger.warn({ message: err.message }, 'realtime subscriber error'));
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as { origin: string; userId: string; envelope: RealtimeEnvelope };
        if (message.origin !== this.instanceId && typeof message.userId === 'string' && typeof message.envelope?.event === 'string') {
          this.deliver(message.userId, message.envelope);
        }
      } catch { logger.warn('invalid realtime message'); }
    });
    await this.subscriber.subscribe(SHARED_CHANNEL);
  }

  /** Attach to an HTTP server. Clients authenticate during the upgrade (Authorization header or ?access_token=). */
  attach(server: Server, verify: VerifyToken): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== WS_PATH) {
        socket.destroy();
        return;
      }

      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ')
        ? header.slice(7).trim()
        : (url.searchParams.get('access_token') ?? '');

      verify(token)
        .then((auth) => {
          this.wss.handleUpgrade(req, socket, head, (ws) => this.register(ws, auth));
        })
        .catch(() => {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
        });
    });

    this.heartbeat = setInterval(() => {
      for (const [userId, set] of this.sockets) {
        for (const ws of set) {
          if ((ws as WebSocket & { alive?: boolean }).alive === false) {
            ws.terminate();
            continue;
          }
          (ws as WebSocket & { alive?: boolean }).alive = false;
          ws.ping();
          this.refreshSocketLease(userId, ws);
        }
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private register(ws: WebSocket, auth: AuthContext): void {
    const tagged = ws as WebSocket & { alive?: boolean };
    tagged.alive = true;
    ws.on('pong', () => {
      tagged.alive = true;
    });

    let set = this.sockets.get(auth.userId);
    if (!set) {
      set = new Set();
      this.sockets.set(auth.userId, set);
    }
    set.add(ws);
    this.socketIds.set(ws, newUuid());
    this.refreshSocketLease(auth.userId, ws);

    ws.on('message', (raw) => {
      // Clients only send pings; everything transactional goes through REST (contracts §12).
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string };
        if (msg.event === 'ping') this.send(ws, 'pong', {});
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', () => {
      set.delete(ws);
      if (set.size === 0) this.sockets.delete(auth.userId);
      const socketId = this.socketIds.get(ws);
      this.socketIds.delete(ws);
      if (socketId && this.publisher) {
        void this.publisher.zrem(socketLeaseKey(auth.userId), socketId)
          .catch((err: unknown) => logger.warn({ err: String(err) }, 'socket lease removal failed'));
      }
    });
    ws.on('error', (err) => logger.debug({ err: String(err) }, 'ws error'));

    this.send(ws, 'connection.ready', { userId: auth.userId, role: auth.role });
  }

  private send(ws: WebSocket, event: string, data: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const envelope: RealtimeEnvelope = {
      event,
      eventId: newUuid(),
      timestamp: new Date().toISOString(),
      data,
    };
    ws.send(JSON.stringify(envelope));
  }

  publishToUser(userId: string, event: string, data: unknown): void {
    const envelope: RealtimeEnvelope = { event, eventId: newUuid(), timestamp: new Date().toISOString(), data };
    this.deliver(userId, envelope);
    if (this.publisher) {
      void this.publisher.publish(SHARED_CHANNEL, JSON.stringify({ origin: this.instanceId, userId, envelope }))
        .catch((err: unknown) => logger.warn({ err: String(err) }, 'realtime publish failed'));
    }
  }

  private deliver(userId: string, envelope: RealtimeEnvelope): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    const payload = JSON.stringify(envelope);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 1_000_000) { ws.terminate(); continue; }
        ws.send(payload);
      }
    }
  }

  private refreshSocketLease(userId: string, ws: WebSocket): void {
    const socketId = this.socketIds.get(ws);
    if (!socketId || !this.publisher || ws.readyState !== WebSocket.OPEN) return;
    const key = socketLeaseKey(userId);
    void this.publisher.multi().zadd(key, Date.now() + HEARTBEAT_MS * 2, socketId)
      .expire(key, Math.ceil(HEARTBEAT_MS * 3 / 1000)).exec()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'socket lease refresh failed'));
  }

  async isConnected(userId: string): Promise<boolean> {
    if ((this.sockets.get(userId)?.size ?? 0) > 0) return true;
    if (!this.publisher) return false;
    try {
      return (await this.publisher.zcount(socketLeaseKey(userId), Date.now(), '+inf')) > 0;
    } catch {
      // shortcut: duplicate push is preferable to missing a background alert when Redis is down.
      return false;
    }
  }

  close(): void {
    this.subscriber?.disconnect();
    this.subscriber = undefined;
    this.publisher = undefined;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.sockets.values()) for (const ws of set) ws.terminate();
    this.sockets.clear();
    this.wss.close();
  }
}
