export interface PendingPushReceipt {
  id: string;
  token: string;
}

export interface PushReceiptPort {
  add(id: string, token: string, checkAfter: Date): Promise<void>;
  due(now: Date, limit: number): Promise<PendingPushReceipt[]>;
  postpone(id: string, checkAfter: Date): Promise<void>;
  remove(id: string): Promise<void>;
}
