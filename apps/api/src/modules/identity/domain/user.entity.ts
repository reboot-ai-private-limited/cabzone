export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface UserEntity {
  id: string;
  phoneE164: string;
  phoneVerifiedAt: Date | null;
  status: UserStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function canUserAuthenticate(user: UserEntity): boolean {
  return user.status === 'ACTIVE' && user.phoneVerifiedAt !== null;
}
