export interface OtpRecord {
  phoneE164: string;
  otpHmac: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
}

export interface OtpStorePort {
  save(record: OtpRecord): Promise<void>;
  reserve(record: OtpRecord, cooldownSeconds: number): Promise<boolean>;
  consume(phoneE164: string, expectedHmac: string, maxAttempts: number): Promise<boolean>;
  get(phoneE164: string): Promise<OtpRecord | null>;
  incrementAttempts(phoneE164: string, expectedHmac?: string): Promise<number>;
  delete(phoneE164: string): Promise<void>;
}

export interface SmsGatewayPort {
  sendOtp(phoneE164: string, otp: string): Promise<void>;
}
