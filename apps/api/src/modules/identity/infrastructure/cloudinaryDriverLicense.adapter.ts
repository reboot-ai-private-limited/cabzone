import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { newUuid } from '../../../shared/ids.js';
import { AppError } from '../../../shared/errors/AppError.js';
import {
  isPrivateKycStorageKey,
  type DocumentFileExtension,
} from '../application/driverLicenseFile.js';
import type { DriverLicenseStoragePort } from '../domain/driverLicenseStorage.port.js';

const MAX_READ_BYTES = 5 * 1024 * 1024;

export class CloudinaryDriverLicenseAdapter implements DriverLicenseStoragePort {
  constructor(private readonly config: { cloudName: string; apiKey: string; apiSecret: string }) {}

  private buildAuthenticatedDeliveryUrl(storageKey: string): string {
    if (!isPrivateKycStorageKey(storageKey)) {
      throw AppError.badRequest('Document storage key is not a valid private KYC asset');
    }
    const signature = createHash('sha1')
      .update(`${storageKey}${this.config.apiSecret}`)
      .digest('base64url')
      .slice(0, 8);
    return `https://res.cloudinary.com/${encodeURIComponent(this.config.cloudName)}/raw/authenticated/s--${signature}--/${storageKey}`;
  }

  async read(storageKey: string): Promise<Buffer> {
    const upstreamUrl = this.buildAuthenticatedDeliveryUrl(storageKey);
    try {
      const response = await fetch(upstreamUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Storage read failed with status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_READ_BYTES) {
        throw new Error('Invalid document byte length');
      }
      return Buffer.from(arrayBuffer);
    } catch {
      throw new AppError({
        statusCode: 502,
        code: 'INTERNAL',
        message: 'Could not retrieve private KYC document.',
      });
    }
  }

  async upload(dataUrl: string, extension: DocumentFileExtension): Promise<string> {
    // shortcut: replaced or failed-persistence assets need an orphan cleanup job.
    const publicId = `driver-kyc/${newUuid()}.${extension}`;
    const body = new FormData();
    body.set('file', dataUrl);
    body.set('public_id', publicId);
    body.set('type', 'authenticated');

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName)}/raw/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')}`,
          },
          body,
          signal: AbortSignal.timeout(20_000),
        },
      );
      const result = (await response.json()) as {
        public_id?: unknown;
        resource_type?: unknown;
        type?: unknown;
      };
      if (
        !response.ok ||
        result.public_id !== publicId ||
        result.resource_type !== 'raw' ||
        result.type !== 'authenticated'
      ) {
        throw new Error('Private document storage rejected the upload');
      }
      return publicId;
    } catch {
      throw new AppError({
        statusCode: 502,
        code: 'INTERNAL',
        message: 'Could not save your document. Please try again.',
      });
    }
  }
}
