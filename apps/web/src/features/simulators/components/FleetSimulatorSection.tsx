'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Car,
  ExternalLink,
  Navigation,
  Radio,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { VehicleCategory } from '@cabzone/contracts';
import { Badge, Button, Input, SegmentedControl, Skeleton, StatTile } from '@cabzone/design-system';
import { useDispatchFleet, useSimulateFleet } from '@/features/rides/hooks/useDispatchFleet';

export function FleetSimulatorSection() {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | VehicleCategory>('ALL');
  const [search, setSearch] = useState('');

  const {
    data: fleet = [],
    refetch: refetchFleet,
    isFetching: isFetchingFleet,
    isLoading,
  } = useDispatchFleet({
    vehicleCategory: selectedCategory === 'ALL' ? undefined : selectedCategory,
  });

  const simulateFleet = useSimulateFleet();

  const isSimulatedActive = useMemo(
    () => fleet.some((d) => d.driverId.startsWith('sim-driver-')),
    [fleet],
  );

  const cabsCount = useMemo(
    () => fleet.filter((d) => d.vehicleCategory === 'CAB').length,
    [fleet],
  );

  const eRickshawsCount = useMemo(
    () => fleet.filter((d) => d.vehicleCategory === 'E_RICKSHAW').length,
    [fleet],
  );

  const onlineCount = useMemo(
    () => fleet.filter((d) => d.status === 'ONLINE').length,
    [fleet],
  );

  const filteredFleet = useMemo(() => {
    if (!search.trim()) return fleet;
    const q = search.toLowerCase().trim();
    return fleet.filter(
      (d) =>
        (d.driverName?.toLowerCase() ?? '').includes(q) ||
        (d.vehicleRegistration?.toLowerCase() ?? '').includes(q) ||
        d.driverId.toLowerCase().includes(q),
    );
  }, [fleet, search]);

  const handleToggleSimulation = () => {
    simulateFleet.mutate({ enabled: !isSimulatedActive });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Control Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl border border-border-strong bg-surface">
        <div className="flex items-center gap-3.5">
          <div
            className={`p-3 rounded-xl border ${
              isSimulatedActive
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                : 'bg-surface-muted border-border text-text-subtle'
            }`}
          >
            <Zap className={`size-6 ${isSimulatedActive ? 'fill-amber-500' : ''}`} />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-text">
                Siliguri Fleet Dispatch Simulator
              </h3>
              <Badge tone={isSimulatedActive ? 'success' : 'neutral'}>
                {isSimulatedActive ? 'Active' : 'Idle'}
              </Badge>
            </div>
            <p className="text-xs text-text-subtle">
              {isSimulatedActive
                ? `Simulating ${fleet.length} active GPS-broadcasting drivers across Siliguri urban zones.`
                : 'Start mock fleet to generate live GPS pings for dispatch testing and trip matching.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetchFleet()}
            disabled={isFetchingFleet}
            aria-label="Refresh simulated drivers"
          >
            <RefreshCw className={`size-3.5 ${isFetchingFleet ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant={isSimulatedActive ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleSimulation}
            loading={simulateFleet.isPending}
            className={
              !isSimulatedActive
                ? 'bg-interactive hover:bg-interactive-hover text-white'
                : 'border-border-strong text-text hover:bg-surface-muted'
            }
          >
            <Zap className={`size-3.5 ${isSimulatedActive ? 'text-amber-500 fill-amber-500' : ''}`} />
            <span>{isSimulatedActive ? 'Stop Fleet Simulation' : '⚡ Simulate Fleet (Siliguri)'}</span>
          </Button>

          <Link href="/rides">
            <Button variant="secondary" size="sm">
              <span>Live Rides Map</span>
              <ExternalLink className="size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Simulated Drivers"
          value={fleet.length}
          hint={isSimulatedActive ? 'Broadcasting live telemetry' : 'Simulation not active'}
          loading={isLoading}
          tone={isSimulatedActive ? 'success' : 'default'}
        />
        <StatTile
          label="Available Cabs"
          value={cabsCount}
          hint="4-wheelers in Siliguri"
          loading={isLoading}
          tone="default"
        />
        <StatTile
          label="Available E-Rickshaws"
          value={eRickshawsCount}
          hint="Local first/last mile"
          loading={isLoading}
          tone="default"
        />
        <StatTile
          label="Ready For Dispatch"
          value={onlineCount}
          hint="Online and unassigned"
          loading={isLoading}
          tone="default"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-surface">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search driver, ID, reg..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 text-xs"
          />
        </div>

        <SegmentedControl<'ALL' | VehicleCategory>
          label="Vehicle Category Filter"
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          segments={[
            { value: 'ALL', label: 'All Fleet' },
            { value: 'CAB', label: 'Cabs' },
            { value: 'E_RICKSHAW', label: 'E-Rickshaws' },
          ]}
        />
      </div>

      {/* Drivers Telemetry List */}
      <div className="rounded-xl border border-border-strong bg-surface overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-interactive" />
            <h4 className="text-sm font-semibold text-text">Simulated Driver Fleet Telemetry</h4>
            <span className="text-xs text-text-subtle font-mono">({filteredFleet.length} vehicles)</span>
          </div>
          <span className="text-xs text-text-subtle">Auto-refreshes every 5s</span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredFleet.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-surface-muted border border-border text-text-subtle">
              <Car className="size-6" />
            </div>
            <p className="text-sm font-medium text-text">No simulated drivers active</p>
            <p className="text-xs text-text-subtle max-w-sm">
              Click &ldquo;⚡ Simulate Fleet (Siliguri)&rdquo; above to spawn 15 mock drivers with realistic GPS routes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-text-subtle font-medium">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Speed / Heading</th>
                  <th className="px-4 py-3">Current Location</th>
                  <th className="px-4 py-3">Last Ping</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFleet.map((driver) => {
                  const speedKmh = driver.speedMps ? Math.round(driver.speedMps * 3.6) : 0;
                  return (
                    <tr key={driver.driverId} className="hover:bg-surface-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text">
                            {driver.driverName ?? driver.driverId}
                          </span>
                          <span className="font-mono text-[11px] text-text-subtle">
                            {driver.driverId.slice(0, 12)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={driver.vehicleCategory === 'CAB' ? 'info' : 'success'}>
                            {driver.vehicleCategory === 'CAB' ? 'Cab' : 'E-Rickshaw'}
                          </Badge>
                          <span className="font-mono text-text font-medium">
                            {driver.vehicleRegistration ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={driver.status === 'ONLINE' ? 'success' : 'warning'}>
                          {driver.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-mono text-text">
                          <Navigation
                            className="size-3 text-text-subtle shrink-0"
                            style={{
                              transform: driver.heading ? `rotate(${driver.heading}deg)` : undefined,
                            }}
                          />
                          <span>{speedKmh} km/h</span>
                          {driver.heading !== null && (
                            <span className="text-text-subtle text-[10px]">({driver.heading}°)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-text-subtle">
                          {driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-subtle font-mono text-[11px]">
                        {new Date(driver.locationUpdatedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
