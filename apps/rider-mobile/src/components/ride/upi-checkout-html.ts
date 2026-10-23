import type { RideUpiCheckoutDto } from '@cabzone/contracts';

export function upiCheckoutHtml(checkout: RideUpiCheckoutDto): string {
  const options = JSON.stringify({
    key: checkout.keyId,
    order_id: checkout.orderId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    name: 'Cabzone',
    description: 'Ride fare · Test payment',
    theme: { color: '#FBBF24' },
    config: {
      display: {
        blocks: { upi: { name: 'Pay by UPI', instruments: [{ method: 'upi' }] } },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: false },
      },
    },
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px system-ui;background:#fff;color:#3a2414;padding:24px}button{background:#fbbf24;color:#3a2414;border:0;border-radius:12px;padding:16px;font:inherit}</style></head><body><p id="status" role="status">Opening secure test checkout…</p><button onclick="openCheckout()">Open UPI checkout</button><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
  function send(value){window.ReactNativeWebView.postMessage(JSON.stringify(value));}
  function openCheckout(){
    if(!window.Razorpay){document.getElementById('status').textContent='Checkout could not load. Close this screen and try again.';return;}
    var options=${options};
    options.handler=function(result){send({type:'success',orderId:result.razorpay_order_id,paymentId:result.razorpay_payment_id,signature:result.razorpay_signature});};
    options.modal={ondismiss:function(){send({type:'dismiss'});}};
    var checkout=new Razorpay(options);
    checkout.on('payment.failed',function(){send({type:'failed'});});
    checkout.open();
  }openCheckout();</script></body></html>`;
}

export function checkoutMessage(
  data: string,
):
  | { type: 'success'; orderId: string; paymentId: string; signature: string }
  | { type: 'dismiss' | 'failed' }
  | null {
  try {
    const value = JSON.parse(data);
    if (value?.type === 'dismiss' || value?.type === 'failed') return { type: value.type };
    if (
      value?.type === 'success' &&
      typeof value.orderId === 'string' &&
      /^order_[a-zA-Z0-9]+$/.test(value.orderId) &&
      typeof value.paymentId === 'string' &&
      /^pay_[a-zA-Z0-9]+$/.test(value.paymentId) &&
      typeof value.signature === 'string' &&
      /^[a-f0-9]{64}$/.test(value.signature)
    )
      return value;
    return null;
  } catch {
    return null;
  }
}
