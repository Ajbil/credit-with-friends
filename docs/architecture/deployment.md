# Production deployment runbook

Use this with the [account setup checklist](deployment-checklist.md), [sign-in flow](auth-flow.md), [web deployment contract](../../apps/web/README.md#deployment-contract), and [backup decision](../decisions/0017-render-backups.md). In this page, `<domain>` means the owner's complete `.in` domain, without `https://` (for example, substitute the real domain everywhere, including `api.<domain>`). Do not put dashboard credentials, connection strings, OAuth secrets or session secrets in git, chat, tickets or the production check below. The owner supplies them directly in the named dashboard.

## Before the first deploy

1. The owner buys the `.in` domain, creates Render with payment, Cloudflare and Google Cloud accounts, and connects the repository in the hosting dashboards. Confirm the Render Starter web service and PostgreSQL 18 Basic database prices, storage and Singapore region against the [INR 2,000 monthly budget](../decisions/0011-mobile-web-hosting-budget.md). Confirm the Render Hobby workspace has a 3-day point-in-time restore window and that manually created logical exports are retained for 7 days. The [approved privacy notice](../../apps/api/prisma/migrations/20260930110000_privacy_notice_v1/migration.sql) must describe those periods before anyone accepts it. A different hosting plan or retention period needs a privacy-notice decision before sign-up.
2. In Cloudflare, add `<domain>` as a zone. At the registrar, replace the domain's nameservers with the two values Cloudflare shows for that zone. The owner supplies those values in the registrar dashboard. Check Cloudflare marks the zone active and the registrar's nameservers match. Keep the web app at `https://<domain>` and the API at `https://api.<domain>`; these sibling hosts are required for the API's SameSite=Lax session cookie.
3. In Render, create a PostgreSQL 18 **Basic** database in **Singapore** and a **Starter** Node web service in **Singapore**, connected on Render's private network. Keep a single API instance because the daily pending-sign-in cleanup and rate limits run inside it. Confirm the database's Recovery page offers point-in-time restore and Create export. Do not use a free database: it has no promised recovery window.

## Render API service

Set these in the Render web service dashboard, using the repository root as the root directory. The owner supplies every dashboard entry; values marked **secret** are pasted there directly and never copied into the production check. Check the service Settings and Environment pages against this table before deploying.

| Setting | Value or source | How to check |
| --- | --- | --- |
| Repository / branch | This repository / `main` | Settings shows the intended Git repository and production branch. |
| Runtime / region / instance | Node / Singapore / Starter | Settings and the service overview show these values. |
| Root directory | Repository root (leave the field empty) | Build can read the root `pnpm-lock.yaml` and both workspaces. |
| Node version | Node 22 from root `package.json` `engines.node` (`>=22 <23`) | Build log reports a Node 22 version. Do not override it with a different `NODE_VERSION`. |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @symphony/api build` | Build log shows dependency install, Prisma client generation and Nest build succeed. |
| Pre-deploy command | `pnpm db:migrate:deploy` | The deploy log shows `prisma migrate deploy` completes **before** the new API version starts. A failed migration stops the deploy. |
| Start command | `pnpm --filter @symphony/api start` | Render marks the service live; `https://api.<domain>/api/v1/health` returns `status: "ok"` in the success envelope. |
| Health check path | `/api/v1/health` | Render health check becomes healthy. |
| Auto-deploy | **Off** for the API; deploy the merged `main` commit manually after the backup step below | Settings shows auto-deploy disabled; the owner selects the intended commit for each deploy. |
| Custom domain | `api.<domain>` | Render Custom Domains shows a verified domain and valid certificate. |

Every application configuration name in [`.env.example`](../../.env.example) is accounted for here. In Render **Environment**, the owner sets the values except where Render supplies one automatically. Check non-secret values by reading the dashboard; check secrets only by presence and a successful deploy or sign-in, never by displaying their contents.

| Name | Production value or source | How to check |
| --- | --- | --- |
| `DATABASE_URL` | **Secret:** Render Postgres **internal** connection URL for the Singapore database, copied by the owner into the API service | Render shows the variable is set; pre-deploy migration and API database access succeed. Never use the external URL in the service. |
| `PORT` | Render's web-service port, normally `10000`; let Render supply it | The service binds and its health check passes; if the owner overrides Render's port, the API and Render port must match. |
| `TRUST_PROXY` | `1` | Environment shows `1`; HTTPS requests and secure session cookies work through Render's proxy. |
| `WEB_ORIGIN` | `https://<domain>` with no trailing slash | Environment matches the Pages origin exactly; authenticated browser requests are accepted by CORS. |
| `API_ORIGIN` | `https://api.<domain>` with no trailing slash | Environment matches the Render custom domain; the Google redirect URI uses this host. |
| `SESSION_SECRET` | **Secret:** a fresh long random value generated and entered by the owner in Render | Variable is set and sign-in completes. Changing it invalidates existing signed OAuth flows; treat rotation as an operational change. |
| `OWNER_CONTACT_EMAIL` | Owner's chosen contact address, supplied in Render; share only this non-secret address with the notice reviewer | Public `https://<domain>/privacy` displays this exact address in the approved notice. |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth web-client ID, entered by the owner in Render | Variable is set and the Google sign-in page opens for this client. |
| `GOOGLE_CLIENT_SECRET` | **Secret:** matching Google Cloud OAuth web-client secret, entered by the owner in Render | Variable is set; the callback completes sign-in. Never copy the value into a log or document. |
| `OWNER_GOOGLE_ACCOUNT_ID` | Initially unset. After the owner signs in and reads **Google account ID** on their own `/profile`, the owner enters that exact ID in Render before any circle is created | On the owner's profile, compare the displayed ID to Render's configured non-secret ID; the API restart succeeds. Do not guess it from the email. |
| `LAUNCH_OPEN` | `false` until the separate launch decision | Environment shows `false`; an unlisted Google account sees **Not open yet**. |
| `PRELAUNCH_ALLOWED_EMAILS` | Comma-separated verified Google email addresses the owner chooses for prelaunch access, including the owner's email | Environment has the intended list; a listed account signs in and an unlisted account is refused. Existing members remain linked by Google account ID if their email changes. |
| `TEST_AUTH_ENABLED` | `false` | Environment shows `false`; the test sign-in route is absent in production. |
| `NODE_ENV` | `production` (hosting setting, in addition to `.env.example`) | Environment shows `production`; cookies have `Secure` and the test-auth module is absent. |

## Cloudflare Pages and DNS

Create a Git-integrated Pages project from this repository. The owner enters these settings in Cloudflare; check the production deployment log and the resulting site. The repository's Vite build generates `_headers` with the configured API origin in its Content Security Policy. The app shell service worker must not cache API responses.

| Pages setting | Value or source | How to check |
| --- | --- | --- |
| Production branch | `main` | Pages project Settings shows `main`; its production deployment points to the merged commit. |
| Root directory | Repository root (leave empty) | Pages finds the root workspace and lockfile. |
| Build Node version | Node 22, matching root `package.json` `engines.node`; set Pages build environment `NODE_VERSION=22` if its selected build image does not provide Node 22 | Build log reports Node 22. |
| Build command | `pnpm --filter @symphony/web build` | Build log succeeds and includes Vite/PWA output. |
| Build output directory | `apps/web/dist` | Production deployment contains `index.html`, the manifest, service worker and `_headers`. |
| Build environment `VITE_API_ORIGIN` | `https://api.<domain>` with no trailing slash, supplied by the owner | Rebuild after setting it; on the production site, browser network requests target that host and the response's Content Security Policy `connect-src` includes it. |
| Custom domain | `<domain>` at the apex | Pages Custom domains shows Active and `https://<domain>` loads. |
| SPA routing | Serve `index.html` for app paths; Pages does this when the output has no top-level `404.html` | Directly open `https://<domain>/profile`, `/onboarding` and `/privacy`; they load the app rather than a 404. |

The owner creates or confirms these records. `<pages-project>.pages.dev` is the actual Pages project hostname shown in Cloudflare, and `<render-service>.onrender.com` is the actual Render service hostname shown in Render; neither is a guessed value. If either dashboard gives a different validation record, follow its exact displayed name and target, then check verification there.

| Where / record | Name | Target or source | How to check |
| --- | --- | --- | --- |
| Registrar nameservers | `<domain>` NS delegation | The two nameservers shown by Cloudflare for this zone | Registrar and Cloudflare agree; zone becomes Active. |
| Cloudflare DNS, Pages apex CNAME | `@` (`<domain>`) | `<pages-project>.pages.dev`, created by Pages when the apex custom domain is added | DNS record points to the selected Pages project; Pages domain is Active and apex serves the site over HTTPS. |
| Cloudflare DNS, Render API CNAME | `api` (`api.<domain>`) | `<render-service>.onrender.com` from Render; set **DNS only** (gray cloud) | Render verifies the custom domain and issues a certificate; `https://api.<domain>/api/v1/health` responds over HTTPS. |

Add `api.<domain>` in Render Custom Domains **before** creating its CNAME. Keep the API record DNS only while Render verifies and renews its certificate; Cloudflare must not cache API responses or HTML with session data. Do not add a Cloudflare cache rule for `/api` or authenticated HTML. Check both HTTPS certificates in a browser, and check that the API response carries no unexpected Cloudflare cached response. If existing `api` A/AAAA/CNAME records conflict, resolve them in Cloudflare DNS before verification; do not change unrelated mail or domain records.

## Google sign-in client

In Google Cloud, the owner configures the OAuth consent screen for an external app **In production** with scopes `openid`, `email` and `profile`, the authorized domain `<domain>`, app home page `https://<domain>`, and public privacy policy URL `https://<domain>/privacy`. Verify ownership of the domain in Google's domain verification flow. Create an OAuth **Web application** client with authorized redirect URI **exactly** `https://api.<domain>/api/v1/auth/google/callback`. The browser starts at the API's `/api/v1/auth/google/start`; the client secret stays only in Render. Check the Google consent screen and client settings in its dashboard, then open sign-in from the production phone browser and confirm the callback returns to the app. The `/privacy` page must load without sign-in and show the approved version 1 text and configured contact address before requesting Google approval or inviting anyone.

## Each production deploy and recovery

1. After a change is merged, inspect the commit's `apps/api/prisma/migrations/` changes. **Before every production migration**, the owner opens the Render database **Recovery** page, selects **Create export**, waits until the logical backup appears as ready, and confirms its creation time and downloadable archive. Do not start a migration while the export is pending or failed. Render retains these manual exports for at least 7 days; the Hobby point-in-time restore window is 3 days. No automatic daily logical backup is promised.
2. From the Render web service, manually deploy the intended merged `main` commit. Its pre-deploy command runs `pnpm db:migrate:deploy` before the new API starts, including on deploys with no pending migrations. Confirm the migration step and health check in the deploy log. If the migration fails, stop and investigate before retrying; do not start a new build against an unverified schema. A redeploy does not undo a database migration. For data loss, use Render's Recovery page to restore into a new database, inspect it, then deliberately repoint the API; never overwrite the production database blindly.
3. Cloudflare Pages deploys the merged `main` web build. Confirm its production deployment is successful and that the API and web origins still match. If a deploy changes the API URL, rebuild Pages with the matching `VITE_API_ORIGIN` and update the Google redirect URI before testing sign-in.

## Production check — owner to complete on a phone

The owner performs this live after both hosts and Google are configured. The coordinator records the results later. Leave the result cells blank until the owner reports what happened; record a failure plainly and fix it before declaring production ready. For the phone flows, use visible labels, keyboard access (including an attached keyboard if available), readable text and focus indication; trigger an invalid profile edit and confirm the message tells the owner what to correct while the old value stays.

| Check | Expected observation | Result / date / device |
| --- | --- | --- |
| DNS and HTTPS | `<domain>` resolves to Pages, `api.<domain>` resolves to Render, and both load with valid HTTPS certificates. |  |
| API health and public policy | `/api/v1/health` reports `ok`; `https://<domain>/privacy` opens without sign-in and shows approved version 1 plus the configured contact address. |  |
| Google sign-in and onboarding | The owner's allowed Google account signs in on the phone, completes onboarding once and returns to the requested app path. |  |
| Install to home screen | The owner installs from the phone browser; the home-screen icon opens the app in its standalone display. |  |
| Profile and invalid edit | `/profile` shows the owner's name, WhatsApp number, Google email and account ID. A valid edit saves; an invalid edit explains what to fix and preserves the old value. |  |
| One-device sign-out | Sign out on the phone while a second device remains signed in; only the phone returns to sign-in, and the profile data remains after signing in again. |  |
| Unlisted Google account | With `LAUNCH_OPEN=false`, an account absent from `PRELAUNCH_ALLOWED_EMAILS` sees **Not open yet** and cannot onboard. |  |
| Cookie and browser requests | On HTTPS, the API issues a `Secure`, `HttpOnly`, `SameSite=Lax` `cwf_session` cookie scoped to `/api/v1`; authenticated requests to the API succeed from the Pages origin. |  |
| Migration backup | The latest production migration has a completed manual logical export created before its Render pre-deploy step; Render reports the expected retention and restore window. |  |
