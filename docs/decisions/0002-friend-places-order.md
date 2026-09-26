---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Card holder places the order; app never touches money or card details

## Context
"Using a friend's card" can mean sharing card details (which breaches
cardholder agreements and is a fraud vector) or the friend placing the order
themselves. Collecting or holding repayments inside the app would pull it
toward regulated payment activity.

## Decision
The card holder places the order on their own account with their own card; the
requester repays them via UPI outside the app. The app never collects, stores
or displays card numbers, CVV, expiry or OTPs, and never moves or holds money.

## Consequences
- No payment integration and no PCI-DSS scope.
- The invoice, warranty and refunds sit in the card holder's name; the app
  does not solve that.
- The app shows a clear "never share card numbers or OTPs" warning.
- Repayment risk is left to the friends; trusted circles contain it.
