'use client';

import { useState } from 'react';
import type { WalletOperationDto } from '@cabzone/contracts';
import { Button, Dialog, Input } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { usePendingCashouts, useResolveCashout } from '../hooks/useFinance';

export function CashoutQueue() {
  const query = usePendingCashouts();
  const mutation = useResolveCashout();
  const [decision, setDecision] = useState<{
    request: WalletOperationDto;
    outcome: 'PAID' | 'REJECTED';
  } | null>(null);
  const [detail, setDetail] = useState('');
  const choose = (request: WalletOperationDto, outcome: 'PAID' | 'REJECTED') => {
    mutation.reset();
    setDetail('');
    setDecision({ request, outcome });
  };
  return (
    <section
      className="rounded-xl border border-border bg-white p-5 space-y-4"
      aria-label="Driver cashout review"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Driver cashouts</h2>
          <p className="text-sm text-text-subtle">
            Test mode. Funds are reserved; this screen does not send money.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh cashouts
        </Button>
      </div>
      {query.isLoading ? (
        <p role="status">Loading cashout requests…</p>
      ) : query.isError ? (
        <p role="alert" className="text-red-700">
          {query.error.message}
        </p>
      ) : !query.data?.length ? (
        <p className="text-sm text-text-subtle">No pending cashouts.</p>
      ) : (
        query.data.map((entry) => (
          <div
            key={entry.id}
            className="border-t border-border pt-4 flex flex-wrap justify-between gap-4"
          >
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-text">
                {formatPaise(entry.amountPaise)} ·{' '}
                <span className="break-all">{entry.destinationUpi}</span>
              </p>
              <p className="text-sm text-text-subtle">
                Earnings {formatPaise(entry.earningsPaise)} · Recharge{' '}
                {formatPaise(entry.rechargePaise)}
              </p>
              <p className="text-xs text-text-subtle break-all">
                Driver {entry.driverId} · {new Date(entry.createdAt).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => choose(entry, 'REJECTED')}>
                Reject & return funds
              </Button>
              <Button size="sm" onClick={() => choose(entry, 'PAID')}>
                Record test transfer
              </Button>
            </div>
          </div>
        ))
      )}
      <Dialog
        open={decision !== null}
        title={
          decision?.outcome === 'PAID'
            ? 'Record completed test transfer'
            : 'Reject cashout & return funds'
        }
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDecision(null);
        }}
        className="max-w-md"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!decision || mutation.isPending || detail.trim().length < 5) return;
            mutation.mutate(
              { id: decision.request.id, outcome: decision.outcome, detail: detail.trim() },
              { onSuccess: () => setDecision(null) },
            );
          }}
        >
          <p className="text-sm text-text-subtle">
            {decision?.outcome === 'PAID'
              ? 'Record a reference only after confirming the test transfer. No payout is initiated here.'
              : 'The reserved earnings and recharge credit will be returned to the driver’s wallet.'}
          </p>
          <p className="font-semibold text-text">
            {formatPaise(decision?.request.amountPaise ?? 0)} · {decision?.request.destinationUpi}
          </p>
          <label htmlFor="cashout-detail" className="block text-sm font-medium">
            {decision?.outcome === 'PAID' ? 'Test transfer reference' : 'Reason for rejection'}
          </label>
          <Input
            id="cashout-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            minLength={5}
            maxLength={255}
            required
            disabled={mutation.isPending}
          />
          {mutation.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {mutation.error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={detail.trim().length < 5 || mutation.isPending}
              loading={mutation.isPending}
            >
              Confirm
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setDecision(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
