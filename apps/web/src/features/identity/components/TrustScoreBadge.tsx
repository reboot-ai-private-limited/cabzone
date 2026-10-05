'use client';

import { Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { TrustTier } from '@cabzone/contracts';

export interface TrustScoreBadgeProps {
  score?: number | null | undefined;
  tier?: TrustTier | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function TrustScoreBadge({
  score,
  tier: propTier,
  showLabel = true,
  size = 'md',
  className = '',
}: TrustScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border border-border bg-surface-muted text-text-subtle ${
          size === 'sm' ? 'text-[11px]' : 'text-xs'
        } ${className}`}
        title="Requires at least 3 completed trips to calculate verified trust score."
      >
        <Shield className="size-3 text-text-subtle" />
        <span>Unrated</span>
      </span>
    );
  }

  // Derive tier if not provided
  let tier = propTier;
  if (!tier) {
    if (score >= 90) tier = 'EXCELLENT';
    else if (score >= 75) tier = 'GOOD';
    else if (score >= 60) tier = 'FAIR';
    else tier = 'POOR';
  }

  const configs = {
    EXCELLENT: {
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
      label: 'Excellent',
    },
    GOOD: {
      border: 'border-blue-200 dark:border-blue-800',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-400',
      icon: <ShieldCheck className="size-3.5 text-blue-600 dark:text-blue-400" />,
      label: 'Good',
    },
    FAIR: {
      border: 'border-amber-200 dark:border-amber-800',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      icon: <ShieldAlert className="size-3.5 text-amber-600 dark:text-amber-400" />,
      label: 'Fair',
    },
    POOR: {
      border: 'border-rose-200 dark:border-rose-800',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-400',
      icon: <ShieldX className="size-3.5 text-rose-600 dark:text-rose-400" />,
      label: 'Under Review',
    },
    UNRATED: {
      border: 'border-border',
      bg: 'bg-surface-muted',
      text: 'text-text-subtle',
      icon: <Shield className="size-3.5 text-text-subtle" />,
      label: 'Unrated',
    },
  };

  const current = configs[tier];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold border ${current.border} ${current.bg} ${current.text} ${
        size === 'sm' ? 'text-[11px]' : 'text-xs'
      } ${className}`}
      title={`Trust Score: ${score}/100 (${current.label})`}
    >
      {current.icon}
      <span className="font-mono">{score}</span>
      {showLabel && <span className="font-normal opacity-85">· {current.label}</span>}
    </span>
  );
}
