import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenRequestDto, RefreshTokenResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { isSessionActive, type SessionRepositoryPort, type TokenSignerPort } from '../../domain/index.js';

export interface RefreshTokenDeps {
  sessionRepo: SessionRepositoryPort;
  tokenSigner: TokenSignerPort;
}

export class RefreshTokenUseCase {
  constructor(private readonly deps: RefreshTokenDeps) {}

  async execute(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
    const incomingHash = createHash('sha256').update(dto.refreshToken).digest('hex');
    const session = await this.deps.sessionRepo.findByTokenHash(incomingHash);

    if (!session) {
      throw AppError.unauthenticated('Invalid refresh token.');
    }

    if (!isSessionActive(session)) {
      throw AppError.unauthenticated('Session is revoked or expired.');
    }

    if (session.deviceId !== dto.deviceId) {
      await this.deps.sessionRepo.revoke(session.id);
      throw AppError.unauthenticated('Device mismatch. Session revoked.');
    }

    const newRawRefreshToken = randomBytes(32).toString('hex');
    const newHash = createHash('sha256').update(newRawRefreshToken).digest('hex');
    const now = new Date();

    const updatedSession = {
      ...session,
      refreshTokenHash: newHash,
      lastUsedAt: now,
    };
    await this.deps.sessionRepo.save(updatedSession);

    const accessToken = await this.deps.tokenSigner.signAccessToken(
      {
        sub: session.userId,
        sessionId: session.id,
        role: 'RIDER',
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
