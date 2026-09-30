# Account setup for CWF-1

The owner completes these dashboard steps during T2–T5. Enter secrets only in Render or Cloudflare, never in chat or git.

1. Buy the chosen `.in` domain. Share only the domain name with the team. In Cloudflare, add the domain and follow its registrar nameserver instructions. Plan the apex for the web app and `api.` for Render.
2. Create a Render account with payment. Check the current price and included backup periods for a Starter web service and a PostgreSQL 18 Basic database in Singapore against decision 0013 and the INR 2,000 monthly budget. Share the confirmed backup periods and price. Do not approve the privacy notice until its backup wording matches this plan.
3. Create a Cloudflare account and a Pages project for the web app. Configure the apex custom domain. Keep the API and web on the same `.in` registrable domain so SameSite=Lax cookies work.
4. Create a Google Cloud project and an OAuth web client. Set the consent screen to “In production” with `openid email profile`, add the `.in` authorized domain and `https://api.<domain>/api/v1/auth/google/callback` as an exact authorized redirect URI. Enter the client ID and secret directly in Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. In Render, create the API web service in Singapore and the private PostgreSQL 18 database. Set `NODE_ENV=production`, `DATABASE_URL` from Render's private connection value, `PORT` from Render, `TRUST_PROXY=1`, `API_ORIGIN=https://api.<domain>`, `WEB_ORIGIN=https://<domain>`, a long random `SESSION_SECRET`, and `OWNER_CONTACT_EMAIL`. Set `LAUNCH_OPEN=false` and `PRELAUNCH_ALLOWED_EMAILS` to the verified Google email addresses allowed before launch. Leave `TEST_AUTH_ENABLED=false`. Set `OWNER_GOOGLE_ACCOUNT_ID` after the owner reads it in their own profile.
6. In Cloudflare Pages, set the web app's public API origin to `https://api.<domain>` using the variable the web task defines. Check DNS, HTTPS and the Google callback from a phone during T6. Keep the owner contact email and allowed emails as non-secret configuration values; share them with the team so the notice and launch check use the right values.

See [the API flow](auth-flow.md) and [the hosting decision](../decisions/0013-hosting-render-cloudflare.md). T2 adds no external account or live deployment.
