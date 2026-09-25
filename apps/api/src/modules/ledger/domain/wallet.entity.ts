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
 * Driver must maintain a strictly positive balance (> 0) to receive new ride dispatches.
 * Per Decision D-008 and D-036: Zero or negative balance blocks new dispatches.
 */
export function isDriverEligibleForNewRides(
  wallet: WalletEntity,
  minBalancePaise: number = 0,
): boolean {
  return wallet.status === 'ACTIVE' && wallet.balancePaise > minBalancePaise;
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
