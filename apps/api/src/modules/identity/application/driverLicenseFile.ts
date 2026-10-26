import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import type { DocumentFileExtension } from '../domain/driverLicenseStorage.port.js';

const MAX_LICENSE_BYTES = 500 * 1024;
const DATA_URL_PATTERN = /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PRIVATE_STORAGE_KEY_PATTERN = /^driver-kyc\/[A-Za-z0-9_-]+\.(pdf|jpg|png)$/;

export type DocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';
export type { DocumentFileExtension };

export interface ParsedDriverLicenseFile {
  bytes: Buffer;
  mimeType: DocumentMimeType;
  extension: DocumentFileExtension;
  sha256: string;
}

export function isPrivateKycStorageKey(storageKey: string): boolean {
  return PRIVATE_STORAGE_KEY_PATTERN.test(storageKey);
}

export function detectDocumentMimeType(bytes: Buffer): DocumentMimeType | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  return null;
}

export function parseDriverLicenseFile(dataUrl: string, label = 'Driving licence'): ParsedDriverLicenseFile {
  if (dataUrl.length > Math.ceil(MAX_LICENSE_BYTES / 3) * 4 + 32) {
    throw AppError.badRequest(`${label} file must be 500 KB or smaller.`);
  }

  const match = DATA_URL_PATTERN.exec(dataUrl);
  const mimeType = match?.[1] as DocumentMimeType | undefined;
  const encoded = match?.[2];
  if (
    !encoded ||
    (mimeType !== 'application/pdf' && mimeType !== 'image/jpeg' && mimeType !== 'image/png') ||
    encoded.length % 4 !== 0
  ) {
    throw AppError.badRequest(`Upload a PDF, JPG, JPEG, or PNG ${label.toLowerCase()} file.`);
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LICENSE_BYTES) {
    throw AppError.badRequest(`${label} file must be 500 KB or smaller.`);
  }
  if (bytes.toString('base64') !== encoded) {
    throw AppError.badRequest(`${label} file is corrupt. Please select it again.`);
  }

  const detectedMime = detectDocumentMimeType(bytes);
  if (detectedMime !== mimeType) {
    throw AppError.badRequest('File contents do not match its PDF, JPEG, or PNG format.');
  }

  const extension: DocumentFileExtension =
    mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';

  return {
    bytes,
    mimeType,
    extension,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
