import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadModule(relPath) {
  const code = ts.transpileModule(readFileSync(new URL(relPath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, crypto, Date, Math, Number, String, Boolean, Object });
  return exports;
}

const { newCallRequestId, formatCallDuration, isActiveRideCall, deriveCallViewMode } =
  loadModule('./ride-call.ts');

test('newCallRequestId produces unique contract-valid IDs and formatCallDuration clamps safely', () => {
  const first = newCallRequestId();
  const second = newCallRequestId();
  assert.notEqual(first, second);
  assert.ok(first.length >= 16 && first.length <= 128);
  assert.match(first, /^[A-Za-z0-9-]+$/);

  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(65.9), '01:05');
  assert.equal(formatCallDuration(-10), '00:00');
  assert.equal(formatCallDuration(Number.NaN), '00:00');
});

test('deriveCallViewMode enforces pre-media connecting state and honest failure without phone exposure', () => {
  const baseCall = {
    id: 'call-1',
    rideId: 'ride-1',
    state: 'RINGING',
    callerRole: 'DRIVER',
    ringDeadlineAt: '2026-10-30T10:00:45.000Z',
    createdAt: '2026-10-30T10:00:00.000Z',
  };

  assert.equal(
    deriveCallViewMode({
      call: baseCall,
      myRole: 'DRIVER',
      audioConnected: false,
      micDenied: false,
      terminalNotice: null,
    }),
    'outgoing',
  );
  assert.equal(
    deriveCallViewMode({
      call: baseCall,
      myRole: 'RIDER',
      audioConnected: false,
      micDenied: false,
      terminalNotice: null,
    }),
    'incoming',
  );
  assert.equal(
    deriveCallViewMode({
      call: { ...baseCall, state: 'ACCEPTED', acceptedAt: '2026-10-30T10:00:05.000Z' },
      myRole: 'DRIVER',
      audioConnected: false,
      micDenied: false,
      terminalNotice: null,
    }),
    'connecting',
  );
  assert.equal(
    deriveCallViewMode({
      call: { ...baseCall, state: 'CONNECTED', connectedAt: '2026-10-30T10:00:07.000Z' },
      myRole: 'DRIVER',
      audioConnected: true,
      micDenied: false,
      terminalNotice: null,
    }),
    'connected',
  );

  const ended = { ...baseCall, state: 'DECLINED', endedAt: '2026-10-30T10:00:10.000Z', endReason: 'DECLINED' };
  assert.equal(isActiveRideCall(ended), false);
  assert.equal(
    deriveCallViewMode({
      call: ended,
      myRole: 'DRIVER',
      audioConnected: false,
      micDenied: false,
      terminalNotice: 'Call declined. Try chat.',
    }),
    'failed',
  );
});

test('voice-bootstrap suppresses programmatic CallKeep endCall echo during acceptCall', async () => {
  const code = ts.transpileModule(
    readFileSync(new URL('./voice-bootstrap.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText;
  const exports = {};
  const fakeRequire = (id) => {
    if (id === 'react-native') {
      return { NativeModules: {}, Platform: { OS: 'android' } };
    }
    return {};
  };
  vm.runInNewContext(code, {
    exports,
    require: fakeRequire,
    Map,
    Date,
    Number,
    console,
  });

  assert.equal(exports.isProgrammaticCallKeepEnd('call-accept-1'), false);
  await exports.presentSystemIncomingCall({
    callId: 'call-accept-1',
    rideId: 'ride-accept-1',
    callerName: 'Test Rider',
  });
  assert.equal(exports.getIncomingRideIdForCall('call-accept-1'), 'ride-accept-1');

  await exports.dismissSystemIncomingCall('call-accept-1');
  assert.equal(exports.isProgrammaticCallKeepEnd('call-accept-1'), true);
});
