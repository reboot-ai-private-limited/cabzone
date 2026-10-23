import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('./upi-checkout-html.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
);

test('checkout offers UPI only and preserves server order and amount', () => {
  const html = exports.upiCheckoutHtml({
    keyId: 'rzp_test_fixture',
    orderId: 'order_test',
    amountPaise: 8300,
    currency: 'INR',
    testMode: true,
  });
  const options = JSON.parse(html.match(/var options=(.*);\n/)[1]);
  assert.equal(options.order_id, 'order_test');
  assert.equal(options.amount, 8300);
  assert.equal(options.config.display.preferences.show_default_blocks, false);
  assert.deepEqual(options.config.display.blocks.upi.instruments, [{ method: 'upi' }]);
  assert.deepEqual(options.config.display.sequence, ['block.upi']);
});

test('only well-formed callback messages cross into payment verification', () => {
  assert.equal(exports.checkoutMessage('not json'), null);
  assert.equal(
    exports.checkoutMessage(
      JSON.stringify({
        type: 'success',
        orderId: 'order_test',
        paymentId: 'pay_test',
        signature: 'forged',
      }),
    ),
    null,
  );
  assert.equal(exports.checkoutMessage(JSON.stringify({ type: 'unknown' })), null);
  const proof = {
    type: 'success',
    orderId: 'order_test',
    paymentId: 'pay_test',
    signature: 'a'.repeat(64),
  };
  assert.equal(exports.checkoutMessage(JSON.stringify(proof)).paymentId, 'pay_test');
  assert.equal(exports.checkoutMessage('{"type":"dismiss"}').type, 'dismiss');
});

test('checkout forwards success proof and handles dismissal without inventing success', () => {
  const html = exports.upiCheckoutHtml({ keyId: 'rzp_test_fixture', orderId: 'order_test', amountPaise: 8300, currency: 'INR', testMode: true });
  const messages = [];
  let options;
  const Razorpay = function (value) { options = value; this.on = () => {}; this.open = () => {}; };
  vm.runInNewContext(html.match(/<script>\n([\s\S]*)<\/script>/)[1], {
    window: { Razorpay, ReactNativeWebView: { postMessage: (message) => messages.push(JSON.parse(message)) } }, Razorpay,
  });
  options.handler({ razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'a'.repeat(64) });
  options.modal.ondismiss();
  assert.equal(messages[0].type, 'success');
  assert.equal(messages[0].orderId, 'order_test');
  assert.deepEqual(messages[1], { type: 'dismiss' });
});
