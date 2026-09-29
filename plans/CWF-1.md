# Sign in, onboard and manage profile

6 parts (1 already shipped) · Risks: account setup, hosting prices, one-domain sign-in, 30-day erasure · New moving parts: listed under Tasks

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
2. **Only listed emails get in before launch, and unfinished sign-ins don't linger.** While the
   launch switch is off (decision 0016), a Google account that has no account here and whose
   email isn't on the list sees "Not open yet", and nothing about it is stored. A person who
   already has an account still gets in after their Google email changes. "Cancel and remove my
   sign-in" erases the sign-in and signs the person out. An unfinished sign-in with no activity
   for 30 days is erased. The return path a person started from survives sign-in and onboarding.
3. **Your profile, sessions and privacy notice behave as promised.**
   - **Profile:** it shows your name, WhatsApp number, Google email and Google account ID to you
     alone. Edits follow the onboarding rules, and an invalid value is rejected with a message
     while the old value stays. No screen or response another member can get ever contains your
     email or Google account ID.
   - **Sessions:** a session that expires or becomes invalid shows the sign-in screen, and your
     data is unchanged after you sign in again. Signing out on one device leaves your other
     devices signed in.
   - **Privacy notice:** version 1 covers everything the accounts spec lists, including the
     contact address from deployment configuration. Its text goes live only after you approve it
     and after its backup periods are checked against the hosting plan you bought. Every
     version's exact text is kept, along with each member's
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
- **Unfinished sign-ins are erased for good.** After 30 days without activity, the daily cleanup
  deletes them. That's what the accounts spec promises, and it can't be undone.
- **The privacy notice needs your approval before it ships.** The part that publishes version 1
  can't merge until you've approved the exact text.

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
    aren't kept, so revoking Google access takes effect when the session expires or at the next
    sign-in. The spec's revocation example is an example of an invalid session, and the
    criterion (sign-in screen, data unchanged) holds for every invalid session.
  - **Pre-launch list:** it is checked only for a Google account ID with no account yet, so an
    existing member whose Google email changes still gets in.
- **The API contract is pinned by T2 in `apps/api/openapi.json`:** sign-in start and callback,
  the auth-state response, onboarding and profile field names, notice read and accept,
  cancellation and sign-out, and the error codes that drive "Not open yet", session expiry and
  notice re-acceptance. `docs/architecture/auth-flow.md` records what the schema can't: the
  redirect sequence, the cookie name and attributes, and how the return path reaches the web app.
- **The deployment contract is pinned by T4 in `apps/web/README.md`:** the API-origin setting,
  the build command, the output folder, the app-shell and manifest files, and the `_headers`
  format for the content policy. T6 configures Cloudflare Pages from it.
- **All configuration names are pinned by T2 in `.env.example`**, including the launch switch,
  the allowed emails, the owner ID and the contact address. T6 records the production values in
  the runbook, not in the repo.
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
| T2 | Sign-in and onboarding API | Google sign-in with the pre-launch list, pending sign-ins with cancel and the daily 30-day cleanup, onboarding with consent in one transaction, sessions with idle expiry and per-device sign-out, the member-only guard, a consent record against a notice-version table, and a test sign-in route left out of production builds. Pins the API contract, the auth-flow doc, every configuration name, and the account-setup checklist you use during T2 to T5 | 1, 2 | `apps/api/src/modules/accounts/`, `apps/api/src/modules/sessions/`, `apps/api/src/common/`, `apps/api/src/app.module.ts`, `apps/api/prisma/`, `apps/api/test/accounts.integration.spec.ts`, `apps/api/openapi.json`, `apps/api/package.json`, `pnpm-lock.yaml`, `.env.example`, `docs/architecture/auth-flow.md`, `docs/architecture/deployment-checklist.md` | `apps/api/src/modules/accounts/**/*.spec.ts`, `apps/api/src/modules/sessions/**/*.spec.ts`, `apps/api/test/accounts.integration.spec.ts` | T1 | no |
| T3 | Profile and privacy-notice API | The own-profile view and edit with the onboarding rules, email and Google account ID left out of every other response, notice versions published by migration with version 1's text, and the re-acceptance block after a material change. Can't merge until you approve the notice text | 3 | `apps/api/src/modules/profile/`, `apps/api/src/modules/privacy-notice/`, `apps/api/src/app.module.ts`, `apps/api/prisma/`, `apps/api/test/profile-notice.integration.spec.ts`, `apps/api/openapi.json` | `apps/api/src/modules/profile/**/*.spec.ts`, `apps/api/src/modules/privacy-notice/**/*.spec.ts`, `apps/api/test/profile-notice.integration.spec.ts` | T2 | no |
| T4 | Web sign-in and onboarding | The web app skeleton, the generated API client and the content policy, plus screens designed for phones first: sign-in, not-open-yet, cancel sign-in and onboarding with consent. Pins the deployment contract in the web app's README | 1, 2 | `apps/web/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml` | `apps/web/src/**/*.test.tsx`, `apps/web/e2e/sign-in.spec.ts`, `apps/web/e2e/onboarding.spec.ts` | T2 | yes |
| T5 | Web profile, notice and install | The profile screen with edits and sign-out, the notice re-acceptance screen, the session-expired screen, and installability: the manifest and a service worker caching only the app shell | 3 | `apps/web/src/routes/profile/`, `apps/web/src/routes/notice/`, `apps/web/src/routes/session/`, `apps/web/public/`, `apps/web/vite.config.ts`, `apps/web/e2e/profile.spec.ts`, `apps/web/e2e/notice.spec.ts`, `apps/web/e2e/install.spec.ts` | `apps/web/src/routes/**/*.test.tsx`, `apps/web/e2e/profile.spec.ts`, `apps/web/e2e/notice.spec.ts`, `apps/web/e2e/install.spec.ts` | T3, T4 | yes |
| T6 | Production deployment | The deployment runbook; Render, Cloudflare, the domain and the Google sign-in client live; the production check passed on your phone | 4 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T5 | yes |

T3 and T4 can run side by side once T2 merges.

New moving parts:
- **T2:** `openid-client` and `libphonenumber-js` (Done-when 1 and 2); `@nestjs/schedule` for the daily cleanup inside the API process (Done-when 2).
- **T4:** the web app and its libraries: React, Vite, TanStack Router and Query, Tailwind, shadcn/ui (decision 0012) and orval; and Playwright for phone-width browser tests (Done-when 1 and 2).
- **T5:** `vite-plugin-pwa` for the manifest and the app-shell service worker (Done-when 3 and 4).
- **T6:** Render, Cloudflare Pages and DNS, and a Google Cloud sign-in client (Done-when 4).

## Notes

Re-planned from the pre-Forge-v1 plan (`.forge-migrate/replan/`); this story removes that folder.

### What I need from you

- While T2 to T5 are built: buy the `.in` domain and create the Render (with payment), Cloudflare
  and Google Cloud accounts from the account-setup checklist that T2 adds. Enter every secret
  directly into Render or Cloudflare, and share only non-secret values such as the domain, your
  contact email and the allowed emails.
- Approve the exact privacy notice text in T3's pull request, once its backup periods match the
  plan you bought.

### Implementation assumptions carried over from T1

- Turbo's local cache is pinned under the checkout, because the default location is unwritable in
  a Windows worktree.
- Local Docker PostgreSQL uses host port 5433 because 5432 is taken; CI uses 5432.
