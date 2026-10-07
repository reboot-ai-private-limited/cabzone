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
      border: 'border-emerald-300',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      icon: <ShieldCheck className="size-3.5 text-emerald-700" />,
      label: 'Excellent',
    },
    GOOD: {
      border: 'border-blue-300',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      icon: <ShieldCheck className="size-3.5 text-blue-700" />,
      label: 'Good',
    },
    FAIR: {
      border: 'border-amber-300',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      icon: <ShieldAlert className="size-3.5 text-amber-700" />,
      label: 'Fair',
    },
    POOR: {
      border: 'border-rose-300',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      icon: <ShieldX className="size-3.5 text-rose-700" />,
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
