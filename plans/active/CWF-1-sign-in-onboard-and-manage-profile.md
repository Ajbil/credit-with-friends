# Sign in, onboard and manage profile

## What and why

This first story builds the app's foundation and its front door. Afterwards a
person can open the app on a phone, sign in with Google, give a name, a
WhatsApp number and an 18+ confirmation, accept the privacy notice, install the
app to the home screen, and manage their profile, all live on your own domain.
Every later story needs a signed-in, consenting member, so this comes first.

## What changes for you

- The app runs at your `.in` domain; on your phone you sign in with Google,
  finish a one-screen onboarding and can install it like an app.
- Until launch, only emails you list can sign in; anyone else sees "Not open
  yet" and nothing about them is stored.
- A profile screen shows your name, WhatsApp number, email and your own Google
  account ID (which you need for the owner setting); you can edit name and
  number, and sign out of one device.
- A plain-English privacy notice, version 1, is drafted for your approval.
- Circles, cards and search come in later stories.

## Done when

- Every CWF-1 acceptance criterion is proven by an automated test on the
  screens and endpoints this story builds; the circle, card and search parts of
  those criteria are proven again by those stories through the same checks.
- The app is deployed at your domain, you have signed in with your own Google
  account on your phone and installed it, and a non-listed account is refused.
- All task pull requests are merged with CI green.

## Risks

- Account setup (domain, Render, Cloudflare, Google sign-in client) could
  stall the final task; you do it in parallel with the build, from a checklist.
- Render's prices came from third-party sources; confirm them at signup.
- Sign-in depends on the web app and API sharing one domain; a misconfigured
  cookie or redirect breaks it. The production check covers this.
- The foundation task sets patterns every later story inherits, so its review
  focuses on structure.

## What I need from you

- While the first three tasks are built: buy the `.in` domain and create the
  Render (with payment), Cloudflare and Google Cloud accounts using the
  deployment checklist. You enter every secret directly into Render or
  Cloudflare; share only non-secret values such as the domain, your contact
  email and the allowed emails.
- Approve the exact privacy notice text in its pull request.

---

## Technical approach

- Scaffold from the harness scaffold prompt with the accepted architecture
  deviations: pnpm workspaces and Turborepo, a NestJS API, a React and Vite web
  app, a shared package, Docker Compose PostgreSQL 18 only (no Redis), and no
  AWS CDK. The scaffold must not overwrite Forge's root agent, workflow or docs
  files; the Symphony workflow and docs-copy steps are skipped.
- API foundation: validated configuration, structured logs without personal
  data, the constitution response and error format through one global filter,
  Helmet with HSTS, CORS limited to the web origin, the custom-header and
  Origin check on state-changing requests, rate limits, strict validation,
  Swagger outside production with a committed OpenAPI file, a health endpoint,
  and Prisma with constitution naming and UUIDv7 keys. CI runs lint, types,
  unit, integration against PostgreSQL 18, end-to-end, build, a production
  dependency audit and an OpenAPI diff check. The in-process service bus is
  added in CWF-2, when the first cross-module call appears.
- Accounts: Google sign-in with authorization code, PKCE, state and nonce
  through `openid-client`, and E.164 WhatsApp numbers through
  `libphonenumber-js`. The signed state carries a return path through Google
  and onboarding, which CWF-2 uses for invite links. The pre-launch gate
  refuses non-listed emails before anything is stored. Onboarding submission is
  one transaction that creates the member and consent, removes the pending
  identity and upgrades the session; a concurrent duplicate gets a conflict and
  the web app continues as the existing member. Sessions have a 30-day idle
  expiry refreshed on use; an expired or unknown session gets 401 and the
  sign-in screen. Google tokens are not kept, so revoking Google access takes
  effect when the session expires or at the next sign-in.
- One shared guard lets only completed members reach member routes, and a
  member's own-profile response is the only one carrying email and Google
  account ID; later stories' routes reuse both.
- Privacy notice versions are published by a database migration. When the
  latest version is flagged as a material change, every member route except
  reading and accepting the notice and signing out returns a
  notice-acceptance-required error until the member accepts. Version 1 states
  that data is stored in Singapore and the backup periods (3-day point-in-time
  restore, 7-day daily backups), and is published only after you approve it.
- Owner ID bootstrap: the API boots without the owner ID; you sign in, copy
  your ID from the profile and set it before any circle exists.
- Web: TanStack Router and Query, Tailwind and shadcn/ui, an orval client from
  the OpenAPI file, a service worker caching only the app shell, and a strict
  Content-Security-Policy served by Cloudflare Pages; screens for sign-in,
  not-open-yet, onboarding, profile, re-acceptance and session expiry, designed
  mobile-first.
- Deployment: Render and Cloudflare configured in their dashboards (no
  infrastructure-as-code), recorded in a deployment runbook that lists every
  setting, who supplies it and how it is checked; API and database in
  Singapore with migrations run before each deploy; DNS for the domain and its
  API subdomain; Google sign-in client in production status.
- Four tasks rather than two: the foundation and the accounts API together
  exceed one bounded session, and deployment waits on your accounts and is
  verified separately.

## Task decomposition

| Task | Outcome |
|---|---|
| Monorepo and API foundation | Repo scaffold, API skeleton with configuration, logging, error format, security middleware, database tooling and health check; CI with every check including audit and OpenAPI diff |
| Accounts API | Google sign-in with pre-launch gate, pending sign-ins, sessions, onboarding with consent, profile, sign-out, notice publishing and re-acceptance, daily cleanup and test sign-in |
| Web app: sign-in, onboarding and profile | Installable mobile-first screens for sign-in, not-open-yet, onboarding, consent, profile, re-acceptance and session expiry, with privacy notice version 1 and a strict content policy |
| Production deployment | Deployment runbook, Render and Cloudflare configured, domain and Google sign-in live, production check passed |

## Verify plan

- Unit and integration tests against a real PostgreSQL cover each acceptance
  criterion: single account per Google ID across email changes; no member
  before onboarding and the member-only guard; validation limits; concurrent
  onboarding; notice text, version storage and material-change blocking;
  cancel and 30-day erasure; idle expiry, refresh and 401; profile edits and
  rejection of invalid values; email and Google ID absent from non-own
  responses; per-device sign-out; the pre-launch gate storing nothing for
  refused emails; the return path surviving sign-in and onboarding.
- Security checks: HSTS and Helmet headers on the API, the test sign-in route
  absent from the production build, the web content policy present, the
  dependency audit and the OpenAPI diff in CI.
- Browser tests at phone width sign in through the test route, complete
  onboarding, edit the profile, sign out, cancel a pending sign-in and accept a
  changed notice; the installability check confirms the manifest and service
  worker.
- In production you sign in with your Google account on your phone, install
  the app, edit your profile, sign out of one device while staying signed in on
  another, and confirm a non-listed Google account sees "Not open yet".
