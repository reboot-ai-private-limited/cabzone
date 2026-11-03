/**
 * Ring session logic for incoming ride offers and in-app calls.
 *
 * Pure and dependency-injected so the timing rules can be tested with `node --test`.
 * The React Native wiring (expo-audio, Vibration) lives in `ringtone.ts`.
 */

/** A ring never lasts longer than this, even if the offer or call is still pending. */
export const RING_MAX_MS = 30_000;

export interface RingPlayer {
  play(): void;
  pause(): void;
}

/** Which loop to play: the incoming ring or the ringback the caller hears. */
export type RingSound = 'ring' | 'ringback';

export interface RingDeps {
  createPlayer: (sound: RingSound) => RingPlayer | null;
  /** Start (pattern) or cancel (null) a repeating vibration. */
  vibrate: (pattern: readonly number[] | null) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
}

export type RingEndReason = 'stopped' | 'timeout' | 'preempted';

export interface RingRequest {
  /** Unique per thing that rings (ride id for offers, call id for calls). */
  id: string;
  /** Higher priority preempts lower; a lower priority never interrupts a higher one. */
  priority: number;
  /** Defaults to the incoming ring. */
  sound?: RingSound | undefined;
  /** Defaults to true for the incoming ring and false for ringback. */
  vibrate?: boolean | undefined;
  /** When the offer/call stops being answerable. The ring stops no later than this. */
  until?: string | number | null | undefined;
  maxMs?: number | undefined;
  onEnd?: ((reason: RingEndReason) => void) | undefined;
}

/** Ring duration: the shorter of the cap and the time left until `until`; 0 means do not ring. */
export function ringDurationMs(
  nowMs: number,
  until: string | number | null | undefined,
  maxMs: number = RING_MAX_MS,
): number {
  if (until === null || until === undefined || until === '') return Math.max(0, maxMs);
  const untilMs = typeof until === 'number' ? until : Date.parse(until);
  if (!Number.isFinite(untilMs)) return Math.max(0, maxMs);
  return Math.max(0, Math.min(maxMs, untilMs - nowMs));
}

interface Session {
  id: string;
  priority: number;
  sound: RingSound;
  vibrates: boolean;
  timer: unknown;
  onEnd: ((reason: RingEndReason) => void) | undefined;
}

export function createRingController(deps: RingDeps) {
  let current: Session | null = null;
  const players = new Map<RingSound, RingPlayer | null>();

  const getPlayer = (sound: RingSound): RingPlayer | null => {
    if (!players.has(sound)) {
      try {
        players.set(sound, deps.createPlayer(sound));
      } catch {
        players.set(sound, null);
      }
    }
    return players.get(sound) ?? null;
  };

  const finish = (session: Session, reason: RingEndReason) => {
    if (current !== session) return;
    current = null;
    deps.clearTimer(session.timer);
    try {
      getPlayer(session.sound)?.pause();
    } catch {
      // A failing audio stack must never break the offer or call flow.
    }
    if (session.vibrates) deps.vibrate(null);
    session.onEnd?.(reason);
  };

  return {
    /** Starts ringing. Returns an idempotent stop function for this request. */
    start(request: RingRequest): () => void {
      const noop = () => {};
      if (current?.id === request.id) {
        const existing = current;
        return () => finish(existing, 'stopped');
      }
      if (current && current.priority > request.priority) return noop;

      const duration = ringDurationMs(deps.now(), request.until, request.maxMs);
      if (duration <= 0) return noop;

      if (current) finish(current, 'preempted');

      const session: Session = {
        id: request.id,
        priority: request.priority,
        sound: request.sound ?? 'ring',
        vibrates: request.vibrate ?? (request.sound ?? 'ring') !== 'ringback',
        timer: undefined,
        onEnd: request.onEnd,
      };
      current = session;
      session.timer = deps.setTimer(() => finish(session, 'timeout'), duration);
      try {
        getPlayer(session.sound)?.play();
      } catch {
        // Keep vibrating even if audio fails to start.
      }
      if (session.vibrates) deps.vibrate([0, 700, 500]);
      return () => finish(session, 'stopped');
    },

    /** Stops the ring for `id` (or whatever is ringing when `id` is omitted). */
    stop(id?: string): void {
      if (current && (id === undefined || current.id === id)) finish(current, 'stopped');
    },

    isRinging(id?: string): boolean {
      return current !== null && (id === undefined || current.id === id);
    },
  };
}

export type RingController = ReturnType<typeof createRingController>;
