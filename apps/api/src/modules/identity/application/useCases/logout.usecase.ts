import type { LogoutResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { logger } from '../../../../shared/logging/logger.js';
import type { SessionEntity, SessionRepositoryPort } from '../../domain/index.js';

export interface LogoutDeps {
  sessionRepo: SessionRepositoryPort;
  onSessionRevoked?: ((session: SessionEntity) => Promise<void>) | undefined;
}

export class LogoutUseCase {
  constructor(private readonly deps: LogoutDeps) {}

  async execute(sessionId: string): Promise<LogoutResponseDto> {
    const session = await this.deps.sessionRepo.findById(sessionId);
    if (!session) {
      throw AppError.notFound('Session not found.');
    }

    await this.deps.sessionRepo.revoke(sessionId);
    if (this.deps.onSessionRevoked) {
      try {
        await this.deps.onSessionRevoked(session);
      } catch (err) {
        logger.warn({ sessionId, err: String(err) }, 'post-logout cleanup hook failed');
      }
    }

    return {
      message: 'Logged out successfully',
    };
  }
}
