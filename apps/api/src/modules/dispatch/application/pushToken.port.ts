export interface PushTokenPort {
  put(userId: string, installationId: string, token: string): Promise<void>;
  remove(userId: string, installationId: string): Promise<void>;
  list(userIds: string[]): Promise<string[]>;
  removeToken(token: string): Promise<void>;
}
