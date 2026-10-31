#!/bin/bash
set -e

echo "🚀 Updating Cabzone Backend..."
cd /var/www/cabzone

# 1. Pull latest code from GitHub
git pull origin main

# 2. Install dependencies & build backend
pnpm install --frozen-lockfile
pnpm --filter @cabzone/api build

# 3. Reload PM2 processes with zero downtime
pm2 reload ecosystem.config.cjs --update-env

echo "✅ Cabzone Backend Deployment Successful!"
