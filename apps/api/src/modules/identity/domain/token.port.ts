import type { AuthTokenPayload } from '@cabzone/contracts';

export interface TokenVerifierPort {
  verifyAccessToken(token: string): Promise<AuthTokenPayload>;
}

export interface TokenSignerPort {
  signAccessToken(payload: AuthTokenPayload, expiresIn?: string): Promise<string>;
}
