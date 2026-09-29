# Architecture handoff guide

CreditWithFriends is a validation MVP (decision 0001): a mobile-first,
installable web app where trusted circles list which bank cards they hold, so a
shopper can find a card holder and message them on WhatsApp. It may be
redesigned from scratch if the idea proves out, so the architecture optimises
for shipping the confirmed specs safely, not for scale.

## Reading order

1. `10-system-overview.md` — stack, repo layout, runtime topology,
   environments, configuration, deploys.
2. `11-data-model.md` — tables, relationships, constraints, naming.
3. `12-auth-sessions-security.md` — Google sign-in, sessions, CSRF, headers,
   rate limits, input validation, logging.
4. `13-privacy-deletion-jobs.md` — visibility enforcement, account deletion
   transaction, usage events, the daily cleanup job.
5. `90-constitution-deviations.md` — deliberate departures from
   `constitution/` and the current Forge guidance, with reasons.

## Binding inputs

- Product scope: `docs/product/BRIEF.md`, confirmed specs in `docs/specs/`,
  roadmap `plans/roadmap.json` (CWF-1 to CWF-6).
- Accepted decisions in `docs/decisions/` override these docs where they
  conflict (`docs/architecture/README.md`).
- The constitution binds every executor; deviations are listed in
  `90-constitution-deviations.md` and backed by accepted decisions.

## Implementation priorities

- Build in roadmap order; each story cites the sections here that it uses.
- Privacy rules are enforced on the server, never only in the UI.
- Prefer the simplest implementation that satisfies the spec (Ponytail,
  `AGENTS.md`).
