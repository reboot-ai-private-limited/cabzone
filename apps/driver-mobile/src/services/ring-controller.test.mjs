import test from 'node:test';
import assert from 'node:assert/strict';
import { RING_MAX_MS, createRingController, ringDurationMs } from './ring-controller.ts';

function harness(startMs = 1_000_000) {
  let nowMs = startMs;
  const timers = new Map();
  let nextId = 1;
  const log = [];
  const player = {
    play: () => log.push('play'),
    pause: () => log.push('pause'),
  };
  const controller = createRingController({
    createPlayer: () => player,
    vibrate: (pattern) => log.push(pattern ? 'vibrate' : 'vibrate-cancel'),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: nowMs + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    now: () => nowMs,
  });
  return {
    controller,
    log,
    advance: (ms) => {
      nowMs += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= nowMs) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    nowMs: () => nowMs,
  };
}

test('ringDurationMs caps at 30s and respects the answer deadline', () => {
  const now = 1_000_000;
  assert.equal(ringDurationMs(now, null), RING_MAX_MS);
  assert.equal(ringDurationMs(now, now + 120_000), RING_MAX_MS);
  assert.equal(ringDurationMs(now, now + 12_000), 12_000);
  assert.equal(ringDurationMs(now, new Date(now + 5_000).toISOString()), 5_000);
  assert.equal(ringDurationMs(now, now - 1), 0);
  assert.equal(ringDurationMs(now, 'not-a-date'), RING_MAX_MS);
});

test('rings until the cap, then stops by itself', () => {
  const h = harness();
  const ends = [];
  h.controller.start({ id: 'offer-1', priority: 1, onEnd: (r) => ends.push(r) });
  assert.deepEqual(h.log, ['play', 'vibrate']);
  assert.equal(h.controller.isRinging('offer-1'), true);

  h.advance(29_999);
  assert.equal(h.controller.isRinging('offer-1'), true);
  h.advance(1);
  assert.equal(h.controller.isRinging(), false);
  assert.deepEqual(ends, ['timeout']);
  assert.deepEqual(h.log.slice(-2), ['pause', 'vibrate-cancel']);
});

test('stops at the offer expiry when that is sooner than 30s', () => {
  const h = harness();
  h.controller.start({ id: 'offer-2', priority: 1, until: h.nowMs() + 10_000 });
  h.advance(9_999);
  assert.equal(h.controller.isRinging('offer-2'), true);
  h.advance(1);
  assert.equal(h.controller.isRinging(), false);
});

test('does not ring for an offer that has already expired', () => {
  const h = harness();
  const stop = h.controller.start({ id: 'old', priority: 1, until: h.nowMs() - 1 });
  assert.equal(h.controller.isRinging(), false);
  assert.deepEqual(h.log, []);
  stop();
});

test('accept or ignore stops the ring immediately and the stop is idempotent', () => {
  const h = harness();
  const ends = [];
  const stop = h.controller.start({ id: 'offer-3', priority: 1, onEnd: (r) => ends.push(r) });
  stop();
  stop();
  h.controller.stop('offer-3');
  assert.equal(h.controller.isRinging(), false);
  assert.deepEqual(ends, ['stopped']);
  assert.equal(h.log.filter((l) => l === 'pause').length, 1);
  h.advance(60_000);
  assert.deepEqual(ends, ['stopped']);
});

test('the same id is not restarted, and stop(id) ignores other ids', () => {
  const h = harness();
  h.controller.start({ id: 'offer-4', priority: 1 });
  h.controller.start({ id: 'offer-4', priority: 1 });
  assert.equal(h.log.filter((l) => l === 'play').length, 1);
  h.controller.stop('someone-else');
  assert.equal(h.controller.isRinging('offer-4'), true);
});

test('a call preempts an offer ring, and an offer never interrupts a call', () => {
  const h = harness();
  const offerEnds = [];
  h.controller.start({ id: 'offer-5', priority: 1, onEnd: (r) => offerEnds.push(r) });
  h.controller.start({ id: 'call-1', priority: 2 });
  assert.deepEqual(offerEnds, ['preempted']);
  assert.equal(h.controller.isRinging('call-1'), true);

  const lateStop = h.controller.start({ id: 'offer-6', priority: 1 });
  assert.equal(h.controller.isRinging('offer-6'), false);
  assert.equal(h.controller.isRinging('call-1'), true);
  lateStop();
  assert.equal(h.controller.isRinging('call-1'), true);
});

test('a failing audio stack does not break the flow', () => {
  const controller = createRingController({
    createPlayer: () => {
      throw new Error('native audio missing');
    },
    vibrate: () => {},
    setTimer: () => 1,
    clearTimer: () => {},
    now: () => 0,
  });
  const stop = controller.start({ id: 'x', priority: 1 });
  assert.equal(controller.isRinging('x'), true);
  stop();
  assert.equal(controller.isRinging(), false);
});
