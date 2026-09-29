import { SignJWT, jwtVerify } from 'jose';
import type { AuthRole, AuthTokenPayload } from '@cabzone/contracts';
import type { TokenSignerPort, TokenVerifierPort } from '../domain/index.js';

export class JoseTokenAdapter implements TokenVerifierPort, TokenSignerPort {
  private readonly secretKey: Uint8Array;

  constructor(secret: string) {
    this.secretKey = new TextEncoder().encode(secret);
  }

  async signAccessToken(payload: AuthTokenPayload, expiresIn = '15m'): Promise<string> {
    return new SignJWT({
      role: payload.role,
      sessionId: payload.sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.secretKey);
  }

  async verifyAccessToken(token: string): Promise<AuthTokenPayload> {
    const { payload } = await jwtVerify(token, this.secretKey);
    return {
      sub: payload.sub as string,
      sessionId: payload.sessionId as string,
      role: payload.role as AuthRole,
    };
  }
}
