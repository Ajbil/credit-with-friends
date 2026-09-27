---
status: superseded
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
superseded_by: 0011-mobile-web-hosting-budget
---

# Mobile-first web app on free hosting tiers

## Context
Friends must be able to join from a link shared in a WhatsApp group with no
friction. A native app would enable contact sync and push notifications but
adds app-store friction and build time. The MVP has no budget.

## Decision
Ship a mobile-first responsive (installable) web app, hosted on free tiers
only.

## Consequences
- No contact sync and no push notifications in the MVP.
- Stack and hosting choices must fit free-tier limits (dozens to hundreds of
  users).
- A native app is reconsidered only if the MVP succeeds.
