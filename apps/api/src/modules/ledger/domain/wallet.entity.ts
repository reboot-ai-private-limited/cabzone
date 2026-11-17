import {
  MIN_DRIVER_WALLET_BALANCE_PAISE,
  type WalletOwnerType,
  type WalletStatus,
  type WalletTransactionType,
} from '@cabzone/contracts';

export interface WalletEntity {
  id: string;
  ownerType?: WalletOwnerType | undefined;
  driverId: string;
  riderId?: string | null | undefined;
  balancePaise: number;
  earningsBalancePaise?: number | undefined;
  owedPaise?: number | undefined;
  status: WalletStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function isWalletActive(wallet: WalletEntity): boolean {
  return wallet.status === 'ACTIVE';
}

/**
 * Driver must keep at least ₹50 (MIN_DRIVER_WALLET_BALANCE_PAISE) to receive new ride dispatches.
 * Below that the driver is blocked until they recharge (extends D-008 / D-036).
 */
export function isDriverEligibleForNewRides(
  wallet: WalletEntity,
  minBalancePaise: number = MIN_DRIVER_WALLET_BALANCE_PAISE,
): boolean {
  return wallet.status === 'ACTIVE' && wallet.balancePaise >= minBalancePaise;
}

export function calculateNewBalance(
  currentBalance: number,
  amountPaise: number,
  type: WalletTransactionType,
): number {
  switch (type) {
    case 'CREDIT':
    case 'REVERSAL':
      return currentBalance + amountPaise;
    case 'DEBIT':
    case 'ADJUSTMENT':
      return currentBalance - amountPaise;
  }
}

/**
 * Returns unpaid rider arrears in integer paise from a RIDER wallet (D-044).
 * Arrears are represented as a negative `balancePaise` mirrored onto `owedPaise`.
 */
export function getRiderUnpaidArrearsPaise(
  wallet: WalletEntity | null | undefined,
): number {
  if (!wallet) return 0;
  return wallet.balancePaise < 0 ? -wallet.balancePaise : Math.max(0, wallet.owedPaise ?? 0);
}
