---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-27
stories: [CWF-1]
---

# openid-client for Google sign-in and libphonenumber-js for WhatsApp numbers

## Context
CWF-1 needs Google sign-in with server-side sessions (decision 0014) and
WhatsApp numbers validated and normalised to E.164 for any country, defaulting
to +91 (Accounts spec). The harness default is `@nestjs/passport` with
`passport-jwt`, which targets JWT bearer auth that this project does not use.
Hand-written phone validation would miss country-specific rules.

## Decision
Use `openid-client` (an OpenID Certified relying-party library) for Google's
authorization-code flow with PKCE, state and nonce, and `libphonenumber-js` to
validate and normalise WhatsApp numbers to E.164. No Passport strategy is used.

## Consequences
- Google sign-in follows the OpenID Connect standard, and switching providers
  later stays a configuration change.
- `libphonenumber-js` adds a moderate dependency to the API and web app; the
  web app can use its smaller metadata set.
- Reviews citing the harness Passport/JWT convention are answered by this
  decision and decision 0014.
