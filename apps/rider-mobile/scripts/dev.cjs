const { spawn } = require('node:child_process');
const { getIpAddressAsync } = require('@expo/cli/build/src/utils/ip');
const { printQRCode } = require('@expo/cli/build/src/utils/qr');

const port = Number(process.env.EXPO_PORT || 8082);
const expo = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--lan', '--port', String(port)], {
  stdio: ['inherit', 'pipe', 'inherit'],
});

let output = '';
let printed = false;
expo.stdout.on('data', (chunk) => {
  const message = chunk.toString();
  process.stdout.write(message);
  output = (output + message).slice(-100);
  if (printed || !output.includes(`Waiting on http://localhost:${port}`)) return;
  printed = true;
  void getIpAddressAsync().then((address) => {
    if (address === '127.0.0.1') throw new Error('No LAN address found for the Expo QR code.');
    const url = `exp://${address}:${port}`;
    printQRCode(url).print();
    console.log(`Expo Go (Cabzone Rider): ${url}`);
  }).catch((error) => console.error(error.message));
});

expo.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
expo.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => expo.kill(signal));
}
