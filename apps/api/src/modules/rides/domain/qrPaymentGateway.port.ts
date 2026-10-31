export interface CreateGatewayQrInput {
  amountPaise: number;
  rideId: string;
  name: string;
  description: string;
  closeByUnixSeconds: number;
}

export interface CreatedGatewayQr {
  gatewayRef: string;
  upiUri: string | null;
  imageUrl: string | null;
  expiresAt: Date;
}

export interface GatewayQrCredit {
  providerPaymentId: string;
  amountPaise: number;
}

export interface QrPaymentGatewayPort {
  readonly provider: 'RAZORPAY' | 'MOCK';
  createQrCode(input: CreateGatewayQrInput): Promise<CreatedGatewayQr>;
  closeQrCode(gatewayRef: string): Promise<void>;
  fetchQrCredit(gatewayRef: string): Promise<GatewayQrCredit | null>;
}
