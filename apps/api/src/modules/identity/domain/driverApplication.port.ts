import type { DriverApplicationStatus } from '@cabzone/contracts';
import type { DriverApplicationEntity } from './driverApplication.entity.js';

export interface DriverApplicationListFilter {
  status?: DriverApplicationStatus | undefined;
  limit: number;
  offset: number;
}

export interface DriverApplicationRepositoryPort {
  findById(id: string): Promise<DriverApplicationEntity | null>;
  findByDriverId(driverId: string): Promise<DriverApplicationEntity | null>;
  /** Newest first. */
  list(filter: DriverApplicationListFilter): Promise<DriverApplicationEntity[]>;
  create(application: DriverApplicationEntity): Promise<DriverApplicationEntity>;
  update(application: DriverApplicationEntity): Promise<DriverApplicationEntity>;
}
