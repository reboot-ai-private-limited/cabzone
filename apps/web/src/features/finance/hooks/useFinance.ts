'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  FinanceStatsDto,
  ListTransactionsQueryDto,
  ListWalletsQueryDto,
  WalletSummaryDto,
  WalletTransactionDto,
} from '@cabzone/contracts';
import {
  walletsApi,
  type AdjustWalletBody,
  type WalletViewDto,
} from '@/lib/api/endpoints/wallets';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export const isUuid = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function useFinanceStats() {
  return useQuery(
    authedQueryOptions<FinanceStatsDto>({
      queryKey: keys.wallets.stats(),
      fetch: (token, signal) => walletsApi.getStats(token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useWalletsList(query: ListWalletsQueryDto = {}) {
  return useQuery(
    authedQueryOptions<{ items: WalletSummaryDto[]; total: number }>({
      queryKey: keys.wallets.list(query),
      fetch: (token, signal) => walletsApi.list(query, token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useTransactionsList(query: ListTransactionsQueryDto = {}) {
  return useQuery(
    authedQueryOptions<{ items: WalletTransactionDto[]; total: number }>({
      queryKey: keys.wallets.transactions(query),
      fetch: (token, signal) => walletsApi.listTransactions(query, token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useWalletDetail(id: string | null) {
  return useQuery({
    ...authedQueryOptions<WalletViewDto>({
      queryKey: keys.wallets.detail(id ?? ''),
      fetch: (token, signal) => walletsApi.get(id ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: id !== null && id.length > 0,
  });
}

export function useAdjustWallet(onDone?: () => void) {
  return useApiMutation<AdjustWalletBody, unknown>({
    call: (token, body) => walletsApi.adjust(body, token),
    invalidates: [keys.wallets.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
