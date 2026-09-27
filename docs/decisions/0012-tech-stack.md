---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: []
---

# NestJS, React/Vite and PostgreSQL/Prisma in a pnpm/Turborepo monorepo

## Context
The constitution's coding, API and database standards cover NestJS and
FastAPI, and the vendored harness conventions target NestJS, React/Vite,
Prisma and PostgreSQL in a pnpm/Turborepo monorepo. Every task review checks
code against the constitution. Next.js or a backend-as-a-service (Supabase,
Firebase) would fit free tiers slightly better but would be standing
deviations that reviews keep flagging. The MVP may be redesigned later, so
reuse beyond the MVP is not a goal.

## Decision
Build a NestJS modular monolith API, a React + Vite installable web app and a
PostgreSQL 18 database accessed through Prisma, all in TypeScript, in a pnpm
workspaces + Turborepo monorepo (`apps/api`, `apps/web`, `packages/shared`),
as described in `docs/architecture/10-system-overview.md`.

## Consequences
- Reviews, conventions and the harness scaffold prompt apply without
  translation.
- The API needs an always-on server host (see the hosting decision).
- More structure (modules, DTOs, repositories, service bus) than a minimal
  app; implementation is delegated to Codex, so the cost is review time rather
  than owner effort.
