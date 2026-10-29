#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export function evaluateSmokeHealth(statusCode, payload) {
  if (statusCode !== 200) {
    return { ok: false, reason: `Expected HTTP 200 from /api/health, received ${statusCode}` };
  }
  const report = payload?.data ?? payload;
  if (!report || report.status !== 'healthy') {
    return { ok: false, reason: `Health report status is "${report?.status ?? 'unknown'}"` };
  }
  const deps = Array.isArray(report.dependencies) ? report.dependencies : [];
  for (const requiredName of ['mongodb', 'redis']) {
    const dep = deps.find((item) => item.name === requiredName);
    if (!dep || dep.status !== 'up') {
      return { ok: false, reason: `Required dependency "${requiredName}" is not up` };
    }
  }
  const bullmq = deps.find((item) => item.name === 'bullmq');
  if (bullmq && bullmq.status !== 'up') {
    return { ok: false, reason: 'Dependency "bullmq" is down' };
  }
  return { ok: true, reason: 'all_healthy' };
}

export function buildRollbackPlan({
  composeFile = 'docker-compose.prod.yml',
  envFile = '.env.prod',
  previousTag,
}) {
  if (!previousTag || typeof previousTag !== 'string' || !/^[A-Za-z0-9._-]+$/.test(previousTag)) {
    throw new Error('A valid immutable previous image tag is required for rollback.');
  }
  return {
    previousTag,
    commands: [
      `IMAGE_TAG=${previousTag} docker compose --env-file ${envFile} -f ${composeFile} up -d --no-build api worker web`,
      `docker compose --env-file ${envFile} -f ${composeFile} ps`,
    ],
  };
}

async function main() {
  const apiBase = (process.env.SMOKE_API_BASE_URL ?? 'http://127.0.0.1:4000/api').replace(/\/$/, '');
  const webBase = (process.env.SMOKE_WEB_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const rollbackTag = process.env.ROLLBACK_IMAGE_TAG;

  try {
    const healthRes = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(8_000) });
    const healthBody = await healthRes.json().catch(() => null);
    const verdict = evaluateSmokeHealth(healthRes.status, healthBody);
    if (!verdict.ok) {
      throw new Error(verdict.reason);
    }

    const webRes = await fetch(`${webBase}/login`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (webRes.status >= 400) {
      throw new Error(`Admin web /login returned HTTP ${webRes.status}`);
    }

    console.log(JSON.stringify({ ok: true, apiHealth: verdict.reason, webStatus: webRes.status }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const plan = rollbackTag
      ? buildRollbackPlan({
          composeFile: process.env.COMPOSE_FILE ?? 'docker-compose.prod.yml',
          envFile: process.env.ENV_FILE ?? '.env.prod',
          previousTag: rollbackTag,
        })
      : null;

    if (process.env.ALERT_WEBHOOK_URL) {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'API_5XX',
          severity: 'critical',
          owner: process.env.ALERT_OWNER ?? 'platform-ops',
          environment: process.env.NODE_ENV ?? 'production',
          summary: `Deployment smoke check failed: ${reason.slice(0, 160)}`,
          occurredAt: new Date().toISOString(),
          metadata: { rollbackTag: rollbackTag ?? null },
        }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
    }

    console.error(JSON.stringify({ ok: false, reason, rollbackPlan: plan }));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
