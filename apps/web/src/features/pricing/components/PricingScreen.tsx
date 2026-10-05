'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@cabzone/design-system';
import { PageHeader } from '@cabzone/design-system';
import { SegmentedControl } from '@cabzone/design-system';
import { StatTile } from '@cabzone/design-system';
import { usePricingConfigs } from '../hooks/usePricing.js';
import { FareSimulatorSection } from './FareSimulatorSection.js';
import { PricingConfigDialog } from './PricingConfigDialog.js';
import { PricingConfigsTable } from './PricingConfigsTable.js';

type PricingTab = 'city' | 'simulator';

export function PricingScreen() {
  const [activeTab, setActiveTab] = useState<PricingTab>('city');
  const [isCreateConfigOpen, setIsCreateConfigOpen] = useState(false);

  const { data: configs, isLoading: isConfigsLoading } = usePricingConfigs();

  const activeConfigsCount = useMemo(() => {
    return (configs ?? []).filter((c) => c.status === 'ACTIVE').length;
  }, [configs]);

  const stateAndGlobalCount = useMemo(() => {
    return (configs ?? []).filter((c) => c.status === 'ACTIVE' && (c.level === 'GLOBAL' || c.level === 'STATE')).length;
  }, [configs]);

  const avgCommission = useMemo(() => {
    const active = (configs ?? []).filter((c) => c.status === 'ACTIVE');
    if (active.length === 0) return '8%';
    const sum = active.reduce((acc, curr) => acc + curr.commissionPercent, 0);
    return `${(sum / active.length).toFixed(1)}%`;
  }, [configs]);

  return (
    <div className="flex flex-col gap-7 p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Pricing Engine"
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Pricing Control Plane' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsCreateConfigOpen(true)}
            >
              <Plus className="size-4" />
              <span>New Pricing Rule</span>
            </Button>
          </div>
        }
      />

      {/* Top Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Active Rules"
          value={activeConfigsCount}
          hint="Global, State & City zones"
          loading={isConfigsLoading}
          tone="success"
        />
        <StatTile
          label="State & Global Tiers"
          value={stateAndGlobalCount}
          hint="Broad territorial fallbacks"
          loading={isConfigsLoading}
          tone="default"
        />
        <StatTile
          label="Platform Commission"
          value={avgCommission}
          hint="Standard percentage cut"
          loading={isConfigsLoading}
          tone="default"
        />
        <StatTile
          label="Negotiation Window"
          value="90s"
          hint="Rider-driver quote lock"
          tone="default"
        />
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SegmentedControl<PricingTab>
          label="Pricing View"
          value={activeTab}
          onValueChange={setActiveTab}
          segments={[
            { value: 'city', label: 'Pricing Rules & Tiers' },
            { value: 'simulator', label: 'Live Fare Simulator' },
          ]}
        />
      </div>

      {/* View Content */}
      <div className="w-full">
        {activeTab === 'city' && <PricingConfigsTable />}
        {activeTab === 'simulator' && <FareSimulatorSection />}
      </div>

      {/* Dialog Modals */}
      <PricingConfigDialog
        open={isCreateConfigOpen}
        onOpenChange={setIsCreateConfigOpen}
      />
    </div>
  );
}
