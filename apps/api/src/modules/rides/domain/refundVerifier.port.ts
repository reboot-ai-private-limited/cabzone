/** Read-only provider evidence; resolving a dispute never initiates a refund. */
export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface RefundVerifierPort {
  fetchRefund(refundId: string): Promise<ProviderRefund>;
}
