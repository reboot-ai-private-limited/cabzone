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
  states: {
    all: () => ['states'] as const,
    admin: () => ['states', 'admin'] as const,
    history: (code: string) => ['states', 'history', code] as const,
  },
  packages: {
    all: () => ['packages'] as const,
    incityList: (query?: unknown) => ['packages', 'incity', query] as const,
  },
  rides: {
    all: () => ['rides'] as const,
    list: (filter?: unknown) => ['rides', 'list', filter] as const,
    events: (id: string) => ['rides', 'events', id] as const,
  },
  drivers: {
    all: () => ['drivers'] as const,
    applications: (filter?: unknown) => ['drivers', 'applications', filter] as const,
    application: (id: string) => ['drivers', 'application', id] as const,
  },
  wallets: {
    all: () => ['wallets'] as const,
    detail: (driverId: string) => ['wallets', 'detail', driverId] as const,
  },
  pricing: {
    all: () => ['pricing'] as const,
    configs: (query?: unknown) => ['pricing', 'configs', query] as const,
    states: (status?: string) => ['pricing', 'states', status] as const,
  },
};
