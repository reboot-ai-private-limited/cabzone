import type { SmsGatewayPort } from '../domain/index.js';

export class ConsoleSmsGatewayAdapter implements SmsGatewayPort {
  readonly sentOtps = new Map<string, string>();

  async sendOtp(phoneE164: string, otp: string): Promise<void> {
    this.sentOtps.set(phoneE164, otp);
  }
}
