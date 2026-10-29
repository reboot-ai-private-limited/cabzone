import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
import { summarise } from '../../domain/health.entity.js';
import type { HealthReport } from '../../domain/health.entity.js';
import type { HealthProbePort } from '../../domain/healthProbe.port.js';

export class GetHealthUseCase {
  constructor(
    private readonly probes: HealthProbePort[],
    private readonly uptime: () => number = () => process.uptime(),
    private readonly alertOnDegraded = false,
  ) {}

  async execute(): Promise<HealthReport> {
    const results = await Promise.allSettled(this.probes.map((p) => p.check()));

    const deps = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            name: this.probes[i]?.name ?? 'unknown',
            status: 'down' as const,
            detail: 'probe threw',
          },
    );

    const report = summarise(deps, this.uptime());
    if (this.alertOnDegraded && report.status === 'degraded') {
      const downDeps = deps.filter((d) => d.status === 'down').map((d) => d.name);
      void emitOperationalAlert({
        category: 'DATASTORE_HEALTH',
        severity: 'critical',
        dedupeKey: `DATASTORE_HEALTH:${downDeps.sort().join(',')}`,
        summary: `Health probe degraded: ${downDeps.join(', ')} down`,
        metadata: { downDependencies: downDeps },
      });
    }

    return report;
  }
}
