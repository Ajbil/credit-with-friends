---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Card-holder directory with WhatsApp contact, no in-app requests

## Context
The core job is finding which trusted person holds card X; the shopper already
sees the offer on the product page. Options were a full in-app request flow
(accept/decline, repayment tracking), a directory plus WhatsApp, or in-app
requests with push notifications.

## Decision
The app is a directory: search by bank + credit/debit (+ optional variant),
see matching card holders across your circles, and tap to open WhatsApp with a
card-only prefilled message. There is no in-app request, accept or tracking
flow, and no offer data.

## Consequences
- Much smaller build; WhatsApp is the notification and conversation channel.
- The app cannot see whether a request succeeded; the success bar relies on
  proxy counters (decision 0008).
- Offer aggregation stays out of scope.
