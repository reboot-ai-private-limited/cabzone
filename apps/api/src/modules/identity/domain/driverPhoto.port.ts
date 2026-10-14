export interface DriverPhotoStoragePort {
  upload(dataUrl: string): Promise<string>;
}
