import type { OtpRecord, OtpStorePort } from '../domain/index.js';

export class MemoryOtpStoreAdapter implements OtpStorePort {
  private readonly store = new Map<string, OtpRecord>();

  async save(record: OtpRecord): Promise<void> {
    this.store.set(record.phoneE164, { ...record });
  }

  async get(phoneE164: string): Promise<OtpRecord | null> {
    const record = this.store.get(phoneE164);
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      this.store.delete(phoneE164);
      return null;
    }
    return { ...record };
  }

  async incrementAttempts(phoneE164: string): Promise<number> {
    const record = this.store.get(phoneE164);
    if (!record) return 0;
    record.attempts += 1;
    this.store.set(phoneE164, record);
    return record.attempts;
  }

  async delete(phoneE164: string): Promise<void> {
    this.store.delete(phoneE164);
  }
}
