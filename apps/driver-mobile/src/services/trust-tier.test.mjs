import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('./trust-tier.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { exports: mod.exports, require: () => ({}) });
const { trustTierLabel } = mod.exports;

test('trust tier is shown as wording, never as a number (D-048)', () => {
  assert.equal(trustTierLabel('EXCELLENT'), 'Excellent');
  assert.equal(trustTierLabel('GOOD'), 'Good');
  assert.equal(trustTierLabel('FAIR'), 'Fair');
  assert.equal(trustTierLabel('POOR'), 'Low');
});

test('a missing tier means the score is not public yet, so nothing is shown', () => {
  assert.equal(trustTierLabel(null), null);
  assert.equal(trustTierLabel(undefined), null);
  assert.equal(trustTierLabel('UNRATED'), null);
});
