'use client';

import { useQuery } from '@tanstack/react-query';
import { walletsApi, type AdjustWalletBody, type WalletViewDto } from '@/lib/api/endpoints/wallets';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export const isUuid = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function useWallet(driverId: string | null) {
  return useQuery({
    ...authedQueryOptions<WalletViewDto>({
      queryKey: keys.wallets.detail(driverId ?? ''),
      fetch: (token, signal) => walletsApi.get(driverId ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: driverId !== null && isUuid(driverId),
  });
}

export function useAdjustWallet(onDone?: () => void) {
  return useApiMutation<AdjustWalletBody, unknown>({
    call: (token, body) => walletsApi.adjust(body, token),
    invalidates: [keys.wallets.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
