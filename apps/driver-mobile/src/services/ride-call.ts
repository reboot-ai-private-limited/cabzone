import type { RideCallDto } from '@cabzone/contracts';

export type CallViewMode =
  | 'idle'
  | 'incoming'
  | 'outgoing'
  | 'connecting'
  | 'connected'
  | 'mic_denied'
  | 'failed';

export function newCallRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (typeof randomUuid === 'string' && randomUuid.length >= 16) {
    return `call-${randomUuid}`;
  }
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').padEnd(10, '0').slice(0, 10);
  return `call-${Date.now()}-${rand}`;
}

export function formatCallDuration(elapsedSeconds: number): string {
  const clamped = Math.max(0, Math.floor(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function isActiveRideCall(call: RideCallDto | null | undefined): call is RideCallDto {
  return Boolean(
    call &&
      (call.state === 'RINGING' || call.state === 'ACCEPTED' || call.state === 'CONNECTED'),
  );
}

export function deriveCallViewMode(input: {
  call: RideCallDto | null;
  myRole: 'RIDER' | 'DRIVER';
  audioConnected: boolean;
  micDenied: boolean;
  terminalNotice: string | null;
}): CallViewMode {
  if (input.micDenied) return 'mic_denied';
  const { call } = input;
  if (isActiveRideCall(call)) {
    if (call.state === 'RINGING') {
      return call.callerRole === input.myRole ? 'outgoing' : 'incoming';
    }
    if (call.state === 'CONNECTED' || input.audioConnected || Boolean(call.connectedAt)) {
      return 'connected';
    }
    return 'connecting';
  }
  if (input.terminalNotice) return 'failed';
  return 'idle';
}
