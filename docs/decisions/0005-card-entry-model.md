---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Card entry is bank + credit/debit + optional variant

## Context
Indian bank offers are usually bank-level ("HDFC Bank credit cards"),
sometimes variant-specific, and often include debit cards. Search has to match
reliably without the app maintaining a full card catalog.

## Decision
A card is a bank (chosen from a fixed list of Indian banks) + credit or debit
+ an optional free-text variant name. Search matches on bank and type, and on
variant when the user specifies one. Card numbers are never collected.

## Consequences
- We maintain a list of Indian banks, not a card-product catalog.
- Variant matching is best-effort because it is free text.
- Card network (Visa/Mastercard/RuPay/Amex) is not captured in the MVP.
