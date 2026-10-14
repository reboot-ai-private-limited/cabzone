import { createHmac, randomInt } from 'node:crypto';
import type { RequestOtpResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { OtpStorePort, SmsGatewayPort } from '../../domain/index.js';

export interface RequestOtpDeps {
  otpStore: OtpStorePort;
  smsGateway: SmsGatewayPort;
  otpPepper: string;
  devFixedOtp?: string | undefined;
  ttlSeconds?: number | undefined;
  cooldownSeconds?: number | undefined;
}

export class RequestOtpUseCase {
  private readonly ttlSeconds: number;
  private readonly cooldownSeconds: number;

  constructor(private readonly deps: RequestOtpDeps) {
    this.ttlSeconds = deps.ttlSeconds ?? 300;
    this.cooldownSeconds = deps.cooldownSeconds ?? 60;
  }

  async execute(phoneE164: string): Promise<RequestOtpResponseDto> {
    const existing = await this.deps.otpStore.get(phoneE164);
    const now = new Date();

    if (existing) {
      const elapsedSeconds = (now.getTime() - existing.lastSentAt.getTime()) / 1000;
      if (elapsedSeconds < this.cooldownSeconds) {
        const retryAfter = Math.ceil(this.cooldownSeconds - elapsedSeconds);
        throw AppError.badRequest(
          `Please wait ${retryAfter} seconds before requesting another OTP.`,
          { retryAfterSeconds: retryAfter },
        );
      }
    }

    const otp = this.deps.devFixedOtp || String(randomInt(100000, 1000000));
    const otpHmac = createHmac('sha256', this.deps.otpPepper).update(otp).digest('hex');
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    const reserved = await this.deps.otpStore.reserve({
      phoneE164,
      otpHmac,
      attempts: 0,
      expiresAt,
      lastSentAt: now,
    }, this.cooldownSeconds);
    if (!reserved) throw AppError.badRequest('Please wait before requesting another OTP.');

    try {
      await this.deps.smsGateway.sendOtp(phoneE164, otp);
    } catch {
      await this.deps.otpStore.consume(phoneE164, otpHmac, Number.MAX_SAFE_INTEGER);
      throw AppError.internal();
    }

    return {
      phoneE164,
      expiresInSeconds: this.ttlSeconds,
      retryAfterSeconds: this.cooldownSeconds,
    };
  }
}
