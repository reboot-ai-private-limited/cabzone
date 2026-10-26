import type { RideDto, RideEventDto } from '@cabzone/contracts';
import { formatAssignedDriverSummary } from './rider-helpers';

export const receiptMoney = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function receiptTime(value: string | null): string {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : '—';
}

export function rideReceipt(ride: RideDto, events: RideEventDto[]) {
  const confirmation = events.find((event) => event.eventType === 'PAYMENT_CONFIRMED');
  const paid = !!confirmation || ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED';
  const testPayment = confirmation?.metadata.mode === 'test';
  const method = confirmation?.metadata.method;
  const driver = ride.driverId ? formatAssignedDriverSummary(ride) : null;
  if (driver && !ride.assignedDriver?.name?.trim()) driver.driverName = 'Your driver';
  const payment = testPayment
    ? 'UPI · Test payment'
    : method === 'UPI'
      ? 'UPI'
      : method === 'CASH'
        ? 'Cash'
        : paid
          ? 'Payment confirmed'
          : 'Payment not recorded';
  const started = ride.startedAt ? Date.parse(ride.startedAt) : NaN;
  const completed = ride.completedAt ? Date.parse(ride.completedAt) : NaN;
  const actualDuration =
    Number.isFinite(started) && Number.isFinite(completed) && completed >= started;
  const durationSeconds = actualDuration
    ? (completed - started) / 1000
    : ride.routeSnapshot.durationSeconds;
  const date = ride.completedAt || ride.cancelledAt || ride.createdAt;
  const status =
    ride.status === 'PAYMENT_DISPUTED'
      ? 'Payment under review'
      : ride.status === 'CANCELLED'
        ? 'Cancelled'
        : ride.status === 'EXPIRED'
          ? 'Request expired'
          : paid
            ? 'Paid'
            : 'Payment pending';
  return {
    reference: ride.id.toUpperCase(),
    date: new Date(date).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    pickup: ride.pickup.address?.trim() || 'Pickup location',
    drop: ride.drop.address?.trim() || 'Destination',
    pickupTime: receiptTime(ride.startedAt),
    dropTime: receiptTime(ride.completedAt),
    duration:
      Number.isFinite(durationSeconds) && durationSeconds >= 0
        ? `${Math.ceil(durationSeconds / 60)} min`
        : '—',
    durationLabel: actualDuration ? 'Duration' : 'Estimated duration',
    distance: `${(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km`,
    amount: receiptMoney(ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise),
    arrearsPaise: ride.arrearsPaise ?? 0,
    arrearsAmount: receiptMoney(ride.arrearsPaise ?? 0),
    totalAmount: receiptMoney(
      (ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise) +
        (ride.arrearsPaise ?? 0),
    ),
    paid,
    testPayment,
    payment,
    status,
    passenger: ride.passenger.name,
    driver,
  };
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export function receiptHtml(receipt: ReturnType<typeof rideReceipt>, logoDataUrl: string): string {
  const r = Object.fromEntries(
    Object.entries(receipt)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, escapeHtml(value as string)]),
  );
  const driver = receipt.driver;
  const row = (label: string, value: string) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cabzone trip receipt</title><style>@page{size:A4;margin:20mm}*{box-sizing:border-box}body{font:13px/1.45 system-ui,sans-serif;color:#3a2414;background:#fff;margin:0;padding:18px}header{border-bottom:2px solid #fbbf24;padding-bottom:14px;margin-bottom:16px}img{width:140px;height:auto}h1{font-size:22px;margin:12px 0 4px}p{margin:6px 0}.muted{color:#705746;font-size:13px}.test{font-weight:700;color:#b45309}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{text-align:left;vertical-align:top;padding:7px 0;border-bottom:1px solid #eee}th{width:35%;font-weight:500;color:#705746}td{text-align:right;overflow-wrap:anywhere}.route td{text-align:left;padding-left:20px}.total{font-size:20px;font-weight:800}footer{border-top:1px solid #ddd;margin-top:24px;padding-top:12px;font-size:11px;color:#705746}</style></head><body><header><img alt="Cabzone" src="${escapeHtml(logoDataUrl)}"><h1>Trip receipt</h1><p>${r.date}</p><p class="muted">Reference ${r.reference}</p></header>${receipt.testPayment ? '<p class="test">TEST PAYMENT · NO MONEY CHARGED</p>' : ''}<p>${r.status}</p><table class="route">${row('Pickup', r.pickup)}${row('Trip started', r.pickupTime)}${row('Destination', r.drop)}${row('Trip completed', r.dropTime)}</table><table>${row(r.durationLabel, r.duration)}${row('Route distance', r.distance)}${row('Passenger', r.passenger)}${driver ? row('Driver', escapeHtml(driver.driverName)) + row('Vehicle', escapeHtml(driver.vehicleLabel)) + (driver.registrationNumber ? row('Vehicle number', escapeHtml(driver.registrationNumber)) : '') : ''}${row('Payment', r.payment)}</table><table>${row(receipt.paid ? 'Recorded fare' : 'Agreed fare', r.amount)}${receipt.arrearsPaise > 0 ? row('Previous cancellation fee', r.arrearsAmount) : ''}<tr class="total"><th>${receipt.paid ? 'Total recorded' : 'Agreed total'}</th><td>${r.totalAmount || r.amount}</td></tr></table><footer>This trip receipt is a record of your ride. It is not a tax invoice. For help, contact Cabzone support from the app.</footer></body></html>`;
}
