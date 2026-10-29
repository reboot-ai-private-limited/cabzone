#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decryptBackupBuffer, extractDbNameFromMongoUri } from './backup-mongo.mjs';

const FORBIDDEN_DBS = new Set(['admin', 'local', 'config', 'cabzone_prod', 'cabzone_stage']);

export function assertIsolatedRestoreTarget(targetDbName, activeMongoUri) {
  if (typeof targetDbName !== 'string' || !targetDbName.trim()) {
    throw new Error('Target restore database name is required.');
  }
  const normalized = targetDbName.trim();
  if (FORBIDDEN_DBS.has(normalized.toLowerCase())) {
    throw new Error(`Refusing restore into protected database "${normalized}".`);
  }
  if (!normalized.endsWith('_restore_drill')) {
    throw new Error(
      `Refusing restore into "${normalized}": isolated drill targets must end with "_restore_drill".`,
    );
  }
  if (activeMongoUri) {
    const activeDb = extractDbNameFromMongoUri(activeMongoUri);
    if (normalized.toLowerCase() === activeDb.toLowerCase()) {
      throw new Error(
        `Refusing restore: target database "${normalized}" matches active MONGO_URI database "${activeDb}".`,
      );
    }
  }
  return normalized;
}

export function verifyRestoredDataInvariants({
  wallets = [],
  walletTransactions = [],
  rides = [],
  payments = [],
}) {
  const issues = [];
  const rideIds = new Set(rides.map((r) => String(r._id ?? r.id)));

  for (const wallet of wallets) {
    const walletId = String(wallet._id ?? wallet.id);
    const txs = walletTransactions.filter((t) => String(t.walletId) === walletId);
    for (const [bucket, currentBalance] of [
      ['COMMISSION', Number(wallet.balancePaise ?? 0)],
      ['EARNINGS', Number(wallet.earningsBalancePaise ?? 0)],
    ]) {
      const bucketTxs = txs.filter((t) => (t.bucket ?? 'COMMISSION') === bucket);
      if (bucketTxs.length === 0) continue;
      for (const tx of bucketTxs) {
        const delta =
          tx.type === 'CREDIT' || tx.type === 'REVERSAL'
            ? Number(tx.amountPaise)
            : -Number(tx.amountPaise);
        if (Number(tx.balanceBeforePaise) + delta !== Number(tx.balanceAfterPaise)) {
          issues.push(`Wallet ${walletId} (${bucket}) has broken tx step on ${tx._id ?? tx.id}.`);
        }
      }
      const latest = [...bucketTxs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ).at(-1);
      if (latest && Number(latest.balanceAfterPaise) !== currentBalance) {
        issues.push(
          `Wallet ${walletId} (${bucket}) balance ${currentBalance} != closing tx ${latest.balanceAfterPaise}.`,
        );
      }
    }
  }

  for (const ride of rides) {
    const rideId = String(ride._id ?? ride.id);
    if (
      (ride.status === 'COMPLETED' || ride.status === 'SETTLED') &&
      Number(ride.agreedFarePaise ?? ride.suggestedFarePaise ?? 0) <= 0
    ) {
      issues.push(`Completed/settled ride ${rideId} has non-positive fare.`);
    }
  }

  for (const payment of payments) {
    if (payment.status === 'CONFIRMED' && !rideIds.has(String(payment.rideId))) {
      issues.push(`Confirmed payment ${payment._id ?? payment.id} references missing ride ${payment.rideId}.`);
    }
  }

  return {
    ok: issues.length === 0,
    checked: {
      wallets: wallets.length,
      walletTransactions: walletTransactions.length,
      rides: rides.length,
      payments: payments.length,
    },
    issues,
  };
}

function runMongoRestoreArchive({ mongoUri, sourceDbName, targetDbName, archiveBuffer }) {
  return new Promise((resolve, reject) => {
    const stderrChunks = [];
    const child = spawn(
      'mongorestore',
      [
        `--uri=${mongoUri}`,
        '--archive',
        '--gzip',
        '--drop',
        `--nsFrom=${sourceDbName}.*`,
        `--nsTo=${targetDbName}.*`,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `mongorestore exited with code ${code}: ${Buffer.concat(stderrChunks).toString('utf8').slice(0, 300)}`,
          ),
        );
      }
    });
    child.stdin.end(archiveBuffer);
  });
}

async function main() {
  const archivePath = process.argv[2];
  const targetDbArg = process.argv[3];
  const mongoUri = process.env.MONGO_URI ?? '';
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY_HEX ?? '';

  if (!archivePath || !targetDbArg) {
    console.error(
      'Usage: node scripts/ops/restore-mongo-drill.mjs <path-to-.archive.gz.enc> <target_db_restore_drill>',
    );
    process.exit(1);
  }

  const targetDbName = assertIsolatedRestoreTarget(targetDbArg, mongoUri);
  const resolvedArchive = path.resolve(archivePath);
  const manifestRaw = await fs.readFile(`${resolvedArchive}.manifest.json`, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const encrypted = await fs.readFile(resolvedArchive);
  const actualSha256 = createHash('sha256').update(encrypted).digest('hex');

  if (actualSha256 !== manifest.sha256) {
    throw new Error(`Backup checksum mismatch: expected ${manifest.sha256}, got ${actualSha256}`);
  }

  const plainArchive = decryptBackupBuffer(encrypted, keyHex);
  if (plainArchive.byteLength !== manifest.plainByteLength) {
    throw new Error('Decrypted archive byte length does not match manifest.');
  }

  await runMongoRestoreArchive({
    mongoUri,
    sourceDbName: manifest.sourceDbName,
    targetDbName,
    archiveBuffer: plainArchive,
  });

  console.log(
    JSON.stringify({
      ok: true,
      restoredFrom: path.basename(resolvedArchive),
      sourceDbName: manifest.sourceDbName,
      targetDbName,
      plainByteLength: plainArchive.byteLength,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
