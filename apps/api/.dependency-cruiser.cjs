/**
 * Machine-checks architectural boundaries and Clean Architecture invariants.
 */

const MODULE_TIERS = [
  ['health', 'ledger', 'zone', 'routing'],
  ['pricing'],
  ['rides'],
  ['identity', 'dispatch'],
];

const layeringRules = MODULE_TIERS.map((tier, index) => {
  const below = MODULE_TIERS.slice(0, index).flat();
  return {
    name: `tier-${index}-${tier.join('-')}`,
    comment:
      `${tier.join(' and ')} may import only: ${below.join(', ') || '(no other module)'}.`,
    severity: 'error',
    from: { path: `^src/modules/(${tier.join('|')})/` },
    to: {
      path: '^src/modules/[^/]+/',
      pathNot: [`^src/modules/$1/`, ...(below.length ? [`^src/modules/(${below.join('|')})/`] : [])],
    },
  };
});

module.exports = {
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },

  forbidden: [
    {
      name: 'not-to-unresolvable',
      comment: 'An import that resolves to nothing.',
      severity: 'error',
      from: { path: '^src' },
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      comment: 'A cycle between files.',
      severity: 'error',
      from: { path: '^src' },
      to: { circular: true },
    },
    {
      name: 'module-internals-are-private',
      comment: "Cross-module imports must target '<name>.public.ts', nothing else.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: [
          '^src/modules/$1/',
          '^src/modules/[^/]+/[^/]+\\.public\\.ts$',
        ],
      },
    },
    {
      name: 'domain-imports-nothing-above-it',
      comment: 'domain/ must not import from application, infrastructure, or interface.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/modules/[^/]+/(application|infrastructure|interface)/' },
    },
    {
      name: 'application-depends-on-ports-not-adapters',
      comment: 'application/ depends on domain ports, never on infrastructure or interface adapters.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: '^src/modules/[^/]+/(infrastructure|interface)/' },
    },
    {
      name: 'interface-depends-on-ports-not-adapters',
      comment: 'interface/ must not import directly from infrastructure/.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/interface/' },
      to: { path: '^src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'shared-is-below-modules',
      comment: 'shared/ sits below every module.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    ...layeringRules,
  ],
};
