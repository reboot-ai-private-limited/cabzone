#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('CBZBK1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseEncryptionKeyHex(keyHex) {
  if (typeof keyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyHex.trim())) {
    throw new Error('BACKUP_ENCRYPTION_KEY_HEX must be a 64-character hex string (256-bit key).');
  }
  if (/^([0-9a-fA-F])\1{63}$/.test(keyHex.trim())) {
    throw new Error('BACKUP_ENCRYPTION_KEY_HEX must not be a repeated single-nibble placeholder.');
  }
  return Buffer.from(keyHex.trim(), 'hex');
}

export function encryptBackupBuffer(plainBuffer, keyHex) {
  const key = parseEncryptionKeyHex(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, authTag, encrypted]);
}

export function decryptBackupBuffer(encryptedBuffer, keyHex) {
  const key = parseEncryptionKeyHex(keyHex);
  const minBytes = MAGIC.length + IV_BYTES + TAG_BYTES;
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.byteLength < minBytes) {
    throw new Error('Encrypted backup buffer is truncated or invalid.');
  }
  const header = encryptedBuffer.subarray(0, MAGIC.length);
  if (!header.equals(MAGIC)) {
    throw new Error('Encrypted backup magic header mismatch.');
  }
  const iv = encryptedBuffer.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const authTag = encryptedBuffer.subarray(
    MAGIC.length + IV_BYTES,
    MAGIC.length + IV_BYTES + TAG_BYTES,
  );
  const ciphertext = encryptedBuffer.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function buildBackupManifest({ filename, encryptedBuffer, plainByteLength, sourceDbName }) {
  return {
    version: 1,
    filename,
    sourceDbName,
    algorithm: 'aes-256-gcm',
    plainByteLength,
    encryptedByteLength: encryptedBuffer.byteLength,
    sha256: createHash('sha256').update(encryptedBuffer).digest('hex'),
    createdAt: new Date().toISOString(),
  };
}

export function extractDbNameFromMongoUri(mongoUri) {
  if (typeof mongoUri !== 'string' || !mongoUri.trim()) {
    throw new Error('MONGO_URI is required.');
  }
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/.exec(mongoUri.trim());
  const dbName = match?.[1]?.trim();
  if (!dbName) {
    throw new Error('MONGO_URI must include an explicit database name.');
  }
  return decodeURIComponent(dbName);
}

function runMongoDumpArchive(mongoUri) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stderrChunks = [];
    const child = spawn('mongodump', [`--uri=${mongoUri}`, '--archive', '--gzip'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `mongodump exited with code ${code}: ${Buffer.concat(stderrChunks).toString('utf8').slice(0, 300)}`,
          ),
        );
      }
    });
  });
}

async function notifyBackupFailure(summary) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'DATASTORE_HEALTH',
      severity: 'critical',
      owner: process.env.ALERT_OWNER ?? 'platform-ops',
      environment: process.env.NODE_ENV ?? 'production',
      summary,
      occurredAt: new Date().toISOString(),
      metadata: { job: 'backup-mongo' },
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}

async function main() {
  const mongoUri = process.env.MONGO_URI ?? '';
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY_HEX ?? '';
  const outputDir = path.resolve(process.env.BACKUP_OUTPUT_DIR ?? './backups');
  const offhostDir = process.env.BACKUP_OFFHOST_DIR
    ? path.resolve(process.env.BACKUP_OFFHOST_DIR)
    : null;

  try {
    const sourceDbName = extractDbNameFromMongoUri(mongoUri);
    parseEncryptionKeyHex(keyHex);
    await fs.mkdir(outputDir, { recursive: true });

    const archive = await runMongoDumpArchive(mongoUri);
    if (archive.byteLength === 0) {
      throw new Error('mongodump produced an empty archive.');
    }

    const encrypted = encryptBackupBuffer(archive, keyHex);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cabzone-mongo-${sourceDbName}-${stamp}.archive.gz.enc`;
    const manifestName = `${filename}.manifest.json`;
    const manifest = buildBackupManifest({
      filename,
      encryptedBuffer: encrypted,
      plainByteLength: archive.byteLength,
      sourceDbName,
    });

    await fs.writeFile(path.join(outputDir, filename), encrypted);
    await fs.writeFile(path.join(outputDir, manifestName), JSON.stringify(manifest, null, 2));

    if (offhostDir) {
      await fs.mkdir(offhostDir, { recursive: true });
      await fs.copyFile(path.join(outputDir, filename), path.join(offhostDir, filename));
      await fs.copyFile(path.join(outputDir, manifestName), path.join(offhostDir, manifestName));
    }

    console.log(
      JSON.stringify({
        ok: true,
        filename,
        sha256: manifest.sha256,
        encryptedByteLength: manifest.encryptedByteLength,
        offhostCopied: Boolean(offhostDir),
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyBackupFailure(`MongoDB encrypted backup failed: ${message.slice(0, 160)}`);
    console.error(`Backup failed: ${message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
