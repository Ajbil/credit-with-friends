# credit-with-friends — BRIEF.md

## Summary

A mobile-first web app where people in trusted circles list which bank cards
they hold, so that when a shopper sees a bank-card offer on a card they don't
have, they can instantly find who in their circles holds it and message that
person on WhatsApp in one tap, instead of broadcasting "who has an X card?" to
everyone. It is a small-group MVP to test whether the idea is worth building
further.

## Users

- **Shopper** — sees a bank-card offer and wants to find a trusted card holder fast.
- **Card holder** — lists their cards and gets contacted by circle members; places the order and is repaid via UPI.
- **Circle admin** — creates a circle, shares its invite link, removes members, resets a leaked link.
- **Owner (Arihant)** — watches usage counters to judge whether the MVP succeeds.

## Target Outcome

A circle member who wants an offer on a card they don't hold can go from
"I need an HDFC credit card" to a WhatsApp chat with a circle member who holds
one in under a minute, without broadcasting to everyone they know.

## Key Flows

1. **Join** — User opens a circle invite link, signs in with Google, enters their WhatsApp number, accepts the privacy consent, is returned to the invite, and becomes a circle member by pressing Join.
2. **List cards** — Member adds cards as bank (from a fixed list) + credit/debit + optional variant name; can edit or remove them. Never a card number.
3. **Create and share a circle** — Member creates a circle, becomes its admin, and shares its invite link on WhatsApp; admin can remove members or reset the link; any member can leave.
4. **Find a card holder** — Member searches by bank + credit/debit (+ variant if needed) and sees matching card holders across all their circles.
5. **Contact** — Member taps a card holder to open WhatsApp with a card-only prefilled message; the order and UPI repayment happen outside the app.
6. **Track usage** — Owner views counts of joins, invites, cards listed, searches and WhatsApp taps, per circle.
7. **Delete account** — Member deletes their account and their cards and circle memberships go with it.

## Domain Concepts

- **Member** — a person who has completed onboarding (Google sign-in, WhatsApp number, 18+ confirmation, consent); someone merely signed in is not yet a member. Related to: Card, Circle.
- **Card** — a bank + credit/debit + optional variant held by one member. Related to: Member, Bank.
- **Bank** — an entry in a fixed list of Indian banks. Related to: Card.
- **Circle** — a named group joined by invite link; has one admin. Related to: Member, Invite link.
- **Invite link** — a resettable link that admits people to a circle. Related to: Circle.
- **Usage event** — a counted action (join, invite, card listed, search, WhatsApp tap). Related to: Member, Circle.

## Constraints

- India only; comply with the DPDP Act: explicit consent at signup, account deletion, store only what is needed.
- Never collect or store card numbers, CVV, expiry or OTPs; the app tells users never to share them.
- The app never moves or holds money; repayment is off-platform (UPI).
- A member's cards are visible only to members of circles they belong to.
- Google sign-in; the WhatsApp number is self-entered and unverified.
- Usage counters are first-party only; no third-party trackers.
- Runs on free hosting tiers only.
- Real members are invited only once every roadmap story has shipped, so every privacy-notice promise, including self-service account deletion, holds from the first sign-up; the owner may test earlier builds alone.
- The owner's Google account ID and contact address are deployment configuration, set before the first circle is created.
- Mobile-first: usable on a phone browser opened from a WhatsApp link.

## Out of Scope

- Offer data or offer aggregation (the shopper already sees the offer)
- In-app request/accept flow or request tracking
- Payments, reimbursement handling or money movement
- Native mobile apps, contact sync, push notifications
- Friends-of-friends visibility, public profiles, strangers
- Choosing which circles see which card
- Monetization

---

<!-- STOP. That's it. Everything below this line gets DERIVED, not written by you.

What gets derived from this plan:
- Feature nodes (from Flows)
- Requirement nodes (from Features + Constraints)
- Task nodes (from Requirements → implementable files)
- Data models (from Domain Concepts + confirmed Requirements)
- API endpoints (from confirmed Task nodes)
- Frontend pages (from Flows + confirmed Task nodes)
- Build order (topological sort of the task graph)
- Contradiction checks (graph vs conventions)

If you're writing Prisma schemas, API endpoint tables, or page specs in BRIEF.md,
you're doing the graph's job by hand. Stop. Keep this document under 1 page. -->
