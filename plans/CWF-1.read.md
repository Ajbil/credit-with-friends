---
reader: codex (gpt-6-sol)
read_at: 2026-09-29T18:23:35+00:00
read_hash: bc698142bfa5393ea5068e98f50c603ea0b725ca
amended_hash: 4ecb14cc028cd774f30ea5dec4b8d02bd8e5a0dc
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc once, then
run `forge read <doc> --amended`:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options. There is no second read.

1. The pre-launch access rule conflicts with two accepted requirements.
   Decision 0009 permits only the owner to use the app before the full roadmap ships; decision 0016 and this story permit any listed email. Also, rejecting every unlisted email conflicts with Done when 1 if an existing member’s Google email changes. Pin who may sign in before launch and whether an existing account remains accessible after an email change.
   Disposition: keep decision 0016 (accepted after 0009, which it cites) replaces owner-only with the allowlist; Done-when 2 and the builders notes now check the list only for a Google ID with no account, so an email change never locks a member out

2. T2 cannot finish without the owner’s privacy-notice approval and contact address.
   Approval is correctly requested, but the task treats publishing version 1 in a migration as part of the same build. Make approval a gate before that migration merges, and verify the stated backup periods with the purchased plan before approving the text.
   Disposition: keep amended: notice version 1 moved to T3, which cannot merge until the owner approves the text after checking the backup periods against the bought plan; the contact address comes from configuration named by T2 (Done-when 3, Risks, Notes)

3. The account-setup checklist arrives after the owner needs it.
   The notes ask the owner to use a deployment checklist during T2 and T3, but T4 is assigned the runbook and no checklist exists yet. Put the account, domain, callback URL, allowed-email and non-secret-value checklist in an earlier task; T4 can record the final settings and checks.
   Disposition: keep amended: T2 now adds docs/architecture/deployment-checklist.md for the owner to use during T2 to T5; T6 records the final settings in the runbook

4. The T2–T3 API contract needs to be pinned by T2.
   `apps/api/openapi.json` should fix the sign-in and callback URLs, onboarding and profile field names, auth-state responses, notice acceptance, cancellation, sign-out, and the errors that drive “Not open yet” and session expiry. It must also state how the return path reaches the web app; an API schema alone may not describe the redirect and cookie behavior.
   Disposition: keep amended: T2 pins apps/api/openapi.json with every listed item, plus docs/architecture/auth-flow.md for the redirect sequence, cookie and return path

5. The T3–T4 deployment contract needs to be pinned by T3.
   Name the web API-origin setting, build command and output directory, app-shell and manifest files, and Cloudflare CSP header format before T4 configures Pages. Give `.env.example` to T2 alone and put production values in T4’s runbook; its current shared Scope has no need for a second editor.
   Disposition: keep amended: the first web task (now T4) pins the deployment contract in apps/web/README.md; .env.example is T2's alone and production values go in the deployment task's (now T6) runbook

6. Split: T2 → sign-in and onboarding API; profile, sessions and notice API.
   T2 covers three Done-when items but its schema, OAuth flow, cleanup, concurrency handling, guards, profile and notice migrations are far beyond about 400 changed lines. The first task should pin the session, member and API contracts the second uses.
   Disposition: keep amended with the owner's choice: split into T2 sign-in and onboarding API (pins the session, member and API contracts) and T3 profile and privacy-notice API

7. Split: T3 → sign-in and onboarding web flow; profile, notice and installability.
   Six screens, generated client, responsive UI, service worker, CSP and browser tests also exceed about 400 changed lines. Both tasks can follow T2’s pinned API contract.
   Disposition: keep amended with the owner's choice: split into T4 web sign-in and onboarding and T5 web profile, notice and install

8. The session behavior does not meet the accounts spec’s Google-revocation example.
   The spec says a revoked Google access can make a session invalid. The proposed server session keeps no Google token, so revocation cannot be detected during its 30 idle days. Either define a way to detect it or resolve that spec promise before T2 builds it.
   Disposition: keep revocation is the spec's example of an invalid session, not a criterion; criterion 7 holds for every invalid session, and the builders notes state revocation takes effect at expiry or the next sign-in, as the approved pre-v1 plan did

9. Cut or defer: Done when 5 as a story outcome.
   The shipped CI checks map to no Accounts behavior or product success measure. Keep them as an engineering gate, but do not count the foundation task as delivery of the account capability.
   Disposition: keep the owner asked for T1 to appear as shipped in this story; Done-when 5 is observable on every pull request and claims no account behaviour

10. The new-parts and risk lists are incomplete.
    `@nestjs/schedule` and `vite-plugin-pwa` are specified in the architecture but absent from New moving parts. **Simpler: shadcn/ui → native controls and local styling** for these screens, if decision 0012 is amended; the story gives no lower-rung reason for it. Risks should also name the irreversible 30-day pending-sign-in deletion and removal of `.forge-migrate/replan/`.
    Disposition: keep amended: @nestjs/schedule (T2) and vite-plugin-pwa (T5) added to New moving parts and the 30-day erasure added to Risks; shadcn/ui stays because accepted decision 0012 names it; removing .forge-migrate/ is not one-way, since git history keeps it
