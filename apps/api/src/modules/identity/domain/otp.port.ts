export interface OtpRecord {
  phoneE164: string;
  otpHmac: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
}

export interface OtpStorePort {
  save(record: OtpRecord): Promise<void>;
  get(phoneE164: string): Promise<OtpRecord | null>;
  incrementAttempts(phoneE164: string): Promise<number>;
  delete(phoneE164: string): Promise<void>;
}

export interface SmsGatewayPort {
  sendOtp(phoneE164: string, otp: string): Promise<void>;
}
