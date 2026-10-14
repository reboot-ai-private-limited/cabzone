import { createHash } from 'node:crypto';
import { newUuid } from '../../../shared/ids.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type { DriverPhotoStoragePort } from '../domain/driverPhoto.port.js';

export class CloudinaryDriverPhotoAdapter implements DriverPhotoStoragePort {
  constructor(private readonly config: { cloudName: string; apiKey: string; apiSecret: string }) {}

  async upload(dataUrl: string): Promise<string> {
    // shortcut: replaced photos remain in storage; add orphan cleanup before high-volume use.
    const publicId = `driver-profiles/${newUuid()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${this.config.apiSecret}`)
      .digest('hex');
    const body = new FormData();
    body.set('file', dataUrl);
    body.set('public_id', publicId);
    body.set('timestamp', timestamp);
    body.set('api_key', this.config.apiKey);
    body.set('signature', signature);
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName)}/image/upload`,
        {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(20_000),
        },
      );
      const result = (await response.json()) as { secure_url?: unknown };
      if (
        !response.ok ||
        typeof result.secure_url !== 'string' ||
        !result.secure_url.startsWith(
          `https://res.cloudinary.com/${this.config.cloudName}/image/upload/`,
        )
      ) {
        throw new Error('Photo storage rejected the upload');
      }
      return result.secure_url;
    } catch {
      throw new AppError({
        statusCode: 502,
        code: 'INTERNAL',
        message: 'Could not save your photo. Please try again.',
      });
    }
  }
}
