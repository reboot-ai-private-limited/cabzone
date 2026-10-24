import type { WalletOperationDto } from '@cabzone/contracts';

export interface WalletRechargeTicketPort {
  issue(operationId: string, driverId: string): Promise<string>;
  read(ticket: string): Promise<{ operationId: string; driverId: string }>;
}

export interface WalletOperation extends Omit<WalletOperationDto, 'createdAt' | 'updatedAt'> {
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
    purpose: 'wallet_recharge_test',
  ): Promise<string>;
  findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null>;
}
