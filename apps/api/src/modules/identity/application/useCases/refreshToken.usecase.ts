import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenRequestDto, RefreshTokenResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  AdminUserRepositoryPort,
  DriverRepositoryPort,
  RiderRepositoryPort,
  SessionRepositoryPort,
  TokenSignerPort,
  UserRepositoryPort,
} from '../../domain/index.js';
import { isSessionActive, resolveUserRole } from '../../domain/index.js';

export interface RefreshTokenDeps {
  sessionRepo: SessionRepositoryPort;
  tokenSigner: TokenSignerPort;
  userRepo?: UserRepositoryPort;
  riderRepo?: RiderRepositoryPort;
  driverRepo?: DriverRepositoryPort;
  adminRepo?: AdminUserRepositoryPort;
}

export class RefreshTokenUseCase {
  constructor(private readonly deps: RefreshTokenDeps) {}

  async execute(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
    const incomingHash = createHash('sha256').update(dto.refreshToken).digest('hex');
    const session = await this.deps.sessionRepo.findByTokenHash(incomingHash);

    if (!session) {
      throw AppError.unauthenticated('Invalid refresh token.');
    }

    if (session.previousRefreshTokenHash === incomingHash) {
      await this.deps.sessionRepo.revoke(session.id);
      throw AppError.unauthenticated('AUTH_REFRESH_REUSE_DETECTED: Refresh token reuse detected. Session revoked.');
    }

    if (!isSessionActive(session)) {
      throw AppError.unauthenticated('Session is revoked or expired.');
    }

    if (session.deviceId !== dto.deviceId) {
      await this.deps.sessionRepo.revoke(session.id);
      throw AppError.unauthenticated('Device mismatch. Session revoked.');
    }

    if (this.deps.userRepo) {
      const user = await this.deps.userRepo.findById(session.userId);
      if (!user || user.status !== 'ACTIVE') {
        await this.deps.sessionRepo.revoke(session.id);
        throw AppError.forbidden('User account is suspended or deactivated.');
      }
    }

    const newRawRefreshToken = randomBytes(32).toString('hex');
    const newHash = createHash('sha256').update(newRawRefreshToken).digest('hex');
    const now = new Date();

    const updatedSession = {
      ...session,
      previousRefreshTokenHash: session.refreshTokenHash,
      refreshTokenHash: newHash,
      lastUsedAt: now,
    };
    await this.deps.sessionRepo.save(updatedSession);

    const role = await resolveUserRole({
      userId: session.userId,
      adminRepo: this.deps.adminRepo,
      driverRepo: this.deps.driverRepo,
      riderRepo: this.deps.riderRepo,
    });

    const accessToken = await this.deps.tokenSigner.signAccessToken(
      {
        sub: session.userId,
        sessionId: session.id,
        role,
      },
      '15m',
    );

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }
}
