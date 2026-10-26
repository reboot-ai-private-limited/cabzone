'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminRole } from '@cabzone/contracts';
import { Activity, Clock, Database, HeartPulse, RefreshCw, Route } from 'lucide-react';
import { Badge, Button, ErrorState, PageHeader, Skeleton } from '@cabzone/design-system';
import { getStoredAdminRole } from '@/features/auth/lib/authApi';
import { healthApi } from '@/lib/api/endpoints/health';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';

const POLL_MS = 15_000;

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function HealthScreen() {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    setAdminRole(getStoredAdminRole());
  }, []);

  const isSuperAdmin = adminRole === 'SUPER_ADMIN';

  const serviceQuery = useQuery({
    queryKey: keys.health.service(),
    queryFn: ({ signal }) => healthApi.getServiceHealth(signal),
    staleTime: 0,
    refetchInterval: POLL_MS,
  });

  const routingHealthQuery = useQuery({
    ...authedQueryOptions({
      queryKey: keys.health.routingHealth(),
      fetch: (token, signal) => healthApi.getRoutingHealth(token, signal),
      staleTime: 0,
    }),
    enabled: isSuperAdmin,
    refetchInterval: isSuperAdmin ? POLL_MS : false,
  });

  const routingMetricsQuery = useQuery({
    ...authedQueryOptions({
      queryKey: keys.health.routingMetrics(),
      fetch: (token, signal) => healthApi.getRoutingMetrics(token, signal),
      staleTime: 0,
    }),
    enabled: isSuperAdmin,
    refetchInterval: isSuperAdmin ? POLL_MS : false,
  });

  const handleRefresh = () => {
    void serviceQuery.refetch();
    if (isSuperAdmin) {
      void routingHealthQuery.refetch();
      void routingMetricsQuery.refetch();
    }
  };

  const report = serviceQuery.data;
  const isFetching =
    serviceQuery.isFetching || routingHealthQuery.isFetching || routingMetricsQuery.isFetching;

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="System Health"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'System Health' }]}
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            loading={isFetching}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        }
      />

      {serviceQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : serviceQuery.isError || !report ? (
        <ErrorState
          title="API probe unreachable"
          message={
            serviceQuery.error instanceof Error
              ? serviceQuery.error.message
              : 'Could not reach /api/health.'
          }
          onRetry={() => void serviceQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-2">
                  <HeartPulse className="size-4 text-interactive" />
                  Overall Status
                </span>
                <Badge tone={report.status === 'healthy' ? 'success' : 'danger'}>
                  {report.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-text-subtle">
                Checked{' '}
                {new Date(report.checkedAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </div>

            <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-2">
                <Clock className="size-4 text-slate-500" />
                Process Uptime
              </span>
              <div className="text-2xl font-bold font-mono text-text">
                {formatUptime(report.uptimeSeconds)}
              </div>
            </div>

            <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-2">
                <Database className="size-4 text-slate-500" />
                Dependencies Up
              </span>
              <div className="text-2xl font-bold font-mono text-text">
                {report.dependencies.filter((d) => d.status === 'up').length} /{' '}
                {report.dependencies.length}
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Infrastructure Probes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.dependencies.map((dep) => (
                <div
                  key={dep.name}
                  className="p-4 bg-surface border border-border rounded-xl flex items-center justify-between gap-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-text capitalize">{dep.name}</span>
                    {dep.detail && <span className="text-xs text-text-subtle">{dep.detail}</span>}
                  </div>
                  <div className="flex items-center gap-2.5">
                    {dep.latencyMs !== undefined && (
                      <span className="text-xs font-mono text-text-subtle">{dep.latencyMs} ms</span>
                    )}
                    <Badge tone={dep.status === 'up' ? 'success' : 'danger'}>
                      {dep.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {isSuperAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-2">
            <Route className="size-3.5 text-interactive" />
            Routing Provider Telemetry (Super Admin)
          </h2>
          {routingHealthQuery.isLoading || routingMetricsQuery.isLoading ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : routingHealthQuery.isError || routingMetricsQuery.isError ? (
            <ErrorState
              title="Routing telemetry unavailable"
              message="Could not load routing provider health or metrics."
              onRetry={() => {
                void routingHealthQuery.refetch();
                void routingMetricsQuery.refetch();
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-1.5">
                <span className="text-xs text-text-subtle">Active Provider</span>
                <span className="text-sm font-bold font-mono text-text">
                  {routingHealthQuery.data?.provider ?? '—'}
                </span>
                <Badge tone={routingHealthQuery.data?.configured ? 'success' : 'warning'}>
                  {routingHealthQuery.data?.configured ? 'CONFIGURED' : 'UNCONFIGURED'}
                </Badge>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-1.5">
                <span className="text-xs text-text-subtle flex items-center gap-1">
                  <Activity className="size-3.5" /> Requests
                </span>
                <span className="text-xl font-bold font-mono text-text">
                  {routingMetricsQuery.data?.requests ?? 0}
                </span>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-1.5">
                <span className="text-xs text-text-subtle">Cache Hits</span>
                <span className="text-xl font-bold font-mono text-text">
                  {routingMetricsQuery.data?.cacheHits ?? 0}
                </span>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-1.5">
                <span className="text-xs text-text-subtle">Failures</span>
                <span className="text-xl font-bold font-mono text-text">
                  {routingMetricsQuery.data?.failures ?? 0}
                </span>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-1.5">
                <span className="text-xs text-text-subtle">Avg Latency</span>
                <span className="text-xl font-bold font-mono text-text">
                  {routingMetricsQuery.data?.averageLatencyMs ?? 0} ms
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
