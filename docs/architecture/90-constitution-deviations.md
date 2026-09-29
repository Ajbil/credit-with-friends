# Constitution and harness deviations

The constitution allows deliberate, stated deviations (`constitution/README.md`).
These apply to this validation MVP and are backed by the accepted decision on
MVP deviations. Current guidance is in `constitution/` and `AGENTS.md`.

| Standard | Deviation | Reason |
|---|---|---|
| Soft delete for deletable tables and `created/modified/deletedByAccountId` audit columns (`pnp-database-standards.md`) | Personal-data tables (`Member`, `PendingSignIn`, `Session`, `Consent`, `Card`, `CircleMembership`, `CircleRemovalBlock`) are hard-deleted and carry no account audit columns. `UsageEvent` has no actor audit columns; its member links become null on deletion. `Circle` keeps soft delete. | The Accounts spec requires real erasure and events without member identifiers; `pnp-api-standards.md` allows hard delete when explicitly required. |
| AWS organisation, sub-accounts and Terraform (`aws-*.md`, `terraform-iac.md`); AWS CDK (harness) | Render and Cloudflare Pages managed hosting, configured in their dashboards; no infrastructure-as-code for the MVP. | Budget cap of INR 2,000 per month and MVP scope. |
| BullMQ + Redis for jobs, no in-process cron (harness `workers.md`) | One daily job via `@nestjs/schedule` inside the single always-on API instance. | No extra paid service; a single instance cannot double-run the job. |
| Staging and production environments (`00-agentic-development-workflow.md`, harness CI) | Local and Production only. | Production is owner-only until launch (decision 0009); add staging later if needed. |
| Central logging such as CloudWatch or Sentry (`05-logging-and-observability.md`, harness `logging.md`) | Structured JSON logs in Render's log viewer; no third-party error service. | Decision 0008 and minimal data sharing. |
| Provider-validated JWTs, "no custom token issuance" (harness `architecture.md`, `security.md`) | Server-side sessions in PostgreSQL with an HttpOnly cookie. | Specs require per-device sign-out and deletion that ends every session immediately. |
| 100% line-coverage gate (harness `testing.md`, `ci-pipeline.md`) | Every acceptance criterion has a test plus end-to-end tests for core flows; no coverage threshold. | Owner's choice for MVP speed; criterion-level proof is what Forge records. |
| Nx recommended (`01-monorepo-standard.md`) | pnpm workspaces + Turborepo. | The harness scaffold, linters and conventions target Turborepo. |
| Real Redis in integration tests (harness `testing.md`) | Not applicable; there is no Redis. | Follows from the jobs deviation. |
