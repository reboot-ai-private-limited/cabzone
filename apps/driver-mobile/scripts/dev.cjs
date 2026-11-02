#!/usr/bin/env node
const { spawn } = require('node:child_process');

const rawArgs = process.argv.slice(2);
const enablePush = rawArgs.includes('--push');
const expoArgs = rawArgs.filter((arg) => arg !== '--push');

const hasPort = expoArgs.some((arg) => arg === '--port' || arg === '-p' || arg.startsWith('--port='));
const portArgs = hasPort ? [] : ['--port', '8081'];

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'start', ...(enablePush ? ['--dev-client'] : []), ...portArgs, ...expoArgs],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(enablePush ? { EXPO_USE_PUSH: '1' } : {}),
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
