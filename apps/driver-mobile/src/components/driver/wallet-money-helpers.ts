export function walletAmountPaise(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [rupees, paise = ''] = text.split('.');
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10000000 ? amount : null;
}

export function walletRequestKey() {
  return `wallet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
