---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: []
supersedes: 0004-mobile-web-free-tier
---

# Mobile-first web app with a hosting budget up to INR 2,000 per month

## Context
Decision 0004 required free hosting tiers only. Researching hosts on
2026-09-27 showed that free tiers either sleep (about a minute to wake, which
breaks the under-a-minute target outcome), expire, pause after inactivity, or
lack database backups. The owner stated that roughly INR 1,000 to 2,000 per
month is acceptable when it adds real value to the MVP, and that free tiers
remain preferred when they are equally good.

## Decision
The MVP remains a mobile-first, installable web app spread through
WhatsApp-shared links, with no native app. Running costs may total up to
INR 2,000 per month where they clearly add value (always-on hosting, managed
backups, a custom domain); a free option is used whenever it is equally good.

## Consequences
- Always-on paid hosting and managed database backups become possible.
- The BRIEF constraint "free hosting tiers only" is replaced by this budget.
- Contact sync and push notifications stay out of the MVP.
- Any change pushing costs above INR 2,000 per month needs a new decision.
