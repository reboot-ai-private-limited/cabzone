const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Map relative .js imports inside TypeScript packages (like @cabzone/contracts) to .ts/.tsx
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    try {
      const withoutExt = moduleName.slice(0, -3);
      return (originalResolveRequest || context.resolveRequest)(context, withoutExt, platform);
    } catch {
      // continue to standard resolution
    }
  }
  return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
