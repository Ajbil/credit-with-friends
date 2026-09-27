# Authentication, sessions and security

## Google sign-in

- OAuth 2.0 authorization-code flow with PKCE, run by the API
  (`/api/v1/auth/google/start` and `/api/v1/auth/google/callback`), requesting
  only `openid email profile`. A signed, short-lived `state` value carries the
  return path (for example a pending invite) and protects the callback.
- The Google OAuth client is set to publishing status "In production"; basic
  scopes need no Google app verification. The authorized domain is the
  project's `.in` domain.
- The stable Google account ID (`sub`) identifies the person; email changes do
  not create a new account.
- On callback: if a `Member` exists for `sub`, a member session is created;
  otherwise a `PendingSignIn` is created or refreshed and a pending session is
  created that can reach only onboarding, cancel and sign-out.

## Sessions

- A session is a random 32-byte token in an `HttpOnly`, `Secure`,
  `SameSite=Lax` cookie scoped to `api.yourdomain.in`; the database stores only
  its hash.
- Idle expiry 30 days, refreshed on use; an expired or unknown token gets 401
  and the web app shows the sign-in screen.
- Sign-out deletes the current session row only. Account deletion deletes every
  session of the member in the same transaction, so old cookies stop working
  immediately and cannot recreate data.
- Every request resolves the session to a member (or pending sign-in) before
  any handler runs; handlers never trust ids sent by the client for identity.

## Cross-site request forgery and CORS

- CORS allows exactly `WEB_ORIGIN`, with credentials.
- State-changing requests (POST, PATCH, DELETE) must carry the
  `X-Requested-With: cwf` header and an `Origin` equal to `WEB_ORIGIN`;
  otherwise 403. Together with `SameSite=Lax`, this blocks cross-site forms.

## HTTP hardening

- HTTPS only (Render and Cloudflare terminate TLS); HSTS enabled.
- Helmet on the API; strict Content-Security-Policy on the web app (self,
  plus the API origin for `connect-src`).
- Swagger UI is served only when not in production; the OpenAPI file is
  committed to the repo.

## Rate limits

In-memory per-IP and per-member limits (single instance): sign-in start and
callback 10 per minute, join 20 per minute, search 60 per minute, everything
else 100 per minute. Exceeding a limit returns 429 in the standard error
format.

## Input validation and errors

- Global validation pipe with whitelist and forbid-non-whitelisted; every
  string has a maximum length; DTOs for every request and response.
- Responses use the constitution envelope `{ success, data, error }` and the
  error payload in `constitution/07-exception-handling.md`; stack traces, SQL
  and library messages never reach clients.

## Logging

- Structured JSON logs (pino) to stdout, read in Render's log viewer.
- No personal data in logs: no names, emails, WhatsApp numbers, card variants
  or Google IDs; members appear only by internal UUID, and not at all after
  deletion.
- No third-party error or analytics service (decision 0008 and the deviations
  decision).

## Secrets and dependencies

- Secrets live only in Render and Cloudflare environment settings and local
  `.env` files that are git-ignored.
- CI runs `pnpm audit --prod` and fails on high or critical advisories.

## Test sign-in

A `POST /api/v1/test-auth/sign-in` route exists only when
`TEST_AUTH_ENABLED=true` (local and CI) and is never compiled into production
routing, so end-to-end tests do not need real Google accounts.
