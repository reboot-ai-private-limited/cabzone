FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json                apps/api/
COPY packages/config/package.json         packages/config/
COPY packages/contracts/package.json      packages/contracts/
COPY packages/geo/package.json            packages/geo/
RUN pnpm install --frozen-lockfile --ignore-scripts=false

FROM deps AS build
COPY packages/contracts packages/contracts
COPY packages/config    packages/config
COPY packages/geo       packages/geo
COPY apps/api/tsconfig.json apps/api/.dependency-cruiser.cjs apps/api/esbuild.config.mjs apps/api/
COPY apps/api/src apps/api/src

RUN pnpm --filter @cabzone/api build
RUN pnpm --filter @cabzone/api deploy --prod --legacy /prod/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist     ./dist

USER node
EXPOSE 4000

CMD ["node", "dist/server.js"]
