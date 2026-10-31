import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/logging/logger.js';
import type {
  CreateGatewayQrInput,
  CreatedGatewayQr,
  GatewayQrCredit,
  QrPaymentGatewayPort,
} from '../domain/qrPaymentGateway.port.js';

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;
const MIN_QR_AMOUNT_PAISE = 100;

const qrCreateResponseSchema = z.object({
  id: z.string().min(1),
  image_url: z.string().nullable().optional(),
  image_content: z.string().nullable().optional(),
  close_by: z.number().int().optional(),
});

const qrPaymentsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      amount: z.number().int(),
      status: z.string(),
    }),
  ),
});

function assertValidAmountPaise(amountPaise: number): void {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < MIN_QR_AMOUNT_PAISE) {
    throw AppError.badRequest('Ride payment amount must be at least ₹1 (100 paise).');
  }
}

function extractRazorpayErrorDescription(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const errObj = (payload as { error?: unknown }).error;
  if (!errObj || typeof errObj !== 'object') return undefined;
  const desc = (errObj as { description?: unknown }).description;
  return typeof desc === 'string' ? desc : undefined;
}

export class RazorpayQrGateway implements QrPaymentGatewayPort {
  readonly provider = 'RAZORPAY' as const;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; ok: boolean; data: unknown }> {
    if (!this.keyId || !this.keySecret) {
      throw AppError.badRequest('UPI QR payments are not configured on the server.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${RAZORPAY_BASE_URL}/${path}`, {
        method,
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch((err: unknown) => {
        if (controller.signal.aborted) throw err;
        return null;
      });
      return { status: response.status, ok: response.ok, data };
    } catch (err) {
      logger.error(
        { path, method, err: err instanceof Error ? err.message : String(err) },
        'razorpay qr network request failed',
      );
      throw AppError.badRequest(
        'Payment provider is temporarily unavailable. Please try again shortly.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async createQrCode(input: CreateGatewayQrInput): Promise<CreatedGatewayQr> {
    assertValidAmountPaise(input.amountPaise);
    const trimmedName = input.name.trim().slice(0, 40) || 'Cabzone Ride';
    const { status, ok, data } = await this.requestJson('POST', 'payments/qr_codes', {
      type: 'upi_qr',
      name: trimmedName,
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: input.amountPaise,
      description: input.description,
      close_by: input.closeByUnixSeconds,
      notes: {
        reference: input.rideId,
        rideId: input.rideId,
      },
    });

    if (!ok) {
      logger.error(
        {
          status,
          rideId: input.rideId,
          razorpayDescription: extractRazorpayErrorDescription(data),
        },
        'razorpay create qr_codes failed',
      );
      throw AppError.badRequest('Could not generate a UPI QR code right now. Please try again.');
    }

    const parsed = qrCreateResponseSchema.parse(data);
    const upiUri =
      typeof parsed.image_content === 'string' && parsed.image_content.startsWith('upi://')
        ? parsed.image_content
        : null;
    const imageUrl =
      typeof parsed.image_url === 'string' && parsed.image_url.length > 0 ? parsed.image_url : null;

    if (!upiUri && !imageUrl) {
      logger.error(
        { rideId: input.rideId, qrId: parsed.id },
        'razorpay qr missing both upiUri and imageUrl',
      );
      throw AppError.badRequest('Payment provider returned an unreadable QR code. Please retry.');
    }

    const closeBySec = parsed.close_by ?? input.closeByUnixSeconds;
    return {
      gatewayRef: parsed.id,
      upiUri,
      imageUrl,
      expiresAt: new Date(closeBySec * 1000),
    };
  }

  async closeQrCode(gatewayRef: string): Promise<void> {
    const path = `payments/qr_codes/${encodeURIComponent(gatewayRef)}/close`;
    const { status, ok, data } = await this.requestJson('POST', path, {});
    if (status === 400) {
      // A 400 for an already-closed single-use or expired QR is expected; log and don't throw.
      logger.info(
        {
          gatewayRef,
          razorpayDescription: extractRazorpayErrorDescription(data),
        },
        'razorpay qr close returned 400 (already closed)',
      );
      return;
    }
    if (!ok) {
      logger.error(
        {
          status,
          gatewayRef,
          razorpayDescription: extractRazorpayErrorDescription(data),
        },
        'razorpay close qr_codes failed',
      );
      throw AppError.badRequest('Could not close previous UPI QR. Please try again.');
    }
  }

  async fetchQrCredit(gatewayRef: string): Promise<GatewayQrCredit | null> {
    const path = `payments/qr_codes/${encodeURIComponent(gatewayRef)}/payments`;
    const { status, ok, data } = await this.requestJson('GET', path);
    if (!ok) {
      logger.error(
        {
          status,
          gatewayRef,
          razorpayDescription: extractRazorpayErrorDescription(data),
        },
        'razorpay fetch qr_codes payments failed',
      );
      throw AppError.badRequest('Could not check UPI payment status right now.');
    }
    const parsed = qrPaymentsResponseSchema.parse(data);
    const captured = parsed.items.find((item) => item.status === 'captured');
    if (!captured) return null;
    return {
      providerPaymentId: captured.id,
      amountPaise: captured.amount,
    };
  }
}

interface MockQrRecord {
  gatewayRef: string;
  amountPaise: number;
  rideId: string;
  closed: boolean;
  expiresAt: Date;
  credit: GatewayQrCredit | null;
}

export class MockQrPaymentGateway implements QrPaymentGatewayPort {
  readonly provider = 'MOCK' as const;
  private readonly records = new Map<string, MockQrRecord>();

  constructor(private readonly forbidInProduction = false) {}

  async createQrCode(input: CreateGatewayQrInput): Promise<CreatedGatewayQr> {
    if (this.forbidInProduction) {
      throw AppError.badRequest('UPI QR payments are not configured on the server.');
    }
    assertValidAmountPaise(input.amountPaise);
    const token = randomUUID().replace(/-/g, '').slice(0, 14);
    const gatewayRef = `qr_mock_${token}`;
    const rupees = (input.amountPaise / 100).toFixed(2);
    const upiUri = `upi://pay?pa=cabzone.mock@upi&pn=${encodeURIComponent(
      input.name.slice(0, 40) || 'Cabzone',
    )}&am=${rupees}&cu=INR&tr=${gatewayRef}&tn=${encodeURIComponent(input.description)}`;
    const expiresAt = new Date(input.closeByUnixSeconds * 1000);
    this.records.set(gatewayRef, {
      gatewayRef,
      amountPaise: input.amountPaise,
      rideId: input.rideId,
      closed: false,
      expiresAt,
      credit: null,
    });
    return {
      gatewayRef,
      upiUri,
      imageUrl: null,
      expiresAt,
    };
  }

  async closeQrCode(gatewayRef: string): Promise<void> {
    const record = this.records.get(gatewayRef);
    if (!record || record.closed) {
      logger.info({ gatewayRef }, 'mock qr already closed');
      return;
    }
    record.closed = true;
  }

  async fetchQrCredit(gatewayRef: string): Promise<GatewayQrCredit | null> {
    return this.records.get(gatewayRef)?.credit ?? null;
  }

  simulateCredit(
    gatewayRef: string,
    amountPaise?: number,
    providerPaymentId = `pay_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
  ): GatewayQrCredit {
    const record = this.records.get(gatewayRef);
    const resolvedAmount = amountPaise ?? record?.amountPaise ?? 0;
    const credit: GatewayQrCredit = { providerPaymentId, amountPaise: resolvedAmount };
    if (record) {
      record.credit = credit;
      record.closed = true;
    } else {
      this.records.set(gatewayRef, {
        gatewayRef,
        amountPaise: resolvedAmount,
        rideId: '',
        closed: true,
        expiresAt: new Date(),
        credit,
      });
    }
    return credit;
  }
}
