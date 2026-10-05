'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { GeoPoint, QuoteDto, VehicleCategory } from '@cabzone/contracts';
import { PageHeader, Skeleton, StatTile } from '@cabzone/design-system';
import { ApiError } from '@/lib/api/ApiError.js';
import { useZones } from '@/features/zones/hooks/useZones.js';
import { useSimulateQuote } from '../hooks/useQuoteSimulation.js';
import { TripSimulatorForm } from './TripSimulatorForm.js';
import { QuoteResultPanel } from './QuoteResultPanel.js';
import { ScenarioLog, type ScenarioEntry } from './ScenarioLog.js';

// Dynamic import Google Maps wrapper with ssr: false to prevent SSR hydration errors
const TripPointMap = dynamic(
  () => import('./TripPointMap.js').then((m) => m.TripPointMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="w-full h-full min-h-[500px] rounded-lg" />
    ),
  },
);

const DEFAULT_SILIGURI_PICKUP: GeoPoint = { lat: 26.7141, lng: 88.4334 };
const DEFAULT_SILIGURI_DROP: GeoPoint = { lat: 26.728, lng: 88.425 };

export function TripSimulatorScreen() {
  const [pickup, setPickup] = useState<GeoPoint | null>(DEFAULT_SILIGURI_PICKUP);
  const [drop, setDrop] = useState<GeoPoint | null>(DEFAULT_SILIGURI_DROP);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('CAB');
  const [activeTarget, setActiveTarget] = useState<'pickup' | 'drop' | 'auto'>('auto');

  const { data: zonesData } = useZones({ status: 'ACTIVE' });
  const activeZones = zonesData?.items ?? [];

  const [currentQuote, setCurrentQuote] = useState<QuoteDto | null>(null);
  const [currentError, setCurrentError] = useState<unknown | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioEntry[]>([]);

  const simulateMutation = useSimulateQuote(
    (quote, variables) => {
      setCurrentQuote(quote);
      setCurrentError(null);

      const entry: ScenarioEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        pickup: variables.pickup,
        drop: variables.drop,
        vehicleCategory: variables.vehicleCategory,
        status: 'SUCCESS',
        serviceType: quote.serviceType,
        bufferApplied: quote.bufferApplied,
        routeScope: quote.routeScope,
        suggestedFarePaise: quote.suggestedFarePaise,
        distanceM: quote.distanceM,
        durationSeconds: quote.estimatedDurationSeconds,
      };

      setScenarios((prev) => [entry, ...prev.slice(0, 19)]);
    },
    (error, variables) => {
      setCurrentError(error);
      setCurrentQuote(null);

      let errorCode = 'ERROR';
      let errorMessage = 'Simulation failed';
      if (error instanceof ApiError) {
        errorCode = error.code || 'API_ERROR';
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes(':')) {
          errorCode = error.message.split(':')[0]?.trim() || errorCode;
        }
      }

      const entry: ScenarioEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        pickup: variables.pickup,
        drop: variables.drop,
        vehicleCategory: variables.vehicleCategory,
        status: 'ERROR',
        errorCode,
        errorMessage,
      };

      setScenarios((prev) => [entry, ...prev.slice(0, 19)]);
    },
  );

  const handleSimulate = () => {
    if (!pickup || !drop) return;
    simulateMutation.mutate({
      pickup,
      drop,
      vehicleCategory,
    });
  };

  const handleSelectScenario = (scenario: ScenarioEntry) => {
    setPickup(scenario.pickup);
    setDrop(scenario.drop);
    setVehicleCategory(scenario.vehicleCategory);
    setActiveTarget('auto');
  };

  const handleClearLog = () => {
    setScenarios([]);
  };

  // Stats calculation
  const totalRuns = scenarios.length;
  const inCityRuns = scenarios.filter((s) => s.serviceType === 'IN_CITY').length;
  const outstationRuns = scenarios.filter(
    (s) => s.serviceType === 'OUTSTATION' || s.serviceType === 'INTERSTATE',
  ).length;
  const errorRuns = scenarios.filter((s) => s.status === 'ERROR').length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-1">
        <PageHeader
          title="Trip Simulator"
          breadcrumbs={[
            { label: 'Admin', href: '/' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Trip Simulator' },
          ]}
        />
        <p className="text-xs text-text-subtle">
          Virtually test pickup, drop, and pricing logic across zone and buffer boundaries with real backend classification.
        </p>
      </div>

      {/* Summary Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Session Simulations" value={totalRuns} />
        <StatTile label="In-City Trips" value={inCityRuns} />
        <StatTile label="Outstation Trips" value={outstationRuns} />
        <StatTile label="Rejections / Errors" value={errorRuns} />
      </div>

      {/* Main Two-Pane Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Pane: Interactive Map */}
        <div className="w-full lg:flex-1 min-h-[520px] lg:min-h-[640px] flex flex-col">
          <TripPointMap
            pickup={pickup}
            drop={drop}
            onPickupChange={setPickup}
            onDropChange={setDrop}
            activeTarget={activeTarget}
            zones={activeZones}
            className="flex-1 min-h-[520px] lg:min-h-[640px]"
          />
        </div>

        {/* Right Pane: Controls, Results & Scenario Log */}
        <div className="w-full lg:w-[450px] shrink-0 flex flex-col gap-6">
          {/* Controls Form */}
          <TripSimulatorForm
            pickup={pickup}
            drop={drop}
            vehicleCategory={vehicleCategory}
            onPickupChange={setPickup}
            onDropChange={setDrop}
            onVehicleChange={setVehicleCategory}
            activeTarget={activeTarget}
            onActiveTargetChange={setActiveTarget}
            onSimulate={handleSimulate}
            loading={simulateMutation.isPending}
          />

          {/* Real Server Result Panel */}
          <QuoteResultPanel
            quote={currentQuote}
            error={currentError}
            loading={simulateMutation.isPending}
          />

          {/* Session History Log */}
          <ScenarioLog
            scenarios={scenarios}
            onSelectScenario={handleSelectScenario}
            onClearLog={handleClearLog}
          />
        </div>
      </div>
    </div>
  );
}
