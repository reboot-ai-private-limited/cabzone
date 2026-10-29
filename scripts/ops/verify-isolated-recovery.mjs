#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { encryptBackupBuffer, decryptBackupBuffer } from './backup-mongo.mjs';
import {
  assertIsolatedRestoreTarget,
  verifyRestoredDataInvariants,
} from './restore-mongo-drill.mjs';

function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [],
      stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(stdout))
        : reject(
            new Error(`Docker ${args[0]} failed: ${Buffer.concat(stderr).toString().slice(-1000)}`),
          ),
    );
    child.stdin.end(input);
  });
}

const marker = randomUUID();
let containerId;
const started = Date.now();
const source = 'cabzone_readiness_fixture';
const target = assertIsolatedRestoreTarget(
  `${source}_restore_drill`,
  `mongodb://localhost/${source}`,
);
try {
  containerId = (
    await docker([
      'run',
      '-d',
      '--label',
      `cabzone.recovery-drill=${marker}`,
      '--name',
      `cz-readiness-recovery-${marker.slice(0, 8)}`,
      'mongo:7',
    ])
  )
    .toString()
    .trim();
  assert.match(containerId, /^[a-f0-9]{64}$/);
  const shell = async (code) =>
    (await docker(['exec', containerId, 'mongosh', '--quiet', '--eval', code])).toString().trim();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await shell('db.adminCommand({ping:1})');
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }
  assert.ok(ready, 'Isolated Mongo did not become ready');
  await shell(`const d=db.getSiblingDB(${JSON.stringify(source)});
    d.wallets.insertOne({_id:'w1',balance_paise:1000,earnings_balance_paise:0});
    d.wallet_transactions.insertOne({_id:'t1',wallet_id:'w1',bucket:'COMMISSION',type:'CREDIT',amount_paise:1000,balance_before_paise:0,balance_after_paise:1000,created_at:new Date('2026-10-29T00:00:00Z')});
    d.rides.insertOne({_id:'r1',status:'SETTLED',agreed_fare_paise:20000});
    d.payments.insertOne({_id:'p1',ride_id:'r1',status:'CONFIRMED'});`);
  const read = async (dbName) =>
    JSON.parse(
      await shell(
        `const d=db.getSiblingDB(${JSON.stringify(dbName)}); print(JSON.stringify({wallets:d.wallets.find().toArray(),walletTransactions:d.wallet_transactions.find().toArray(),rides:d.rides.find().toArray(),payments:d.payments.find().toArray()}));`,
      ),
    );
  const original = await read(source);
  const archive = await docker([
    'exec',
    containerId,
    'mongodump',
    `--db=${source}`,
    '--archive',
    '--gzip',
  ]);
  assert.ok(archive.length > 0);
  const key = randomBytes(32).toString('hex');
  const encrypted = encryptBackupBuffer(archive, key);
  const corrupted = Buffer.from(encrypted);
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => decryptBackupBuffer(corrupted, key));
  const restoredArchive = decryptBackupBuffer(encrypted, key);
  assert.deepEqual(restoredArchive, archive);
  const restoreStarted = Date.now();
  await docker(
    [
      'exec',
      '-i',
      containerId,
      'mongorestore',
      '--archive',
      '--gzip',
      '--drop',
      `--nsFrom=${source}.*`,
      `--nsTo=${target}.*`,
    ],
    restoredArchive,
  );
  const restored = await read(target);
  assert.deepEqual(restored, original, 'Restored records differ from source');
  const report = verifyRestoredDataInvariants(restored);
  assert.equal(report.ok, true, report.issues.join('; '));
  assert.equal(
    verifyRestoredDataInvariants({
      ...restored,
      wallets: [{ ...restored.wallets[0], balance_paise: 999 }],
    }).ok,
    false,
  );
  console.log(
    JSON.stringify({
      ok: true,
      scope: 'isolated synthetic fixture; no off-host or production claim',
      checked: report.checked,
      encryptedBytes: encrypted.length,
      restoreMs: Date.now() - restoreStarted,
      elapsedMs: Date.now() - started,
      corruptedArchiveRejected: true,
    }),
  );
} finally {
  if (containerId) {
    const [details] = JSON.parse((await docker(['inspect', containerId])).toString());
    assert.equal(
      details.Config.Labels['cabzone.recovery-drill'],
      marker,
      'Refusing to remove an unowned container',
    );
    await docker(['rm', '-f', '-v', containerId]);
  }
}
