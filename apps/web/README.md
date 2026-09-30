# CreditWithFriends web

The phone-first sign-in and onboarding app runs with Vite locally and builds to static files for Cloudflare Pages.

## How it works

`pnpm --filter @symphony/web dev` starts the web app at `http://localhost:5173`. Set `VITE_API_ORIGIN=http://localhost:3000` for the local API, or set it to the API's HTTPS origin for a build. Run `pnpm --filter @symphony/web generate:api` after the API's `openapi.json` changes. The generated client keeps request and response types aligned with the API.

The web app redirects to `/api/v1/auth/google/start` on the API origin, with the original relative return path. The API handles Google, the allowlist, the session cookie and CSRF checks. The browser sends credentials and `X-Requested-With: cwf` on changes. Onboarding reads the published privacy notice from the API and cannot submit while no notice is published.

## Deployment contract

- Cloudflare Pages builds `pnpm --filter @symphony/web build` and publishes `apps/web/dist`. Configure SPA fallback so direct links such as `/onboarding` serve `index.html`.
- Serve the web app at `https://<your-domain>.in` and the API at `https://api.<your-domain>.in`. Set `VITE_API_ORIGIN` at build time to that exact API origin. Set the API's `WEB_ORIGIN` and `API_ORIGIN` to those same origins without trailing slashes.
- The API's session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, scoped to `/api/v1` on its own subdomain. Both origins must share the same site for the browser to send it. Cloudflare must not cache `/api` responses or HTML with session data.
- Cloudflare Pages serves the generated `_headers` file. Its Content Security Policy allows connections only to the configured API origin and self, with no third-party scripts.
- The domain, Google client, Cloudflare Pages and Render service are provisioned in T6. Version 1 notice publication and approval belong to T3; this app shows an unavailable message until it is published.
