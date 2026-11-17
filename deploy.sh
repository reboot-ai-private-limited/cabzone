#!/bin/bash
set -e

echo "🚀 Updating Cabzone Stack..."
cd /var/www/cabzone

# 1. Pull latest code from GitHub
git pull origin main

# 2. Install dependencies & build backend + web admin
pnpm install --frozen-lockfile
NEXT_PUBLIC_API_BASE_URL=https://cabzone.site/api API_UPSTREAM_ORIGIN=http://127.0.0.1:4090 \
  pnpm turbo run build --filter=@cabzone/api --filter=@cabzone/web

# 3. Sync Next.js standalone static & public assets
rm -rf apps/web/.next/standalone/apps/web/.next/static apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public apps/web/.next/standalone/apps/web/public

# 4. Start or reload PM2 processes
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "✅ Cabzone Deployment Successful!"
