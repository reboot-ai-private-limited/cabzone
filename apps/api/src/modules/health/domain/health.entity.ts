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
  checkedAt: Date;
  dependencies: DependencyHealth[];
}

export function summarise(deps: DependencyHealth[], uptimeSeconds: number): HealthReport {
  return {
    status: deps.every((d) => d.status === 'up') ? 'healthy' : 'degraded',
    uptimeSeconds: Math.floor(uptimeSeconds),
    checkedAt: new Date(),
    dependencies: deps,
  };
}
