# Sign in, onboard and manage profile

4 parts (1 already shipped) · Risks: account setup, hosting prices, one-domain sign-in · New moving parts: listed under Tasks

## What changes for you

- The app runs at your `.in` domain. On your phone you sign in with Google, finish a one-screen
  onboarding, and can install the app to your home screen.
- Until launch, only the emails you list can sign in. Anyone else sees "Not open yet", and
  nothing about them is stored.
- A profile screen shows your name, WhatsApp number, email and your own Google account ID, which
  you need for the owner setting. You can edit your name and number, and sign out of one device
  without signing out of the others.
- A plain-English privacy notice, version 1, is drafted for your approval before anyone accepts it.
- Every change to the app is checked automatically before it merges. This part is already live.
- Circles, cards and search come in later stories.

## Why

Every later story needs a signed-in member who has consented to the privacy notice, so this
story comes first. When it's done, a person can open the app on a phone, sign in with Google,
give a name, a WhatsApp number and an 18+ confirmation, accept the privacy notice, install the
app, and manage their profile, all live on your own domain.

## Done when

1. **Signing in with Google and finishing onboarding makes you a member, exactly once.**
   Onboarding can't be submitted without a 1 to 50 character name, a WhatsApp number that
   normalises to a valid E.164 number (+91 by default, other countries accepted), the 18-or-older
   confirmation and explicit consent. Later sign-ins with the same Google account open the same
   account, even after its email changes. Two onboarding submissions at the same moment still
   make one account. Until onboarding finishes, no member exists: that person can't reach member
   screens or data, including through direct data requests.
2. **Only listed emails get in before launch, and unfinished sign-ins don't linger.** Before
   anything is stored, a Google account whose email isn't on the list sees "Not open yet".
   "Cancel and remove my sign-in" erases the sign-in and signs the person out. An unfinished
   sign-in with no activity for 30 days is erased. The return path a person started from
   survives sign-in and onboarding.
3. **Your profile, sessions and privacy notice behave as promised.**
   - **Profile:** it shows your name, WhatsApp number, Google email and Google account ID to you
     alone. Edits follow the onboarding rules, and an invalid value is rejected with a message
     while the old value stays. No screen or response another member can get ever contains your
     email or Google account ID.
   - **Sessions:** a session that expires or becomes invalid shows the sign-in screen, and your
     data is unchanged after you sign in again. Signing out on one device leaves your other
     devices signed in.
   - **Privacy notice:** version 1 covers everything the accounts spec lists and goes live only
     after you approve its text. Every version's exact text is kept, along with each member's
     accepted version and the time they accepted it. When a version that changes how data is used
     is published, an existing member must accept it before carrying on.
4. **It's live on your domain and works on your phone.** You sign in with your own Google account
   on your phone, install the app to the home screen, edit your profile, and sign out of one
   device while staying signed in on another. A Google account that isn't on the list sees "Not
   open yet". Everything runs on the hosting of decision 0013, within the budget of decision 0011.
5. **Every change is checked automatically before it merges.** Each pull request runs lint,
   types, unit tests, integration tests against PostgreSQL 18, the build, a production dependency
   audit and a check that the API description matches the code. Shipped in pull request 1.

## Risks

- **Account setup could hold up the last part.** Buying the domain and setting up Render,
  Cloudflare and the Google sign-in client can stall the final part, so you do them from a
  checklist while the earlier parts are built.
- **Hosting prices aren't confirmed.** Render's prices came from third-party sources, so confirm
  them when you sign up.
- **Sign-in depends on one shared domain.** The web app and the API must share one domain, so a
  wrong cookie or redirect setting breaks sign-in. The production check in the last part covers
  this.
- **New vendors:** Render and Cloudflare (chosen in decision 0013) and a Google Cloud sign-in
  client. They are set up in their dashboards, not in code.

## For the builders

The approach below comes from the approved plan before the move to Forge v1. Library choices are
in decision 0015, the pre-launch list in decision 0016, and the stack in decisions 0012 to 0014.

- **Accounts API:** Google sign-in with authorization code, PKCE, state and nonce through
  `openid-client`, and WhatsApp numbers through `libphonenumber-js`.
  - **Return path:** the signed state carries it through Google and onboarding; CWF-2 uses it
    for invite links.
  - **Onboarding:** submitting it is one transaction that creates the member and their consent,
    removes the pending sign-in and upgrades the session. A second submission made at the same
    moment gets a conflict, and the web app carries on as the existing member.
  - **Sessions:** they expire after 30 idle days, and each use refreshes them. Google tokens
    aren't kept.
- **One shared guard** lets only members who finished onboarding reach member routes. Only a
  member's own-profile response carries email and Google account ID, and later stories reuse both.
- **Privacy notice versions** are published by a database migration. A material-change version
  blocks every member route except reading and accepting the notice and signing out. Version 1
  states that data is stored in Singapore and gives the backup periods: 3-day point-in-time
  restore and 7-day daily backups.
- **Owner ID:** the API starts without it. You sign in, copy your ID from the profile, and set it
  before any circle exists.
- **Web app:** built with TanStack Router and Query, Tailwind and shadcn/ui, and an orval client
  generated from `apps/api/openapi.json`.
  - A service worker caches only the app shell.
  - Cloudflare Pages serves a strict Content-Security-Policy.
  - Screens, designed for phones first: sign-in, not-open-yet, onboarding, profile, accepting a
    changed notice, and session expired.
- **Deployment:** Render and Cloudflare are set up in their dashboards, and a runbook records each
  setting, who supplies it and how it's checked. The API and database run in Singapore, and
  migrations run before each deploy.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| T1 | Monorepo and API foundation | Shipped in pull request 1: the workspace, the API skeleton (configuration, logging, error format, security middleware, database tooling, health check) and CI with every check | 5 | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts`, `docker-compose.yml`, `.github/workflows/ci.yml`, `apps/api/` | `apps/api/src/common/config/config.spec.ts`, `apps/api/src/common/logging/logging.spec.ts`, `apps/api/test/foundation.integration.spec.ts` | | no |
| T2 | Accounts API | Google sign-in with the pre-launch list, pending sign-ins with cancel and 30-day cleanup, onboarding with consent, sessions, profile, per-device sign-out, notice versions with privacy notice version 1 and re-acceptance, the member-only guard, and a test sign-in route left out of production builds | 1, 2, 3 | `apps/api/src/modules/`, `apps/api/src/common/`, `apps/api/src/app.module.ts`, `apps/api/prisma/`, `apps/api/test/`, `apps/api/openapi.json`, `apps/api/package.json`, `pnpm-lock.yaml`, `.env.example` | `apps/api/src/modules/**/*.spec.ts`, `apps/api/test/accounts.integration.spec.ts` | T1 | no |
| T3 | Web app: sign-in, onboarding and profile | Installable screens, designed for phones first, for sign-in, not-open-yet, onboarding with consent, profile, accepting a changed notice and session expiry; the generated API client and a strict content policy | 1, 2, 3 | `apps/web/`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` | `apps/web/src/**/*.test.tsx`, `apps/web/e2e/` | T2 | yes |
| T4 | Production deployment | Deployment runbook; Render, Cloudflare, the domain and the Google sign-in client live; production check passed on your phone | 4 | `docs/architecture/deployment.md`, `.env.example` | `docs/architecture/deployment.md` (the recorded production check) | T3 | yes |

New moving parts:
- **T2:** `openid-client` and `libphonenumber-js` (Done-when 1 and 2); a daily cleanup job inside the API process (Done-when 2).
- **T3:** the web app and its libraries: React, Vite, TanStack Router and Query, Tailwind, shadcn/ui and orval; a service worker (Done-when 1, 3 and 4); and Playwright for phone-width browser tests (Done-when 1 to 3).
- **T4:** Render, Cloudflare Pages and DNS, and a Google Cloud sign-in client (Done-when 4).

## Notes

Re-planned from the pre-Forge-v1 plan (`.forge-migrate/replan/`); this story removes that folder.

### What I need from you

- While T2 and T3 are built: buy the `.in` domain and create the Render (with payment), Cloudflare
  and Google Cloud accounts from the deployment checklist. Enter every secret directly into Render
  or Cloudflare, and share only non-secret values such as the domain, your contact email and the
  allowed emails.
- Approve the exact privacy notice text in T2's pull request.

### Implementation assumptions carried over from T1

- Turbo's local cache is pinned under the checkout, because the default location is unwritable in
  a Windows worktree.
- Local Docker PostgreSQL uses host port 5433 because 5432 is taken; CI uses 5432.
