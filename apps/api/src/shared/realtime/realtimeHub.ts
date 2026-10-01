import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { AuthContext } from '@cabzone/contracts';
import { newUuid } from '../ids.js';
import { logger } from '../logging/logger.js';
import type { RealtimeEnvelope, RealtimePublisherPort } from './realtime.port.js';

export type VerifyToken = (token: string) => Promise<AuthContext>;

export const WS_PATH = '/ws';
const HEARTBEAT_MS = 30_000;

/**
 * In-process WebSocket hub keyed by user id. One user may hold several sockets (multiple devices).
 * Multi-instance deployments need a Redis pub/sub fan-out in front of this.
 */
export class RealtimeHub implements RealtimePublisherPort {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private heartbeat: NodeJS.Timeout | undefined;

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
      for (const set of this.sockets.values()) {
        for (const ws of set) {
          if ((ws as WebSocket & { alive?: boolean }).alive === false) {
            ws.terminate();
            continue;
          }
          (ws as WebSocket & { alive?: boolean }).alive = false;
          ws.ping();
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
    const set = this.sockets.get(userId);
    if (!set) return;
    for (const ws of set) this.send(ws, event, data);
  }

  isConnected(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.sockets.values()) for (const ws of set) ws.terminate();
    this.sockets.clear();
    this.wss.close();
  }
}
