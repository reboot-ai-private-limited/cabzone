import { RealtimeHub } from './realtimeHub.js';

export * from './realtime.port.js';
export { RealtimeHub, WS_PATH, type VerifyToken } from './realtimeHub.js';

let hub: RealtimeHub | undefined;

/** Process-wide hub: the composition root publishes through it, server.ts attaches it to the HTTP server. */
export function getRealtimeHub(): RealtimeHub {
  hub ??= new RealtimeHub();
  return hub;
}
