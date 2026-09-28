import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@Cabzone/'));

await esbuild.build({
  entryPoints: ['src/server.ts', 'src/worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist',
  sourcemap: true,
  external,
  logLevel: 'info',
});
