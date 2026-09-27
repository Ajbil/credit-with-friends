---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: []
---

# Deliberate constitution deviations for the validation MVP

## Context
The constitution permits deliberate, stated deviations. Several standards
conflict with the confirmed specs or the MVP constraints: soft delete and
account audit columns versus real erasure of personal data; AWS and Terraform
versus the INR 2,000 budget; a Redis job queue versus a single small server;
staging versus owner-only production before launch; central third-party
logging versus decision 0008; provider-validated tokens versus sessions that
account deletion must end; and a 100% coverage gate versus MVP speed. The
owner chose to follow the constitution and waive only these
infrastructure-heavy parts.

## Decision
For this MVP, the deviations listed in
`docs/architecture/90-constitution-deviations.md` apply: hard delete for
personal-data tables and no actor audit columns on usage events; Render and
Cloudflare instead of AWS and Terraform; an in-process daily job instead of
BullMQ and Redis; Local and Production environments only; host logs without a
third-party error service; server-side sessions in PostgreSQL; a test for
every acceptance criterion plus core end-to-end tests instead of a coverage
gate; pnpm/Turborepo instead of Nx. All other constitution rules apply.

## Consequences
- A review finding that asks for one of these standards is answered by citing
  this decision.
- Moving beyond the MVP (more instances, staging, real traffic growth) means
  revisiting at least the jobs, rate-limiting, environments and hosting
  deviations.
- Code structure rules (modules, DTOs, repositories, error format, Swagger,
  naming) still apply in full.
