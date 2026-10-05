import { createHash, randomBytes } from 'node:crypto';
import type { AdminLoginRequestDto, AdminLoginResponseDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import { verifyPassword } from '../../../../shared/auth/password.util.js';
import type {
  AdminUserRepositoryPort,
  SessionRepositoryPort,
  TokenSignerPort,
  UserRepositoryPort,
} from '../../domain/index.js';

export interface AdminLoginDeps {
  userRepo: UserRepositoryPort;
  adminRepo: AdminUserRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  tokenSigner: TokenSignerPort;
  sessionTtlDays?: number;
}

export class AdminLoginUseCase {
  private readonly sessionTtlDays: number;

  constructor(private readonly deps: AdminLoginDeps) {
    this.sessionTtlDays = deps.sessionTtlDays ?? 30;
  }

  async execute(dto: AdminLoginRequestDto): Promise<AdminLoginResponseDto> {
    const phone = dto.phoneE164.trim();
    const user = await this.deps.userRepo.findByPhone(phone);
    if (!user) {
      throw AppError.unauthenticated('Invalid mobile number or password.');
    }

    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('User account is suspended or deactivated.');
    }

    const admin = await this.deps.adminRepo.findByUserId(user.id);
    if (!admin || admin.status !== 'ACTIVE') {
      throw AppError.unauthenticated('Invalid administrative credentials or account inactive.');
    }

    if (!admin.passwordHash) {
      throw AppError.unauthenticated(
        'Password login is not configured for this admin account. Contact a Super Administrator.'
      );
    }

    const isValid = verifyPassword(dto.password, admin.passwordHash);
    if (!isValid) {
      throw AppError.unauthenticated('Invalid mobile number or password.');
    }

    const now = new Date();
    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const sessionId = newUuid();
    const expiresAt = new Date(now.getTime() + this.sessionTtlDays * 24 * 60 * 60 * 1000);

    // Revoke previous sessions upon administrative login
    await this.deps.sessionRepo.revokeAllForUser(user.id);

    await this.deps.sessionRepo.save({
      id: sessionId,
      userId: user.id,
      deviceId: dto.deviceId ?? 'admin-web-console',
      refreshTokenHash,
      previousRefreshTokenHash: null,
      expiresAt,
      revokedAt: null,
      lastUsedAt: now,
      createdAt: now,
    });

    // 8-hour access token for console operators
    const accessToken = await this.deps.tokenSigner.signAccessToken(
      {
        sub: user.id,
        sessionId,
        role: admin.role,
      },
      '8h'
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 28800, // 8 hours in seconds
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        name: admin.name,
        role: admin.role,
      },
    };
  }
}
