import type { HealthReport } from './domain/health.entity.js';

export interface HealthReportContract {
  report(): Promise<HealthReport>;
}

export type HealthPublicContract = HealthReportContract;

export type { DependencyHealth, HealthReport } from './domain/health.entity.js';
export { assertRealtimeReadyForEnv } from '@/shared/realtime/readiness.js';
