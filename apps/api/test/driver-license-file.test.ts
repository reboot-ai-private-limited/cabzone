import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDriverLicenseFile } from '../src/modules/identity/application/driverLicenseFile.js';
import { CloudinaryDriverLicenseAdapter } from '../src/modules/identity/infrastructure/cloudinaryDriverLicense.adapter.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n%%EOF');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);

describe('driver licence files', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts PDF and JPEG bytes and computes a server-side hash', () => {
    const parsedPdf = parseDriverLicenseFile(`data:application/pdf;base64,${pdf.toString('base64')}`);
    const parsedJpeg = parseDriverLicenseFile(`data:image/jpeg;base64,${jpeg.toString('base64')}`);

    expect(parsedPdf).toMatchObject({ mimeType: 'application/pdf', extension: 'pdf' });
    expect(parsedJpeg).toMatchObject({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(parsedPdf.bytes.equals(pdf)).toBe(true);
    expect(parsedPdf.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects disguised, corrupt, and over-500 KB files', () => {
    expect(() => parseDriverLicenseFile(`data:application/pdf;base64,${jpeg.toString('base64')}`)).toThrow();
    expect(() => parseDriverLicenseFile('data:image/png;base64,aGVsbG8=')).toThrow();
    expect(() => parseDriverLicenseFile('data:image/jpeg;base64,%%%%')).toThrow();
    const oversized = Buffer.concat([pdf, Buffer.alloc(500 * 1024)]);
    expect(() => parseDriverLicenseFile(`data:application/pdf;base64,${oversized.toString('base64')}`)).toThrow();
  });

  it('uploads as an authenticated raw asset with server credentials', async () => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const body = options.body as FormData;
      return new Response(
        JSON.stringify({
          public_id: body.get('public_id'),
          resource_type: 'raw',
          type: 'authenticated',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CloudinaryDriverLicenseAdapter({
      cloudName: 'test-cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });
    const storageKey = await adapter.upload(`data:application/pdf;base64,${pdf.toString('base64')}`, 'pdf');

    expect(storageKey).toMatch(/^driver-kyc\/[0-9a-f-]+\.pdf$/);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.cloudinary.com/v1_1/test-cloud/raw/upload');
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    });
    expect((options.body as FormData).get('type')).toBe('authenticated');
  });
});
