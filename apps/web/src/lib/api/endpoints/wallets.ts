import { request } from '../client.js';

export interface WalletAdminDto {
  id: string;
  driverId: string;
  balancePaise: number;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED' | string;
  updatedAt: string;
}

export interface WalletTransactionAdminDto {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'REVERSAL' | 'ADJUSTMENT';
  amountPaise: number;
  referenceType: string;
  referenceId: string | null;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  createdBy: string | null;
  note: string | null;
  createdAt: string;
}

export interface WalletViewDto {
  wallet: WalletAdminDto | null;
  transactions: WalletTransactionAdminDto[];
}

export interface AdjustWalletBody {
  driverId: string;
  amountPaise: number;
  type: 'CREDIT' | 'DEBIT';
  reason: string;
}

export const walletsApi = {
  get: (driverId: string, token?: string, signal?: AbortSignal) =>
    request<WalletViewDto>(`/v1/admin/wallets/${driverId}`, { method: 'GET', token, signal }),

  adjust: (body: AdjustWalletBody, token?: string) =>
    request<unknown>('/v1/admin/wallets/adjustments', { method: 'POST', body, token }),
};
