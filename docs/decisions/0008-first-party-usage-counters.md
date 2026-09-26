---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# First-party usage counters for the success bar

## Context
The success bar (spread through the network, real use through a sale season)
needs evidence, but the directory-plus-WhatsApp model (decision 0003) cannot
observe whether requests happen. Third-party analytics add a tracker and extra
consent surface.

## Decision
Record first-party counts in the app's own database: joins, invites, cards
listed, searches and WhatsApp-link taps, per circle. Only the owner (Arihant)
can see them, in a small admin view. No third-party trackers.

## Consequences
- WhatsApp taps are a proxy for requests, not proof of completed orders.
- Counters are covered by the signup privacy consent and removed or anonymized
  on account deletion.
- An owner-only admin role is needed.
