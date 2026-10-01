import { createHmac } from 'node:crypto';

/**
 * Deterministic 4-digit pickup OTP. Derived (not stored) so the rider can always re-fetch it
 * after a reconnect; only its SHA-256 hash is persisted for verification.
 */
export function derivePickupOtp(secret: string, rideId: string, expiresAt: Date): string {
  const digest = createHmac('sha256', secret).update(`${rideId}:${expiresAt.toISOString()}`).digest();
  return String(1000 + (digest.readUInt32BE(0) % 9000));
}
