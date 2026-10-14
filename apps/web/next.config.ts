import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@cabzone/contracts'],
  reactStrictMode: true,
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      ...(webpackConfig.resolve.extensionAlias ?? {}),
    };
    return webpackConfig;
  },
};

export default config;
