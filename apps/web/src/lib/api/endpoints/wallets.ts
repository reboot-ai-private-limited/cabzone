import type {
  FinanceStatsDto,
  ListTransactionsQueryDto,
  ListWalletsQueryDto,
  WalletLedgerReconciliationDto,
  WalletSummaryDto,
  WalletTransactionDto,
  WalletOperationDto,
} from '@cabzone/contracts';
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
  driverId?: string;
  riderId?: string;
  walletId?: string;
  amountPaise: number;
  type: 'CREDIT' | 'DEBIT';
  reason: string;
  idempotencyKey?: string;
}

export const walletsApi = {
  cashouts: (token?: string, signal?: AbortSignal) =>
    request<WalletOperationDto[]>('/v1/admin/wallets/cashouts', { method: 'GET', token, signal }),
  resolveCashout: (
    id: string,
    body: { outcome: 'PAID' | 'REJECTED'; detail: string },
    token?: string,
  ) =>
    request<WalletOperationDto>(`/v1/admin/wallets/cashouts/${id}/resolve`, {
      method: 'POST',
      body,
      token,
    }),
  reconcileLedger: (
    body: { mode?: 'AUDIT' | 'RECONCILE_PENDING_RECHARGES'; driverId?: string } = { mode: 'AUDIT' },
    token?: string,
  ) =>
    request<WalletLedgerReconciliationDto>('/v1/admin/wallets/reconcile', {
      method: 'POST',
      body,
      token,
    }),
  getStats: (token?: string, signal?: AbortSignal) =>
    request<FinanceStatsDto>('/v1/admin/wallets/stats', { method: 'GET', token, signal }),

  list: (query: ListWalletsQueryDto = {}, token?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.type) params.set('type', query.type);
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.balanceFilter) params.set('balanceFilter', query.balanceFilter);
    if (query.suspendedFilter) params.set('suspendedFilter', query.suspendedFilter);
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const qs = params.toString();
    return request<{ items: WalletSummaryDto[]; total: number }>(
      `/v1/admin/wallets${qs ? `?${qs}` : ''}`,
      { method: 'GET', token, signal },
    );
  },

  listTransactions: (
    query: ListTransactionsQueryDto = {},
    token?: string,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    if (query.walletId) params.set('walletId', query.walletId);
    if (query.driverId) params.set('driverId', query.driverId);
    if (query.riderId) params.set('riderId', query.riderId);
    if (query.ownerType) params.set('ownerType', query.ownerType);
    if (query.type) params.set('type', query.type);
    if (query.referenceType) params.set('referenceType', query.referenceType);
    if (query.search) params.set('search', query.search);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const qs = params.toString();
    return request<{ items: WalletTransactionDto[]; total: number }>(
      `/v1/admin/wallets/transactions${qs ? `?${qs}` : ''}`,
      { method: 'GET', token, signal },
    );
  },

  get: (driverId: string, token?: string, signal?: AbortSignal) =>
    request<WalletViewDto>(`/v1/admin/wallets/${driverId}`, { method: 'GET', token, signal }),

  adjust: (body: AdjustWalletBody, token?: string) =>
    request<unknown>('/v1/admin/wallets/adjustments', { method: 'POST', body, token }),
};
