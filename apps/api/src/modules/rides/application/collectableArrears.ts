import { getRiderUnpaidArrearsPaise, type WalletEntity } from '../../ledger/ledger.public.js';

/**
 * Arrears a ride may charge online: what the ride carries, capped by what the rider still owes.
 * The cash path already caps this way. Capping UPI the same way means a waived or already-settled
 * cancellation fee is never charged again. With no rider wallet the ride's own figure stands.
 */
export function collectableArrearsPaise(
  ride: { arrearsPaise?: number | undefined },
  riderWallet: WalletEntity | null | undefined,
): number {
  const raw = ride.arrearsPaise ?? 0;
  const onRide = Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
  if (!riderWallet) return onRide;
  return Math.min(onRide, getRiderUnpaidArrearsPaise(riderWallet));
}
