import type { PushTokenTransport } from '@cabzone/contracts';

export interface PushTokenMetadata {
  platform?: 'android' | 'ios' | undefined;
  transport?: PushTokenTransport | undefined;
}

export interface PushTokenPort {
  put(userId: string, installationId: string, token: string, meta?: PushTokenMetadata): Promise<void>;
  remove(userId: string, installationId: string): Promise<void>;
  list(userIds: string[], transport?: PushTokenTransport): Promise<string[]>;
  removeToken(token: string): Promise<void>;
  hasInstallation?(userId: string, installationId: string): Promise<boolean>;
}
