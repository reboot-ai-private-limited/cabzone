import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./receipt-preview.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;
function screen() {
  const values = [],
    effects = [],
    calls = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const n = cursor++;
      if (!(n in values)) values[n] = initial;
      return [
        values[n],
        (value) => {
          values[n] = value;
        },
      ];
    },
    useRef(initial) {
      const n = cursor++;
      if (!(n in values)) values[n] = { current: initial };
      return values[n];
    },
    useEffect(fn) {
      effects.push(fn);
    },
  };
  const print = {
    printAsync: async (options) => calls.push(['print', options]),
    printToFileAsync: async () => ({ uri: 'file:///receipt.pdf' }),
  };
  const sharing = {
    isAvailableAsync: async () => true,
    shareAsync: async (uri, options) => calls.push(['share', uri, options]),
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Error,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native')
        return { StyleSheet: { create: (v) => v }, Platform: { OS: 'android' } };
      if (name === 'expo-print') return print;
      if (name === 'expo-sharing') return sharing;
      if (name === 'expo-asset')
        return {
          Asset: {
            fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///logo.png' }) }),
          },
        };
      if (name === 'expo-file-system')
        return {
          File: class {
            async base64() {
              return 'logo-base64';
            }
          },
        };
      if (name.includes('design-system')) return { colors: {}, spacing: {}, typography: {} };
      if (name.includes('ride-receipt'))
        return { receiptHtml: (_r, logo) => `<html><img src="${logo}"></html>` };
      if (name.endsWith('.png')) return 42;
      return {};
    },
  });
  const receipt = {};
  return {
    print,
    sharing,
    calls,
    render() {
      cursor = 0;
      return exports.ReceiptPreview({ receipt, onClose() {} });
    },
    async prepare() {
      this.render();
      effects.splice(0).forEach((fn) => fn());
      await flush();
      return this.render();
    },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const action = (tree, text) =>
  find(
    tree,
    (node) =>
      node.props.onPress &&
      !!find({ children: node.children }, (child) => child.children?.includes(text)),
  );
const flush = () => new Promise(setImmediate);

test('receipt prepares an embedded logo and shares an actual PDF', async () => {
  const s = screen();
  const tree = await s.prepare();
  action(tree, 'Share receipt').props.onPress();
  await flush();
  assert.equal(s.calls[0][0], 'share');
  assert.equal(s.calls[0][1], 'file:///receipt.pdf');
  assert.equal(s.calls[0][2].mimeType, 'application/pdf');
});

test('save PDF opens print with the prepared receipt and duplicate taps share one action', async () => {
  const s = screen();
  let finish;
  s.print.printAsync = (options) => {
    s.calls.push(['print', options]);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const tree = await s.prepare();
  action(tree, 'Save PDF').props.onPress();
  action(tree, 'Save PDF').props.onPress();
  assert.equal(s.calls.length, 1);
  assert.ok(s.calls[0][1].html.includes('data:image/png;base64,logo-base64'));
  finish();
  await flush();
  assert.equal(action(s.render(), 'Save PDF').props.disabled, false);
});

test('unavailable file sharing shows a retryable error instead of a false success', async () => {
  const s = screen();
  s.sharing.isAvailableAsync = async () => false;
  const tree = await s.prepare();
  action(tree, 'Share receipt').props.onPress();
  await flush();
  const updated = s.render();
  assert.ok(
    find(updated, (node) =>
      node.children?.includes('File sharing is unavailable on this device. Use Save PDF instead.'),
    ),
  );
  assert.equal(s.calls.length, 0);
  assert.equal(action(updated, 'Save PDF').props.disabled, false);
});
