const { spawn } = require('node:child_process');
// shortcut: Expo's private QR/IP helpers are used until its CLI prints QR codes without a TTY.
const { getIpAddressAsync } = require('@expo/cli/build/src/utils/ip');
const { printQRCode } = require('@expo/cli/build/src/utils/qr');

const usePush = process.argv.includes('--push');
if (usePush) process.env.EXPO_USE_PUSH = '1';
const port = Number(process.env.EXPO_PORT || 8081);
const args = [require.resolve('expo/bin/cli'), 'start', '--lan', '--port', String(port)];
if (usePush) args.push('--dev-client');
const expo = spawn(process.execPath, args, {
  stdio: usePush ? 'inherit' : ['inherit', 'pipe', 'inherit'],
});

let output = '';
let printed = false;
expo.stdout?.on('data', (chunk) => {
  const message = chunk.toString();
  process.stdout.write(message);
  output = (output + message).slice(-100);
  if (printed || !output.includes(`Waiting on http://localhost:${port}`)) return;
  printed = true;
  void getIpAddressAsync()
    .then((address) => {
      if (address === '127.0.0.1') throw new Error('No LAN address found for the Expo QR code.');
      const url = `exp://${address}:${port}`;
      printQRCode(url).print();
      console.log(`Expo Go: ${url}`);
    })
    .catch((error) => console.error(error.message));
});

expo.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
expo.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => expo.kill(signal));
}
