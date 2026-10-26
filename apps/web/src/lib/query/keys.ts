/**
 * Canonical React Query keys and cache durations
 */

export const staleTime = {
  live: 0,
  short: 30 * 1000,
  configuration: 5 * 60 * 1000,
  static: Infinity,
} as const;

export const keys = {
  zones: {
    all: () => ['zones'] as const,
    list: (query?: unknown) => ['zones', 'list', query] as const,
    detail: (id: string) => ['zones', 'detail', id] as const,
    dependents: (id: string) => ['zones', 'dependents', id] as const,
    validate: (fingerprint: string) => ['zones', 'validate', fingerprint] as const,
    history: (id: string) => ['zones', 'history', id] as const,
  },
  packages: {
    all: () => ['packages'] as const,
    incityList: (query?: unknown) => ['packages', 'incity', query] as const,
  },
  rides: {
    all: () => ['rides'] as const,
    list: (filter?: unknown) => ['rides', 'list', filter] as const,
    events: (id: string) => ['rides', 'events', id] as const,
    disputes: (status: string) => ['rides', 'disputes', status] as const,
  },
  drivers: {
    all: () => ['drivers'] as const,
    applications: (filter?: unknown) => ['drivers', 'applications', filter] as const,
    application: (id: string) => ['drivers', 'application', id] as const,
  },
  wallets: {
    all: () => ['wallets'] as const,
    stats: () => ['wallets', 'stats'] as const,
    list: (query?: unknown) => ['wallets', 'list', query] as const,
    transactions: (query?: unknown) => ['wallets', 'transactions', query] as const,
    detail: (id: string) => ['wallets', 'detail', id] as const,
  },
  pricing: {
    all: () => ['pricing'] as const,
    configs: (query?: unknown) => ['pricing', 'configs', query] as const,
  },
  riders: {
    all: () => ['riders'] as const,
    list: (query?: unknown) => ['riders', 'list', query] as const,
    detail: (id: string) => ['riders', 'detail', id] as const,
    rides: (riderId: string) => ['riders', 'rides', riderId] as const,
  },
  admins: {
    all: () => ['admins'] as const,
    list: (query?: unknown) => ['admins', 'list', query] as const,
    detail: (id: string) => ['admins', 'detail', id] as const,
    permissions: () => ['admins', 'permissions'] as const,
  },
  dispatch: {
    all: () => ['dispatch'] as const,
    fleet: (query?: unknown) => ['dispatch', 'fleet', query] as const,
  },
  health: {
    all: () => ['health'] as const,
    service: () => ['health', 'service'] as const,
    routingHealth: () => ['health', 'routing-health'] as const,
    routingMetrics: () => ['health', 'routing-metrics'] as const,
  },
};
