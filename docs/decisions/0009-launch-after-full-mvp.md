---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: []
---

# Invite real members only after the whole MVP roadmap ships

## Context
The privacy notice shown at onboarding (Accounts spec, story CWF-1) promises
self-service account deletion, but deletion (CWF-5) can only be built after
circles, cards and search exist. Letting real people sign up earlier would
make that promise false until CWF-5 ships. The sign-off grill flagged the
missing release boundary.

## Decision
Real members are invited only once every roadmap story (CWF-1 to CWF-6) has
shipped. Until then, only the owner uses the app, for testing.

## Consequences
- Every privacy-notice promise, including deletion, holds from the first real
  sign-up.
- No early friend testing on intermediate builds; feedback waits for the full
  MVP.
- No manual-deletion fallback or interim notice wording is needed.
