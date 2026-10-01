---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: []
---

# Host on Render Singapore and Cloudflare Pages with a .in domain

## Context
Hosting research on 2026-09-27 compared Render, Railway, DigitalOcean
(Bangalore), Fly.io, Koyeb, Cloud Run, Lightsail and several managed
PostgreSQL providers against the priorities: low latency for India, no cold
starts, managed backups, push-to-deploy, HTTPS on a custom domain, within
INR 2,000 per month (decision 0011). The owner prefers India for data but
accepts Singapore.

## Decision
- API: Render Starter web service in Singapore, always on.
- Database: Render Postgres (PostgreSQL 18) Basic plan in Singapore, on the
  same private network as the API.
- Web app: Cloudflare Pages (free).
- Domain: a `.in` domain bought by the owner; web at the apex, API at
  `api.` subdomain.
- The daily cleanup job runs inside the API process.

## Consequences
- Estimated INR 1,400 to 1,600 per month including GST; Render prices were
  read from third-party sources and must be checked at signup.
- Data is stored in Singapore, not India; the privacy notice should say where
  data is stored.
- Backups: corrected by decision 0017 (3-day point-in-time restore; no
  automatic daily backups; manual copies kept 7 days), which the privacy
  notice's backup statement must match.
- Render Hobby includes 5 GB of outbound bandwidth per month; the web app is
  served by Cloudflare so the API alone uses it.
- The owner creates the Render, Cloudflare and Google Cloud accounts and buys
  the domain; agents never handle those credentials.
