import { Buffer } from 'node:buffer';
import { newUuid } from '../../../shared/ids.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type { DriverLicenseStoragePort } from '../domain/driverLicenseStorage.port.js';

export class CloudinaryDriverLicenseAdapter implements DriverLicenseStoragePort {
  constructor(private readonly config: { cloudName: string; apiKey: string; apiSecret: string }) {}

  async upload(dataUrl: string, extension: 'pdf' | 'jpg'): Promise<string> {
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
