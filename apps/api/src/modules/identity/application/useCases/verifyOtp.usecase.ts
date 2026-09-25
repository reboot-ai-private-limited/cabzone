import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VerifyOtpRequestDto, VerifyOtpResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  OtpStorePort,
  RiderRepositoryPort,
  SessionRepositoryPort,
  TokenSignerPort,
  UserRepositoryPort,
} from '../../domain/index.js';

export interface VerifyOtpDeps {
  otpStore: OtpStorePort;
  userRepo: UserRepositoryPort;
  riderRepo: RiderRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  tokenSigner: TokenSignerPort;
  otpPepper: string;
  sessionTtlDays?: number;
  maxAttempts?: number;
}

export class VerifyOtpUseCase {
  private readonly sessionTtlDays: number;
  private readonly maxAttempts: number;

  constructor(private readonly deps: VerifyOtpDeps) {
    this.sessionTtlDays = deps.sessionTtlDays ?? 30;
    this.maxAttempts = deps.maxAttempts ?? 3;
  }

  async execute(dto: VerifyOtpRequestDto): Promise<VerifyOtpResponseDto> {
    const record = await this.deps.otpStore.get(dto.phoneE164);
    if (!record || record.expiresAt <= new Date()) {
      throw AppError.unauthenticated('OTP expired or not found.');
    }

    if (record.attempts >= this.maxAttempts) {
      await this.deps.otpStore.delete(dto.phoneE164);
      throw AppError.badRequest('Maximum OTP verification attempts exceeded. Please request a new OTP.');
    }

    const candidateHmac = createHmac('sha256', this.deps.otpPepper).update(dto.otp).digest('hex');
    const isValid =
      record.otpHmac.length === candidateHmac.length &&
      timingSafeEqual(Buffer.from(record.otpHmac, 'hex'), Buffer.from(candidateHmac, 'hex'));

    if (!isValid) {
      await this.deps.otpStore.incrementAttempts(dto.phoneE164);
      throw AppError.unauthenticated('Invalid OTP.');
    }

    await this.deps.otpStore.delete(dto.phoneE164);

    let user = await this.deps.userRepo.findByPhone(dto.phoneE164);
    let isNewUser = false;
    const now = new Date();

    if (!user) {
      isNewUser = true;
      const userId = newUuid();
      user = await this.deps.userRepo.create({
        id: userId,
        phoneE164: dto.phoneE164,
        phoneVerifiedAt: now,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await this.deps.riderRepo.create({
        id: newUuid(),
        userId: user.id,
        name: null,
        email: null,
        emergencyContact: null,
        preferredLanguage: null,
        ratingAverage: null,
        ratingCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      if (user.status !== 'ACTIVE') {
        throw AppError.forbidden('User account is suspended or deactivated.');
      }
    }

    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const sessionId = newUuid();
    const expiresAt = new Date(now.getTime() + this.sessionTtlDays * 24 * 60 * 60 * 1000);

    await this.deps.sessionRepo.save({
      id: sessionId,
      userId: user.id,
      deviceId: dto.deviceId,
      refreshTokenHash,
      expiresAt,
      revokedAt: null,
      lastUsedAt: now,
      createdAt: now,
    });

    const accessToken = await this.deps.tokenSigner.signAccessToken(
      {
        sub: user.id,
        sessionId,
        role: 'RIDER',
      },
      '15m',
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        role: 'RIDER',
        isNewUser,
      },
    };
  }
}
