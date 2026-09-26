# Discovery — credit-with-friends

Phase 0a. Lightweight on purpose: no .factory ceremony until client sign-off.

## Problem

Indian shoppers regularly see bank-card offers (for example "10% instant
discount with HDFC Bank credit cards") on cards they do not hold. Today the
workaround is to WhatsApp friend after friend and relative after relative
asking "who has an HDFC card?", and to repeat that broadcast on every purchase.
The hard part is not finding the offer (it is on the product page); it is
finding which trusted person holds the card.

Observed where: the client's own purchases; the informal "who has an X card"
message is common in Indian WhatsApp groups, especially around sale events and
big-ticket buys.

Corrected premise: using a friend's card does not improve the requester's
credit score. The card holder's incentive is reward points, spend milestones
and fee waivers; a large purchase can briefly raise their utilization.

## Stakeholders

- **Arihant (client, builder)** — originator of the idea and sole approver of
  decisions and client sign-off.
- **Early users** — the client's own community: friends, relatives, colleagues.

## Goal

A small-group MVP that tests whether the idea is worth pursuing. A wider
product attempt is a possible later step, gated on the MVP result (and an
`/office-hours` pass before that step).

Success bar:
1. It spreads in the client's own network: members invite others unprompted.
2. It gets real use through one sale season (joins, cards listed, searches,
   WhatsApp contacts initiated).
3. Later: check whether people outside the client's network find it useful.

## Client-approved decisions

Each becomes docs/decisions/NNNN-<slug>.md via: ./forge decision new <slug>

- [ ] **Small-group MVP first** — validate within trusted circles before any
  wider product attempt.
- [ ] **India market** — bank offers, UPI and the DPDP Act frame the design.
- [ ] **Friend places the order** — the card holder buys on their own account;
  card details are never shared; repayment happens via UPI outside the app.
- [ ] **Directory + WhatsApp only** — the app finds matching card holders and
  opens WhatsApp with a card-only prefilled message; no in-app request flow.
- [ ] **Mobile-first web app** — responsive/installable web, spread via
  WhatsApp-shared links; no native app for the MVP.
- [ ] **Card entry = bank + credit/debit + optional variant** — bank from a
  fixed list of Indian banks, variant free text; never card numbers.
- [ ] **Circles via invite link** — creator is admin (remove members, reset the
  link); anyone can leave; all of a member's cards are visible in all their
  circles.
- [ ] **Google sign-in + self-entered WhatsApp number** (unverified).
- [ ] **First-party usage counters** — joins, invites, cards listed, searches,
  WhatsApp taps; admin view for the client only; no third-party trackers.
- [ ] **Free-tier hosting only.**

## Prototype notes (phase 0b)

None yet.
