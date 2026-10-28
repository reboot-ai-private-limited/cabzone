FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json                apps/api/
COPY apps/web/package.json                apps/web/
COPY packages/config/package.json         packages/config/
COPY packages/contracts/package.json      packages/contracts/
COPY packages/geo/package.json            packages/geo/
COPY packages/design-system/package.json  packages/design-system/
RUN pnpm install --frozen-lockfile --ignore-scripts=false

FROM deps AS build
COPY packages/contracts packages/contracts
COPY packages/config    packages/config
COPY packages/geo       packages/geo
COPY packages/design-system packages/design-system
COPY apps/web           apps/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @cabzone/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public          ./apps/web/public

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
