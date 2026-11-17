import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const rawOrigin = (process.env.API_UPSTREAM_ORIGIN || 'https://cabzone.site').trim().replace(/\/$/, '');
const apiUpstreamOrigin = rawOrigin.endsWith('/api') ? rawOrigin.slice(0, -4) : rawOrigin;

const config: NextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@cabzone/contracts', '@cabzone/design-system', '@cabzone/geo'],
  reactStrictMode: true,
  images: {
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  ...(apiUpstreamOrigin
    ? {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${apiUpstreamOrigin}/api/:path*`,
            },
          ];
        },
      }
    : {}),
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      ...(webpackConfig.resolve.extensionAlias ?? {}),
    };
    return webpackConfig;
  },
};

export default config;
