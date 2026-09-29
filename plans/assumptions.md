# Implementation Assumptions Ledger

One row per assumption made during implementation (`forge plan assume`).
The orchestrator reviews open rows and guides:
`./forge assumptions resolve <id> --status confirmed|fix-needed|promoted --notes "..."`.
`pr_ready.py` refuses while the task has rows at `open` or `fix-needed`.

| id | date | issue | assumption | status | guidance |
|----|------|-------|------------|--------|----------|
| A-0001 | 2026-09-27 | CWF-1 | Pin Turbo's local cache under this checkout because the default resolves to an unwritable parent in the Windows worktree. | confirmed | Checked: root scripts pass --cache-dir .turbo/cache and .gitignore already ignores .turbo, so the cache stays inside the checkout, is never committed, and avoids the unwritable default path in Windows worktrees. No contract or scope impact. |
| A-0002 | 2026-09-27 | CWF-1 | Local Docker PostgreSQL uses host port 5433 because port 5432 is occupied; CI continues to use its own PostgreSQL on 5432. | confirmed | Verified on the host: a native PostgreSQL service owns 5432, Compose now maps 5433:5432, .env.example and the local test fallback use 5433, and CI keeps its own service on 5432 via DATABASE_URL. Integration suite passed 10/10. |
