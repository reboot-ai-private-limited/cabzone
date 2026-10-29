export type LedgerViewState = 'loading' | 'error' | 'empty' | 'table';

/**
 * Appends older ledger pages without duplicating entries if new ledger rows
 * were inserted between offset requests.
 */
export function mergeUniqueTransactions<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  if (existing.length === 0) {
    const seen = new Set<string>();
    const deduped: T[] = [];
    for (const item of incoming) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduped.push(item);
      }
    }
    return deduped;
  }

  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Ensures failed or in-flight ledger queries never masquerade as "0 entries".
 */
export function resolveLedgerViewState(opts: {
  itemCount: number;
  isLoading: boolean;
  isError: boolean;
}): LedgerViewState {
  if (opts.itemCount > 0) return 'table';
  if (opts.isLoading) return 'loading';
  if (opts.isError) return 'error';
  return 'empty';
}

/**
 * Ensures pending or failed wallet requests never fabricate a ₹0.00 balance.
 * A successfully fetched null wallet (uninitialized driver wallet) resolves to 0.
 */
export function resolveWalletBalanceState(opts: {
  isPending: boolean;
  isError: boolean;
  balancePaise: number | null | undefined;
}):
  | { status: 'loading'; balancePaise: null }
  | { status: 'error'; balancePaise: null }
  | { status: 'ready'; balancePaise: number } {
  if (opts.isPending) return { status: 'loading', balancePaise: null };
  if (opts.isError) return { status: 'error', balancePaise: null };
  return { status: 'ready', balancePaise: opts.balancePaise ?? 0 };
}
