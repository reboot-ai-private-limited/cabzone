import type { WalletOperationDto } from '@cabzone/contracts';

export interface WalletRechargeTicketPort {
  issue(operationId: string, driverId: string): Promise<string>;
  read(ticket: string): Promise<{ operationId: string; driverId: string }>;
}

export interface BankDestination {
  accountNumber: string;
  ifsc: string;
  accountHolderName: string;
}

export type CashoutDestination =
  | { type: 'UPI'; upiId: string }
  | ({ type: 'BANK' } & BankDestination);

export interface WalletOperation extends Omit<WalletOperationDto, 'createdAt' | 'updatedAt'> {
  /** Full bank details are kept server-side for payout retries; the API only exposes a masked label. */
  destinationBank?: BankDestination | null;
  idempotencyKey: string;
  orderId: string | null;
  providerPaymentId: string | null;
  resolvedBy: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletOperationRepository {
  find(id: string): Promise<WalletOperation | null>;
  findByKey(key: string): Promise<WalletOperation | null>;
  findByOrderId(orderId: string): Promise<WalletOperation | null>;
  save(operation: WalletOperation): Promise<WalletOperation>;
  list(
    driverId?: string,
    kind?: WalletOperation['kind'],
    status?: WalletOperation['status'],
  ): Promise<WalletOperation[]>;
}

export interface WalletPaymentGateway {
  readonly keyId: string;
  readonly live: boolean;
  createOrder(
    amountPaise: number,
    reference: string,
    purpose: 'wallet_recharge' | 'wallet_recharge_test',
  ): Promise<string>;
  findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null>;
}

export type ProviderPayoutStatus =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'processed'
  | 'cancelled'
  | 'rejected'
  | 'failed'
  | 'reversed';

export interface ProviderPayout {
  payoutId: string;
  status: ProviderPayoutStatus;
  utr: string | null;
  failureReason: string | null;
}

/** The provider definitively refused the payout; nothing was sent, so funds can be returned. */
export class PayoutRejectedError extends Error {}

/** Sends money out of the platform to a driver's UPI ID (RazorpayX Payouts). */
export interface WalletPayoutGateway {
  /** Must be idempotent on `operationId`: retrying never creates a second payout. */
  createPayout(input: {
    operationId: string;
    amountPaise: number;
    destination: CashoutDestination;
    driverId: string;
    name: string;
    phone: string | null;
  }): Promise<ProviderPayout>;
  fetchPayout(payoutId: string): Promise<ProviderPayout>;
}
