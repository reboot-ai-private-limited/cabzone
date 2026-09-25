/**
 * Types for service probe health checks.
 */

export type DependencyStatus = 'up' | 'down';

export interface DependencyHealth {
  name: string;
  status: DependencyStatus;
  detail?: string;
  latencyMs?: number;
}

export interface HealthReport {
  status: 'healthy' | 'degraded';
  uptimeSeconds: number;
  checkedAt: string | Date;
  dependencies: DependencyHealth[];
}
