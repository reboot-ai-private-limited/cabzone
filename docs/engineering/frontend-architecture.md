# Frontend Architecture

## Frontend Applications

cabzone defines two categories of frontend clients:

1. **Admin & Operations Web Console** (`apps/web` / `@cabzone/web`): Desktop-first portal for operations, city admins, dispute management, and configuration.
2. **Mobile Applications** (Roadmap: `apps/rider-mobile` & `apps/driver-mobile`): End-user applications for riders and drivers.

---

## Admin Web Console (`apps/web`)

The Admin Web application is built on **Next.js 15 (App Router)**, **React 19**, and **Tailwind CSS v4**, exporting a standalone Docker runtime image.

### Directory Structure

```text
apps/web/
├── src/
│   ├── app/                    Next.js App Router (layout, pages, error/loading states)
│   │   ├── (auth)/             Authentication routes (login, OTP)
│   │   ├── (panel)/            Protected operational screens
│   │   │   ├── drivers/        Driver onboarding, KYC, document verification
│   │   │   ├── zones/          Geographic polygon editor & zone rules
│   │   │   ├── pricing/        Pricing configuration & vehicle-type matrices
│   │   │   ├── rides/          Live and historical ride tracking
│   │   │   └── finance/        Driver wallet settlements, ledger, disputes
│   │   ├── globals.css         Tailwind CSS v4 root stylesheet
│   │   └── layout.tsx          Root HTML layout & theme configuration
│   ├── components/             Reusable UI primitives (tables, dialogs, badges, inputs)
│   ├── features/               Domain feature modules (screens, hooks, feature logic)
│   └── lib/
│       └── api/                API client SDK (unwrapping HttpSuccessBody, handling ApiError)
├── next.config.ts              Standalone output, transpilePackages: ['@cabzone/contracts']
├── postcss.config.mjs          PostCSS configuration for Tailwind CSS
├── tsconfig.json               TypeScript configuration extending @cabzone/config
└── Dockerfile                  Multi-stage build generating Next.js standalone server
```

---

## Feature Ownership & State Separation

Each operational domain inside `src/features/` encapsulates:

- Feature-specific UI views and dialogs.
- Custom query hooks (server-state management).
- Validation schemas and local mutations.

### State Categories

1. **Server State**: Managed via fetcher hooks, caching API responses and handling loading/error states.
2. **Form State**: Local component state managing uncommitted inputs before submission.
3. **UI State**: Transient modal, drawer, and tab selections.
4. **Authentication State**: Session access token and authenticated admin identity.

---

## API & Wire Boundary

All network requests from `apps/web` communicate via the unified API client in `src/lib/api/client.ts`, which consumes types directly from `@cabzone/contracts`:

- Automatically unwraps standard `HttpSuccessBody<T>` envelopes.
- Maps error payloads to typed `ApiError` instances containing machine-readable `FaultCode` values.
- Never directly contacts databases or internal infrastructure.
