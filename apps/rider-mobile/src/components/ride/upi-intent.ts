import type { RideUpiIntentDto } from '@cabzone/contracts';

export function upiPaymentUrl(session: RideUpiIntentDto, platform: string): string {
  const url = new URL(session.upiUrl);
  if (
    session.testMode !== false ||
    url.protocol !== 'upi:' ||
    url.hostname !== 'pay' ||
    !url.searchParams.get('pa') ||
    !url.searchParams.get('tr') ||
    url.searchParams.get('cu') !== 'INR' ||
    url.searchParams.get('am') !== (session.amountPaise / 100).toFixed(2) ||
    !Number.isSafeInteger(session.amountPaise) ||
    session.amountPaise < 100 ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    throw new Error(
      'This payment link is unavailable or expired. Check payment status before retrying.',
    );
  }
  return platform === 'ios' ? session.upiUrl.replace('upi://', 'gpay://upi/') : session.upiUrl;
}
