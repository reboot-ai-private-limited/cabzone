import type { WalletStatus, WalletTransactionType } from '@cabzone/contracts';

export interface WalletEntity {
  id: string;
  driverId: string;
  balancePaise: number;
  status: WalletStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function isWalletActive(wallet: WalletEntity): boolean {
  return wallet.status === 'ACTIVE';
}

/**
 * Driver must maintain a non-negative balance to receive new ride dispatches.
 * Per Decision D-026: Negative balance doesn't interrupt active rides, but blocks new dispatches.
 */
export function isDriverEligibleForNewRides(
  wallet: WalletEntity,
  minBalancePaise: number = 0,
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
