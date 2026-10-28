FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json                apps/api/
COPY apps/web/package.json                apps/web/
COPY apps/driver-mobile/package.json      apps/driver-mobile/
COPY apps/rider-mobile/package.json       apps/rider-mobile/
COPY packages/config/package.json         packages/config/
COPY packages/contracts/package.json      packages/contracts/
COPY packages/design-system/package.json  packages/design-system/
COPY packages/geo/package.json            packages/geo/
RUN pnpm install --frozen-lockfile --ignore-scripts=false

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL
ARG API_UPSTREAM_ORIGIN=""
ARG ALLOW_NON_HTTPS_WEB_API_URL="false"

RUN if [ -z "$NEXT_PUBLIC_API_BASE_URL" ]; then \
      echo "ERROR: NEXT_PUBLIC_API_BASE_URL build arg is required (browser-reachable HTTPS URL, e.g. https://api.cabzone.example/api)." >&2; \
      exit 1; \
    fi && \
    case "$NEXT_PUBLIC_API_BASE_URL" in \
      http://api:*|http://api/*|https://api:*|https://api/*) \
        echo "ERROR: NEXT_PUBLIC_API_BASE_URL ($NEXT_PUBLIC_API_BASE_URL) uses internal Docker hostname 'api', which browsers cannot resolve." >&2; \
        exit 1 ;; \
      https://*) ;; \
      http://*) \
        if [ "$ALLOW_NON_HTTPS_WEB_API_URL" != "true" ]; then \
          echo "ERROR: NEXT_PUBLIC_API_BASE_URL must use https:// in production builds (set ALLOW_NON_HTTPS_WEB_API_URL=true only for local smoke tests)." >&2; \
          exit 1; \
        fi ;; \
      *) \
        echo "ERROR: NEXT_PUBLIC_API_BASE_URL must be an absolute URL." >&2; \
        exit 1 ;; \
    esac

COPY packages/config        packages/config
COPY packages/geo           packages/geo
COPY packages/contracts     packages/contracts
COPY packages/design-system packages/design-system
COPY apps/web               apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV API_UPSTREAM_ORIGIN=${API_UPSTREAM_ORIGIN}
RUN pnpm --filter @cabzone/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public           ./apps/web/public

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["node", "apps/web/server.js"]
