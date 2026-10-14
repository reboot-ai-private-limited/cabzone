import type { OtpRecord, OtpStorePort } from '../domain/index.js';

export class MemoryOtpStoreAdapter implements OtpStorePort {
  private readonly store = new Map<string, OtpRecord>();

  async save(record: OtpRecord): Promise<void> {
    this.store.set(record.phoneE164, { ...record });
  }

  async reserve(record: OtpRecord, cooldownSeconds: number): Promise<boolean> {
    const existing = this.store.get(record.phoneE164);
    if (existing && existing.expiresAt > record.lastSentAt && existing.lastSentAt.getTime() + cooldownSeconds * 1000 > record.lastSentAt.getTime()) return false;
    this.store.set(record.phoneE164, structuredClone(record));
    return true;
  }

  async consume(phoneE164: string, expectedHmac: string, maxAttempts: number): Promise<boolean> {
    const record = this.store.get(phoneE164);
    if (!record || record.otpHmac !== expectedHmac || record.attempts >= maxAttempts || record.expiresAt <= new Date()) return false;
    this.store.delete(phoneE164);
    return true;
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

  async incrementAttempts(phoneE164: string, expectedHmac?: string): Promise<number> {
    const record = this.store.get(phoneE164);
    if (!record) return 0;
    if (expectedHmac && record.otpHmac !== expectedHmac) return 0;
    record.attempts += 1;
    this.store.set(phoneE164, record);
    return record.attempts;
  }

  async delete(phoneE164: string): Promise<void> {
    this.store.delete(phoneE164);
  }
}
