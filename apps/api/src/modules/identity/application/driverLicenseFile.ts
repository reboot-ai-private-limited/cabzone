import { createHash } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';

const MAX_LICENSE_BYTES = 500 * 1024;
const DATA_URL_PATTERN = /^data:(application\/pdf|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedDriverLicenseFile {
  bytes: Buffer;
  mimeType: 'application/pdf' | 'image/jpeg';
  extension: 'pdf' | 'jpg';
  sha256: string;
}

export function parseDriverLicenseFile(dataUrl: string, label = 'Driving licence'): ParsedDriverLicenseFile {
  if (dataUrl.length > Math.ceil(MAX_LICENSE_BYTES / 3) * 4 + 32) {
    throw AppError.badRequest(`${label} file must be 500 KB or smaller.`);
  }

  const match = DATA_URL_PATTERN.exec(dataUrl);
  const mimeType = match?.[1];
  const encoded = match?.[2];
  if (!encoded || (mimeType !== 'application/pdf' && mimeType !== 'image/jpeg') || encoded.length % 4 !== 0) {
    throw AppError.badRequest(`Upload a PDF, JPG, or JPEG ${label.toLowerCase()} file.`);
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LICENSE_BYTES) {
    throw AppError.badRequest(`${label} file must be 500 KB or smaller.`);
  }
  if (bytes.toString('base64') !== encoded) {
    throw AppError.badRequest(`${label} file is corrupt. Please select it again.`);
  }

  const isPdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((mimeType === 'application/pdf' && !isPdf) || (mimeType === 'image/jpeg' && !isJpeg)) {
    throw AppError.badRequest('File contents do not match its PDF or JPEG format.');
  }

  return {
    bytes,
    mimeType,
    extension: mimeType === 'application/pdf' ? 'pdf' : 'jpg',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
