---
status: proposed
confirmed_by: ""
date: 2026-10-01
stories: [CWF-1]
supersedes: ""
---

# Render backups: 3-day point-in-time restore, manual copies kept 7 days

## Context
Decision 0013 said the Render database has "3-day point-in-time restore and
daily backups kept 7 days", and privacy notice version 1 was drafted from that.
On 2026-10-01 the owner checked Render's backup docs. On the Hobby account plan,
the database can be restored to any point in the past 3 days, but Render makes
no automatic daily backups. Its logical backups are copies someone takes by
hand, and each one is kept for 7 days.

## Decision
- We rely on Render's 3-day point-in-time restore and promise no automatic
  daily backups.
- A manual logical backup is taken before each production database migration,
  and Render keeps it for 7 days.
- The privacy notice says the provider can restore the database to any point in
  the past 3 days, and any backup copy made by hand is kept for 7 days.

## Consequences
- This corrects the backup bullet in decision 0013; the rest of 0013 stands.
- Deleted data can survive for up to 3 days in point-in-time restore, and for up
  to 7 days in a manual copy taken in that window.
- The deployment runbook (CWF-1 T6) lists the manual backup step before each
  migration.
- A plan change at Render that alters these periods needs a new notice version.
