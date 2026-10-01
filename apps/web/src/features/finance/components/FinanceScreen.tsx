'use client';

import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import type { WalletTransactionAdminDto } from '@/lib/api/endpoints/wallets';
import { formatPaise } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { isUuid, useAdjustWallet, useWallet } from '../hooks/useWallet';

const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

export function FinanceScreen() {
  const params = useFilterParams<'driverId'>();
  const driverId = params.get('driverId');
  const [draft, setDraft] = useState(driverId ?? '');
  const wallet = useWallet(driverId);

  const lookup = (e: React.FormEvent): void => {
    e.preventDefault();
    params.set({ driverId: draft.trim() || undefined });
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="Wallets & Ledger"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Wallets & Ledger' }]}
      />

      <form onSubmit={lookup} className="flex max-w-2xl items-end gap-2">
        <div className="flex flex-1 flex-col gap-1 text-xs font-semibold text-text">
          Driver ID
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste a driver ID, or open a wallet from Drivers & KYC"
            invalid={draft.trim() !== '' && !isUuid(draft.trim())}
            className="font-mono"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          icon={<Search aria-hidden className="size-4" />}
          disabled={!isUuid(draft.trim())}
        >
          Look up
        </Button>
      </form>

      {driverId === null ? (
        <EmptyState
          title="Look up a driver's wallet"
          description="Drivers need a positive balance to receive rides. Credit or debit a wallet here; every change is recorded with your name and a reason."
        />
      ) : !isUuid(driverId) ? (
        <ErrorState message="That is not a valid driver ID." />
      ) : wallet.isLoading ? (
        <Skeleton className="h-64 rounded-md" />
      ) : wallet.isError ? (
        <ErrorState
          message={wallet.error instanceof Error ? wallet.error.message : 'Could not load the wallet.'}
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <WalletView
          driverId={driverId}
          view={wallet.data ?? { wallet: null, transactions: [] }}
        />
      )}
    </div>
  );
}

function WalletView({
  driverId,
  view,
}: {
  driverId: string;
  view: { wallet: { balancePaise: number; status: string } | null; transactions: WalletTransactionAdminDto[] };
}) {
  const balance = view.wallet?.balancePaise ?? 0;
  const eligible = view.wallet !== null && view.wallet.status === 'ACTIVE' && balance > 0;

  const columns: Column<WalletTransactionAdminDto>[] = [
    {
      key: 'when',
      header: 'When',
      render: (t) => <span className="text-sm text-text-subtle">{when(t.createdAt)}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (t) => (
        <Badge tone={t.type === 'CREDIT' || t.type === 'REVERSAL' ? 'success' : 'neutral'}>
          {t.type}
        </Badge>
      ),
    },
    {
      key: 'ref',
      header: 'Reason',
      render: (t) => (
        <div className="flex flex-col">
          <span className="text-sm">{t.referenceType.replaceAll('_', ' ')}</span>
          {t.note !== null && <span className="text-xs text-text-subtle">{t.note}</span>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      align: 'right',
      render: (t) => {
        const credit = t.type === 'CREDIT' || t.type === 'REVERSAL';
        return (
          <span className={credit ? 'text-success' : 'text-text'}>
            {credit ? '+' : '−'}
            {formatPaise(t.amountPaise)}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Balance after',
      numeric: true,
      align: 'right',
      render: (t) => formatPaise(t.balanceAfterPaise),
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <StatTile
            label="Balance"
            value={formatPaise(balance)}
            tone={balance > 0 ? 'success' : 'danger'}
            hint={view.wallet === null ? 'No wallet yet — the first credit creates it' : undefined}
          />
          <StatTile
            label="Ride eligibility"
            value={eligible ? 'Can receive rides' : 'Blocked'}
            tone={eligible ? 'success' : 'warning'}
            hint="Needs an active wallet with a positive balance"
          />
        </div>
        {view.transactions.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <DataTable columns={columns} rows={view.transactions} rowKey={(t) => t.id} />
        )}
      </div>

      <AdjustForm driverId={driverId} />
    </div>
  );
}

function AdjustForm({ driverId }: { driverId: string }) {
  const amountId = useId();
  const reasonId = useId();
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [rupees, setRupees] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const adjust = useAdjustWallet(() => {
    setRupees('');
    setReason('');
    setSaved(true);
  });

  const amountPaise = Math.round(Number(rupees) * 100);
  const valid = Number.isFinite(amountPaise) && amountPaise > 0 && reason.trim().length >= 5;

  return (
    <Panel title="Adjust balance">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setError(undefined);
          setSaved(false);
          adjust.mutate(
            { driverId, type, amountPaise, reason: reason.trim() },
            {
              onError: (err) =>
                setError(err instanceof Error ? err.message : 'Could not adjust the wallet.'),
            },
          );
        }}
      >
        <div className="flex flex-col gap-1 text-xs font-semibold text-text">
          Action
          <Select
            value={type}
            onValueChange={(v) => setType(v as 'CREDIT' | 'DEBIT')}
            options={[
              { value: 'CREDIT', label: 'Credit (add money)' },
              { value: 'DEBIT', label: 'Debit (remove money)' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1 text-xs font-semibold text-text">
          <label htmlFor={amountId}>Amount (₹)</label>
          <Input
            id={amountId}
            inputMode="decimal"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            placeholder="500"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs font-semibold text-text">
          <label htmlFor={reasonId}>Reason (recorded in the ledger)</label>
          <Input
            id={reasonId}
            value={reason}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Cash top-up received at office"
          />
        </div>
        {error !== undefined && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-success">Wallet updated.</p>}
        <Button type="submit" variant="primary" loading={adjust.isPending} disabled={!valid}>
          {type === 'CREDIT' ? 'Credit wallet' : 'Debit wallet'}
        </Button>
      </form>
    </Panel>
  );
}
