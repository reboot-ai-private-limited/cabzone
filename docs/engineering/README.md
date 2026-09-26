# cabzone Engineering Handbook

This directory contains engineering standards for building **cabzone** from approved product requirements and architecture decisions.

## Documents

| Document                                                             | Purpose                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| [`tech-choices.md`](tech-choices.md)                                 | Records technology decisions and their status            |
| [`monorepo-layout.md`](monorepo-layout.md)                           | Repository structure, apps vs packages, zero-build rules |
| [`clean-architecture-and-solid.md`](clean-architecture-and-solid.md) | Layering and dependency rules                            |
| [`module-anatomy.md`](module-anatomy.md)                             | Internal module structure and `.public.ts` contracts     |
| [`adding-a-module.md`](adding-a-module.md)                           | Procedure for introducing a new module                   |
| [`frontend-architecture.md`](frontend-architecture.md)               | Web/admin frontend structure (`apps/web`, Next.js 15)    |
| [`mobile-in-monorepo.md`](mobile-in-monorepo.md)                     | Rider/Driver mobile application integration roadmap      |
| [`shared-packages.md`](shared-packages.md)                           | Rules for shared code and zero-build packages            |
| [`coding-standards.md`](coding-standards.md)                         | Code quality, integer paise money, and naming rules      |
| [`design-language.md`](design-language.md)                           | Product UI design language, tokens, and density          |
| [`testing.md`](testing.md)                                           | Testing strategy (unit, integration, contracts)          |
| [`boundaries-and-enforcement.md`](boundaries-and-enforcement.md)     | Rules mechanically enforced via `dependency-cruiser`     |
| [`build-and-deploy.md`](build-and-deploy.md)                         | Build, Docker compose workflows, and CI/CD pipelines     |

## Important Source Boundary

The cabzone PRD defines product behavior. It does not define the complete technical stack.

Therefore:

- Product requirements come from [`prd.md`](../prd.md).
- Product decisions come from [`decision-log.md`](../decision-log.md).
- Engineering choices in this handbook are documented standards or proposals pending milestone rollout.
- Do not treat a technology mentioned here as a requirement of the PRD unless the decision log says it has been selected.

## Core Product Boundary

cabzone contains:

- **Rider Mobile App** (Roadmap)
- **Driver Mobile App** (Roadmap)
- **Admin Web Dashboard** (`apps/web`, `@cabzone/web`)
- **Backend API & Queue Worker** (`apps/api`, `@cabzone/api`)

Core product areas include driver verification, rider authentication, zones, pricing, negotiation, dispatch, ride execution, payments, wallet/commission, ratings, trust, history, and disputes.
