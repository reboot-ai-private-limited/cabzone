import type { LogoutResponseDto } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { SessionRepositoryPort } from '../../domain/index.js';

export interface LogoutDeps {
  sessionRepo: SessionRepositoryPort;
}

export class LogoutUseCase {
  constructor(private readonly deps: LogoutDeps) {}

  async execute(sessionId: string): Promise<LogoutResponseDto> {
    const session = await this.deps.sessionRepo.findById(sessionId);
    if (!session) {
      throw AppError.notFound('Session not found.');
    }

    await this.deps.sessionRepo.revoke(sessionId);

    return {
      message: 'Logged out successfully',
    };
  }
}
