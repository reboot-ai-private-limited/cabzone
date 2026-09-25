import type { DriverApplicationEntity } from './driverApplication.entity.js';

export interface DriverApplicationRepositoryPort {
  findById(id: string): Promise<DriverApplicationEntity | null>;
  findByDriverId(driverId: string): Promise<DriverApplicationEntity | null>;
  create(application: DriverApplicationEntity): Promise<DriverApplicationEntity>;
  update(application: DriverApplicationEntity): Promise<DriverApplicationEntity>;
}
