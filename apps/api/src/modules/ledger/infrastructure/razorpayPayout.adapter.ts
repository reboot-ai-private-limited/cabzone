import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import {
  PayoutRejectedError,
  type ProviderPayout,
  type ProviderPayoutStatus,
  type WalletPayoutGateway,
} from '../domain/walletOperation.port.js';

const payoutSchema = z.object({
  id: z.string().regex(/^pout_[a-zA-Z0-9]+$/),
  status: z.string(),
  utr: z.string().nullable().optional(),
  status_details: z.object({ description: z.string().nullable().optional() }).nullish(),
  failure_reason: z.string().nullable().optional(),
});

const KNOWN: readonly ProviderPayoutStatus[] = [
  'queued',
  'pending',
  'processing',
  'processed',
  'cancelled',
  'rejected',
  'failed',
  'reversed',
];

export function toProviderPayout(raw: unknown): ProviderPayout {
  const payout = payoutSchema.parse(raw);
  // An unknown in-flight status stays non-final until the provider reports a final one.
  const status = KNOWN.includes(payout.status as ProviderPayoutStatus)
    ? (payout.status as ProviderPayoutStatus)
    : 'processing';
  return {
    payoutId: payout.id,
    status,
    utr: payout.utr ?? null,
    failureReason: payout.failure_reason ?? payout.status_details?.description ?? null,
  };
}

/** RazorpayX Payouts: contact -> VPA fund account -> UPI payout, idempotent per wallet operation. */
export class RazorpayXPayoutGateway implements WalletPayoutGateway {
  constructor(
    private readonly keyId: string,
    private readonly secret: string,
    private readonly accountNumber: string,
  ) {}

  private async api(path: string, body?: object, idempotencyKey?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.secret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'X-Payout-Idempotency': idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Network failure: outcome unknown. Callers retry safely thanks to the idempotency key.
      throw AppError.badRequest('Payout provider is unreachable. It will be retried.');
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const error = (await response.json().catch(() => null)) as {
        error?: { description?: string };
      } | null;
      throw new PayoutRejectedError(error?.error?.description ?? 'Payout was rejected.');
    }
    if (!response.ok) throw AppError.badRequest('Payout provider error. It will be retried.');
    return response.json();
  }

  async createPayout(input: Parameters<WalletPayoutGateway['createPayout']>[0]) {
    const contact = z.object({ id: z.string() }).parse(
      await this.api('contacts', {
        name: input.name.slice(0, 50) || 'Cabzone driver',
        type: 'driver',
        reference_id: input.driverId,
        ...(input.phone ? { contact: input.phone } : {}),
      }),
    );
    const destination = input.destination;
    const fund = z.object({ id: z.string() }).parse(
      await this.api(
        'fund_accounts',
        destination.type === 'UPI'
          ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: destination.upiId } }
          : {
              contact_id: contact.id,
              account_type: 'bank_account',
              bank_account: {
                name: destination.accountHolderName,
                ifsc: destination.ifsc,
                account_number: destination.accountNumber,
              },
            },
      ),
    );
    return toProviderPayout(
      await this.api(
        'payouts',
        {
          account_number: this.accountNumber,
          fund_account_id: fund.id,
          amount: input.amountPaise,
          currency: 'INR',
          mode: destination.type === 'UPI' ? 'UPI' : 'IMPS',
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: input.operationId,
          narration: 'Cabzone payout',
          notes: { operationId: input.operationId, driverId: input.driverId },
        },
        input.operationId,
      ),
    );
  }

  async fetchPayout(payoutId: string) {
    if (!/^pout_[a-zA-Z0-9]+$/.test(payoutId))
      throw AppError.badRequest('A Razorpay payout ID is required.');
    return toProviderPayout(await this.api(`payouts/${encodeURIComponent(payoutId)}`));
  }
}
