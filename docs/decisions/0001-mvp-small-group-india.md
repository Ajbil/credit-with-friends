---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Small-group MVP first, India market

## Context
The idea (find which trusted person holds a bank card with a live offer) comes
from the client's own repeated pain of WhatsApp-broadcasting "who has an X
card?". As a mass product it is weak: usage is episodic (sales, big-ticket
buys), trust-bound, and hard to monetize. As a small-group tool it is cheap to
test. Bank offers, UPI repayment and the DPDP Act are India-specific.

## Decision
Build a small-group MVP for the client's own community in India to test the
idea. Success = members invite others unprompted and the app gets real use
through one sale season; reaching people outside the network is a later check.

## Consequences
- Design for trusted circles of roughly 5–50 people, not strangers.
- No monetization, growth engineering or offer data in the MVP.
- A wider product attempt is a separate, later decision, preceded by an
  `/office-hours` pass.
- DPDP Act consent and deletion obligations apply from day one.
