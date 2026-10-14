export interface DriverLicenseStoragePort {
  upload(dataUrl: string, extension: 'pdf' | 'jpg'): Promise<string>;
}
