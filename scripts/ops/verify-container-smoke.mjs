#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const docker = async (args) => {
  const result = await execFile('docker', args, { maxBuffer: 1024 * 1024 });
  return (args[0] === 'logs' ? result.stdout + result.stderr : result.stdout).trim();
};
const marker = randomUUID();
const network = `cz-readiness-${marker.slice(0, 8)}`;
const containers = [];
const apiImage = process.argv[2] ?? 'cabzone-api:readiness-20261029';
const webImage = process.argv[3] ?? 'cabzone-web:readiness-20261029';
const secret = randomBytes(32).toString('hex');
const mongo = `${network}-mongo`;
const redis = `${network}-redis`;
const common = [
  'CLOUDINARY_CLOUD_NAME=readiness-fixture',
  'CLOUDINARY_API_KEY=readiness-fixture',
  `CLOUDINARY_API_SECRET=${secret}`,
  'NODE_ENV=stage',
  'STAGING_UNSAFE=true',
  'SMS_PROVIDER=console',
  'ROUTING_PROVIDER=haversine',
  `MONGO_URI=mongodb://${mongo}:27017/cabzone_readiness?replicaSet=rs0`,
  `REDIS_URL=redis://${redis}:6379`,
  ...['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_PEPPER', 'PAYMENT_WEBHOOK_SECRET'].map(
    (key) => `${key}=${secret}`,
  ),
];
let networkCreated = false;
async function start(name, image, args = [], env = []) {
  const id = await docker([
    'run',
    '-d',
    '--name',
    name,
    '--network',
    network,
    '--label',
    `cabzone.readiness=${marker}`,
    ...env.flatMap((value) => ['-e', value]),
    image,
    ...args,
  ]);
  assert.match(id, /^[a-f0-9]{64}$/);
  containers.push(id);
  return id;
}
async function eventually(work, label) {
  let last;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await work();
    } catch (error) {
      last = error;
      await delay(500);
    }
  }
  throw new Error(`${label} did not recover: ${last?.message}`);
}
async function http(container, port, path) {
  return JSON.parse(
    await docker([
      'exec',
      container,
      'node',
      '--input-type=module',
      '-e',
      `const r=await fetch(${JSON.stringify(`http://127.0.0.1:${port}${path}`)}); const body=await r.text(); console.log(JSON.stringify({status:r.status,body}));`,
    ]),
  );
}
try {
  await docker(['network', 'create', '--label', `cabzone.readiness=${marker}`, network]);
  networkCreated = true;
  const mongoId = await start(mongo, 'mongo:7', ['--replSet', 'rs0', '--bind_ip_all']);
  const redisId = await start(redis, 'redis:alpine');
  await eventually(
    () => docker(['exec', mongoId, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1})']),
    'Mongo startup',
  );
  await docker([
    'exec',
    mongoId,
    'mongosh',
    '--quiet',
    '--eval',
    `rs.initiate({_id:'rs0',members:[{_id:0,host:'${mongo}:27017'}]})`,
  ]);
  await eventually(async () => {
    const result = await docker([
      'exec',
      mongoId,
      'mongosh',
      '--quiet',
      '--eval',
      'print(rs.status().myState)',
    ]);
    assert.equal(result, '1');
  }, 'Mongo primary');
  const apiId = await start(`${network}-api`, apiImage, [], common);
  await eventually(async () => {
    const result = await http(apiId, 4000, '/api/health');
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.body).data.status, 'healthy');
  }, 'API readiness');
  assert.equal((await http(apiId, 4000, '/api/v1/driver/status')).status, 401);
  assert.equal(
    (await http(apiId, 4000, '/api/v1/routing/reverse-geocode?lat=26.7141&lng=88.4334')).status,
    200,
  );
  const workerId = await start(`${network}-worker`, apiImage, ['node', 'dist/worker.js'], common);
  await eventually(async () => {
    const logs = await docker(['logs', workerId]);
    assert.match(logs, /worker started/);
  }, 'Worker startup');
  const webId = await start(`${network}-web`, webImage);
  await eventually(async () => {
    assert.equal((await http(webId, 3000, '/')).status, 200);
  }, 'Web startup');
  await docker(['stop', redisId]);
  await eventually(async () => {
    assert.equal((await http(apiId, 4000, '/api/health')).status, 503);
  }, 'Redis outage readiness');
  await docker(['start', redisId]);
  await eventually(async () => {
    assert.equal((await http(apiId, 4000, '/api/health')).status, 200);
  }, 'Redis recovery');
  const closedId = await start(
    `${network}-fail-closed`,
    apiImage,
    [],
    [
      ...common.filter((v) => !v.startsWith('NODE_ENV=') && !v.startsWith('STAGING_UNSAFE=')),
      'NODE_ENV=production',
      'STAGING_UNSAFE=false',
    ],
  );
  const exit = await docker(['wait', closedId]);
  assert.notEqual(exit, '0');
  const logs = await docker(['logs', closedId]);
  assert.match(logs, /SMS_PROVIDER|real SMS|live authentication/i);
  console.log(
    JSON.stringify({
      ok: true,
      apiImage,
      webImage,
      apiHealth: 200,
      webHealth: 200,
      workerStarted: true,
      protectedRoute: 401,
      publicRoute: 200,
      redisOutage: 503,
      redisRecovery: 200,
      productionMissingSmsRejected: true,
      scope: 'isolated stage-unsafe smoke; real SMS, routing and login acceptance remain open',
    }),
  );
} catch (error) {
  for (const id of containers) {
    const [details] = JSON.parse(await docker(['inspect', id]));
    if (!details.State.Running) console.error(await docker(['logs', id]));
  }
  throw error;
} finally {
  for (const id of containers.reverse()) {
    const [details] = JSON.parse(await docker(['inspect', id]));
    assert.equal(
      details.Config.Labels['cabzone.readiness'],
      marker,
      'Refusing to remove an unowned container',
    );
    await docker(['rm', '-f', '-v', id]);
  }
  if (networkCreated) {
    const [details] = JSON.parse(await docker(['network', 'inspect', network]));
    assert.equal(details.Labels['cabzone.readiness'], marker);
    await docker(['network', 'rm', network]);
  }
}
