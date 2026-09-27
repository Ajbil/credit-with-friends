---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: [CWF-1]
---

# Owner-only production through a launch switch and email allowlist

## Context
Decision 0009 keeps production owner-only until every roadmap story ships, but
CWF-1 deploys a publicly reachable app with Google sign-in. The CWF-1 plan
grill found nothing that stops a stranger who finds the domain from
onboarding. Options considered: an in-app allowlist, Cloudflare Access in front
of the web app (does not protect the API host, adds a second login), or no gate.

## Decision
The API reads a `LAUNCH_OPEN` switch and a `PRELAUNCH_ALLOWED_EMAILS` list from
deployment configuration. While `LAUNCH_OPEN` is false, a Google sign-in whose
verified email is not on the list is refused with a "Not open yet" screen and
nothing about that person is stored; listed people continue normally. Setting
`LAUNCH_OPEN` to true opens sign-up to everyone.

## Consequences
- Decision 0009 is enforced by the app, and the owner can add a few testers by
  email before launch if they choose.
- The email is used only for this gate; identity remains the Google account ID.
- Launching is a configuration change plus a restart, with no code change.
- The gate is tested in CWF-1 like every other criterion.
