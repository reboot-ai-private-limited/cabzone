import type { Buffer } from 'node:buffer';

export type DocumentFileExtension = 'pdf' | 'jpg' | 'png';

export interface DriverLicenseStoragePort {
  upload(dataUrl: string, extension: DocumentFileExtension): Promise<string>;
  read?(storageKey: string): Promise<Buffer>;
}
