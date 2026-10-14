'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navigation, Smartphone, Tag, Zap } from 'lucide-react';
import { PageHeader, SegmentedControl } from '@cabzone/design-system';
import { TripSimulatorScreen } from '@/features/quotes/components/TripSimulatorScreen';
import { FareSimulatorSection } from '@/features/pricing/components/FareSimulatorSection';
import { FleetSimulatorSection } from './FleetSimulatorSection';
import { CustomerAppSimulatorSection } from './CustomerAppSimulatorSection';

export type SimulatorTab = 'customer' | 'trip' | 'fare' | 'fleet';

export interface SimulatorsScreenProps {
  defaultTab?: SimulatorTab;
}

export function SimulatorsScreen({ defaultTab = 'customer' }: SimulatorsScreenProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlTab = searchParams.get('tab') as SimulatorTab | null;
  const initialTab: SimulatorTab = urlTab && ['customer', 'trip', 'fare', 'fleet'].includes(urlTab)
    ? urlTab
    : defaultTab;

  const [activeTab, setActiveTab] = useState<SimulatorTab>(initialTab);

  const handleTabChange = (newTab: SimulatorTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'customer':
        return 'Customer App (Driver App E2E Tester)';
      case 'trip':
        return 'Trip & Route Simulator';
      case 'fare':
        return 'Live Fare & Tariff Simulator';
      case 'fleet':
        return 'Fleet & Dispatch Simulator';
    }
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <PageHeader
          title="Developer Simulators"
          breadcrumbs={[
            { label: 'Admin', href: '/' },
            { label: 'Developers' },
            { label: 'Simulators' },
            { label: tabTitle },
          ]}
        />
        <p className="text-xs text-text-subtle">
          Sandbox environments for testing Customer → Driver App E2E workflows, quote generation, tariff pricing calculation, and live dispatch fleet simulation.
        </p>
      </div>

      {/* Simulator Switcher Tab */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SegmentedControl<SimulatorTab>
          label="Simulator Mode"
          value={activeTab}
          onValueChange={handleTabChange}
          segments={[
            {
              value: 'customer',
              label: 'Customer App (Driver Tester)',
              icon: <Smartphone className="size-3.5" />,
            },
            {
              value: 'trip',
              label: 'Trip & Route',
              icon: <Navigation className="size-3.5" />,
            },
            {
              value: 'fare',
              label: 'Live Fare & Tariff',
              icon: <Tag className="size-3.5" />,
            },
            {
              value: 'fleet',
              label: 'Fleet & Dispatch',
              icon: <Zap className="size-3.5" />,
            },
          ]}
        />

        <span className="text-xs text-text-subtle font-mono hidden sm:inline">
          Environment: Sandbox
        </span>
      </div>

      {/* Active Simulator Content */}
      <div className="pt-1">
        {activeTab === 'customer' && <CustomerAppSimulatorSection />}
        {activeTab === 'trip' && <TripSimulatorScreen showHeader={false} />}
        {activeTab === 'fare' && <FareSimulatorSection />}
        {activeTab === 'fleet' && <FleetSimulatorSection />}
      </div>
    </div>
  );
}
