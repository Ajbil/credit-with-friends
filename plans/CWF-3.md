# List and manage my cards

10 parts · Risks: a production migration, card details typed by mistake, cards seen outside a shared circle, permanent card removal · New moving parts: a cards module

## What changes for you

- A new "Your cards" screen lists the bank cards you hold. You add one by picking your bank from
  the list, picking credit or debit, and optionally typing the card's variant, such as
  "Millennia". It shows even if you're in no circle.
- The app never asks for card numbers, CVV, expiry or OTPs. The add and edit screens remind you
  of that, and a variant with three or more digits in a row is refused with the same warning.
- If a bank isn't on the list, the add screen says so and shows the support contact address so
  people can ask you to add it.
- You can edit or remove your own cards. You can't add the same card twice or hold more than 20.
- Inside a circle, tapping a member shows their cards. People see your cards only while they
  share a circle with you, and changes show at once.
- Right after onboarding you're invited to add your cards, with a Skip option. If you came in
  through an invite link, you see the invite first and get the invitation after it.
- Each card you add is counted for your later usage view.
- Searching for a card holder and the WhatsApp button come in the next story (CWF-4).

## Why

The app's whole point is finding a friend who holds the card an offer needs, and that only works
once members have said which cards they hold (decision 0005: bank, credit or debit, optional
variant). Circles now work end to end, including removing people (CWF-7), so cards can safely be
shown to the people who share a circle and no one else (decision 0006). Search and contact
(CWF-4) build directly on the cards listed here. Card numbers are never collected (decision
0002).

## Done when

1. **You can add a card by picking your bank, credit or debit, and an optional variant, and see
   it in "Your cards", even when you're in no circle.**
2. **The app refuses a bank that isn't on the list, a variant that looks like card details or is
   too long, a duplicate card and a 21st card, each with a message, and the add and edit screens
   always remind you never to enter card numbers, CVV, expiry or OTPs.**
3. **You can edit or remove your own cards under the same rules, and nobody can edit or remove
   anyone else's.**
4. **Inside a circle you can open a member and see their cards; people see your cards only while
   they share a circle with you, and adds, edits and removals show at once.**
5. **After onboarding you're invited to add your cards and can skip; if you came in through an
   invite link, you see the invite first.**
6. **Each added card is counted with you and the circles you're in at that moment, and counting
   never blocks the add.**
7. **The add screen tells people how to ask for a missing bank, with the support contact address,
   and a corrected bank name shows on every card of that bank.**
8. **It works live on creditwithfriends.in, checked by you with allowed test accounts.**

## Risks

- **The first API deploy adds new database tables to production** (the bank list and cards).
  Before it, take a manual export in Render (decision 0017).
- **Someone might type card details into the variant box.** The app refuses any variant with
  three or more digits in a row, ignoring spaces, dashes and slashes between them, and never
  stores or logs what it refuses. It is a guard, not a guarantee, so the reminder stays on every
  add and edit screen.
- **Cards must never reach someone outside a shared circle.** Every card read for another member
  checks both people's current membership of a non-deleted circle at that moment, and tests cover
  leaving, removal and deletion.
- **Removing a card is permanent.** It asks for confirmation first; the member can add it again
  later.

## For the builders

The spec is `docs/specs/cards.md`; the tables are `Bank` and `Card` in
`docs/architecture/11-data-model.md`; usage events are in `docs/specs/usage-metrics.md`
("card listed": member, their circles at that moment or none).

### Done-when details

1. **Add and list.**
   - `GET /api/v1/banks` follows the constitution's list rules: paged with `page` and `limit`,
     default 20 and maximum 100, sorted by `sortName`. The web asks for one page of 100, which
     covers the whole fixed list. Its response also carries the support contact address from
     `OWNER_CONTACT_EMAIL` for the missing-bank note.
   - `GET /api/v1/me/cards` returns the caller's cards (at most 20, so one page) with bank id,
     bank display name, type and variant; `POST /api/v1/me/cards` adds one. Both work for a
     member in no circle. A pending sign-in that hasn't finished onboarding is refused, like
     every other member endpoint.
   - The 46 banks in the spec's initial list are seeded by the migration with stable slug ids
     (for example `hdfc-bank`) and a `sortName` so "State Bank of India (SBI)" sorts under S.
   - Tests: T1A proves the seeded list and its order; T1B adds a card with no variant for a
     member in no circle and sees it listed, adds one card for every seeded bank, and refuses a
     pending sign-in. T4A proves the list's empty state and a failed load with a retry.
2. **Refusals and the reminder.**
   - **The error contract, pinned by T1A** in the code map in
     `apps/api/src/common/api/api-exception.filter.ts` (Known traps), one entry per code:
     - `CARD_BANK_UNKNOWN`, 400, field error on `bankId`: "Choose a bank from the list.";
     - `CARD_VARIANT_TOO_LONG`, 400, field error on `variant`: "Use at most 40 characters.";
     - `CARD_VARIANT_UNSAFE`, 400, field error on `variant`, for three or more digits in a row
       ignoring spaces, dashes and slashes between them: "This looks like card details. Never
       enter card numbers, CVVs, expiry dates or OTPs.";
     - `CARD_DUPLICATE`, 409, form-level, when bank, type and variant match (variants compared
       case-insensitively after trimming, empty counted as one value): "You've already listed
       this card.";
     - `CARD_LIMIT`, 409, form-level: "You can list at most 20 cards."
     A missing or malformed bank or type is invalid input (400) like any other bad body.
   - The rules live in one helper in the cards module that add and edit both call; the
     duplicate check is also a unique constraint on (memberId, bankId, type, variantKey), so two
     simultaneous identical adds give one card and one `CARD_DUPLICATE`.
   - The 20-card limit holds under simultaneous adds: adding locks the member row first, then
     counts and inserts. Race tests name each connection and wait until `pg_stat_activity` shows
     the competitor blocked before releasing (Known traps).
   - A refused variant is never stored or logged.
   - The web add and edit screens show the reminder "Never enter card numbers, CVV, expiry dates
     or OTPs." at all times, field errors beside their field, and form-level errors above the
     Save button.
   - Tests: unit tests (T1A) for every rule, including "12 34", "1-2-3" and "1/2/3" refused and
     "2 Gold" or "Regalia 2.0" allowed; integration tests (T1B) for each refusal through the API,
     missing and malformed bank and type, the same bank and type with a different variant
     allowed, the limit race, the identical-add race, and a refused unsafe variant leaving no
     card row and no log line containing it; web tests (T4E) for each message in its place.
3. **Edit, remove and ownership.**
   - `PATCH /api/v1/me/cards/:cardId` applies every add rule, including duplicates against the
     member's other cards and the unsafe-variant check; `DELETE /api/v1/me/cards/:cardId`
     removes it.
   - A malformed card id is invalid input (400). Another member's card id, or an unknown one,
     gives the same not-found result; nothing changes.
   - Editing never counts against the 20-card limit: a member with 20 cards can edit one.
   - The edit screen shows the same reminder at all times, field errors beside their field and
     form-level errors above Save.
   - Tests: integration tests (T1D) for edit refusals, editing into a duplicate, editing at 20
     cards, removing, no usage event for an edit or a removal, and malformed, unknown and another
     member's card ids; web tests (T4B) for the edit reminder, each refusal in its place (unsafe and
     too-long variant beside the variant field, duplicate above Save), and remove with a
     confirmation where cancelling keeps the card.
4. **Seeing a circle member's cards.**
   - `GET /api/v1/circles/:circleId/members/:memberId/cards` returns that member's display name
     and cards only when the caller and that member are both current members of that circle and
     it is not deleted; otherwise the not-found result, the same as viewing a circle you aren't
     in. It reads at request time, so adds, edits and removals show on the next load.
   - The circles module checks the memberships and asks the cards module for the cards through
     the service bus; the cards module never reads memberships for this.
   - **The check holds through the read.** In one transaction, the circles module locks both
     membership rows `FOR SHARE` (which blocks a leave, removal or circle deletion from deleting
     them), confirms the circle isn't deleted, then makes the `cards.memberCards` request on that
     same transaction and returns. A leave or removal racing the read either finishes first, so
     the read refuses, or waits until the read has answered.
   - A malformed circle or member id is invalid input (400) and never reaches the database.
   - The web circle member list links each other member to a read-only screen with their name
     and cards. CWF-4 adds the WhatsApp button and search there.
   - Tests: integration tests (T1C) for sharing a circle, after leaving, after removal, after
     deletion, a member of a different circle, a newly joined member seeing existing members'
     earlier cards, and two people sharing two circles where one membership ends: that circle's
     URL refuses while the other still works, malformed circle and member ids, and another
     member's view reloaded after the holder adds, edits and removes a card, showing each change,
     and a leave and a removal each racing the read (observed-wait barrier, Known traps), where
     the response is either the cards before the change or the not-found result, never cards
     after the membership ended. Web tests (T4C) for the member screen, a member
     with no cards, the not-available state and a failed load.
5. **The invitation to add cards.**
   - After onboarding with no return path, the member lands on an "Add your cards" page with "Add
     a card" and "Skip for now"; Skip goes to the circles list and adding a card goes to "Your
     cards".
   - With an invite return path, finishing onboarding sets a one-time "just onboarded" flag in the
     browser's session storage holding that invite's path, and returns to the invite as today (no
     URL marker, so nothing can be replayed from a link). After the member joins, or the invite
     takes them straight to a circle they're already in, the invite page clears the flag and goes
     to the same page, whose Skip and finish lead to that circle. A terminal result for that
     invite (a dead link, a blocked invite or a refused join) clears the flag and shows that
     result as today, with no invitation. A failed load or a failed Join keeps the flag, so a
     retry of the same invite that then succeeds still shows the invitation. A flag for a
     different invite path is ignored and cleared. Without the flag, opening an invite never shows
     the page; reloading or revisiting after it was cleared doesn't either.
   - The add screen takes an optional internal return path (`returnTo`, a same-site path only)
     and goes there after saving; without one it goes to "Your cards". T4E implements it; the
     invitation page passes the circle's path when it came from an invite.
   - "Your cards" stays reachable from the home screen at any time.
   - Tests: T4E tests the add screen's return path, including an outside URL ignored. T4D tests
     the plain onboarding route (Skip lands on the circles list; adding a card lands on "Your
     cards"), a failed invite load followed by a successful retry still showing the invitation,
     the invite route (saving a card from the invitation and skipping
     both land in the circle), a later visit or reload of the invite showing no invitation once
     the flag is cleared, and a dead or reset invite clearing the flag so a later valid invite in
     the same tab shows no invitation.
6. **The card listed event.**
   - **The membership snapshot stays in the circles module, pinned by T1B.** The circles module
     answers a new bus request, "lock and list a member's circles", that runs on the transaction
     the caller passes in. In that transaction it locks the member row (`FOR UPDATE`, which joins
     also take before inserting a membership) and the member's current membership rows (`FOR
     SHARE`, which blocks a leave, removal or circle deletion from deleting them), and returns the
     circle ids. The cards add opens its transaction, makes that request first, then counts,
     inserts, commits, and publishes a `CardListedEvent` with those circle ids through the bus.
     Nothing takes a circle lock, so it can't deadlock with those paths, and the cards module
     never reads memberships itself.
   - **Bus request names and types**, declared in the `Requests` map in
     `apps/api/src/service-bus/service-bus.service.ts`:
     - `circles.lockMemberCircles` (T1B): input `{ memberId: string; tx: Prisma.TransactionClient }`,
       output `{ circleIds: string[] }`;
     - `cards.memberCards` (T1C): input `{ memberId: string; tx: Prisma.TransactionClient }`,
       output an array of `{ id, bankId, bankName, type, variant }`. The usage recorder gains
     that event, storing one `card_listed` usage event with the member and zero or more circles.
   - A member in no circle still gets one event, with zero circles. Edits and removals record
     nothing.
   - The add's response never waits for the recorder: a test holds the recorder's handler open
     and sees the add return first.
   - A failed record is logged, never undoes or delays the add, and leaves that one event
     uncounted. Any test that checks the event waits until its row is visible (Known traps).
   - Tests (T1B): one event per add with the right circles, one event with no circles for a
     member in no circle, an add racing a join and an add racing a leave (each with the
     observed-wait barrier; the event's circles match the memberships held when the add took its
     locks), the add returning before a held-open recorder, and a forced failure that keeps the
     card. T1D proves edits and removals record no event.
7. **Missing bank and name corrections.**
   - The add screen says the bank list is fixed and shows "Bank missing? Ask the owner to add it:"
     with the contact address from `GET /banks` as an email link.
   - Cards store the bank id, never its name, so a display-name correction released as a
     migration shows on every card of that bank. Banks are never deleted.
   - Tests: integration tests that rename a bank in the test database and see the new name in
     `GET /banks` (T1A), and in the holder's own list and another member's view through a shared
     circle (T1C); a
     web test (T4E) for the missing-bank note.
8. **Live check.** On `creditwithfriends.in`, with the owner on their phone and allowed test
   accounts on another device or browser: add, edit and remove cards with each refusal; see each
   other's cards through a shared circle; stop seeing them after leaving. The invitation after
   onboarding needs two Google accounts that have never onboarded, added to the allowed list for
   the check: one for a plain sign-up and one through an invite link. Results go in a CWF-3 section of
   `docs/architecture/deployment.md`.

- **Out of this story:**
  - **CWF-4:** search, the WhatsApp button on cards and the WhatsApp tap event.
  - **CWF-5:** cards deleted with an account.
  - **CWF-6:** showing card listed counts.
- **Cards module:** `apps/api/src/modules/cards/` owns `Bank` and `Card`. It answers a bus request
  for a member's cards, which T1C uses and CWF-4 search will reuse.
- **API contract, one part at a time:** the API parts run one after another, so each adds its own
  endpoints to `apps/api/openapi.json`. The web client is regenerated once, in T4A, after the API
  deploy.
- **Web routes:** the web parts run one after another, so each registers its own routes in
  `apps/web/src/main.tsx` when its page ships.
- **Proof belongs where the behaviour lives:** rules, locking, visibility and events are proven
  in API integration tests; web tests prove what screens show and send.
- **Production deploys:** deploy the API once, after T1A, T1B, T1D and T1C have merged, with an
  export first. **Checkpoint:** the coordinator starts T4A only after the owner confirms that
  deploy is live; the Tasks table's After column can name only tasks, so T4A lists T1C and this
  line is the gate. Web parts run one after another, since
  each needs a browser run on this machine (Known traps).

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| T1A | Cards API: banks and card rules | The `Bank` and `Card` tables and migration with the 46 seeded banks; the cards module; the card-rules helper; paged `GET /banks` with the contact address; the error contract with one code per refusal in the exception filter | 2, 7 | `apps/api/prisma/`, `apps/api/src/modules/cards/`, `apps/api/src/app.module.ts`, `apps/api/src/common/api/api-exception.filter.ts`, `apps/api/openapi.json`, `apps/api/test/cards-banks.integration.spec.ts` | `apps/api/src/modules/cards/**/*.spec.ts`, `apps/api/test/cards-banks.integration.spec.ts` | | no |
| T1B | Cards API: list and add | Listing and adding your own cards with every rule, the duplicate and limit races, the circles module's "lock and list a member's circles" bus request, and the card listed event with the recorder's new event | 1, 2, 6 | `apps/api/src/modules/cards/`, `apps/api/src/modules/usage/`, `apps/api/src/modules/circles/member-circles/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/src/service-bus/service-bus.service.ts`, `apps/api/src/common/api/api-exception.filter.ts`, `apps/api/openapi.json`, `apps/api/test/cards-add.integration.spec.ts` | `apps/api/src/modules/cards/**/*.spec.ts`, `apps/api/src/modules/usage/**/*.spec.ts`, `apps/api/src/modules/circles/member-circles/**/*.spec.ts`, `apps/api/test/cards-add.integration.spec.ts` | T1A | no |
| T1D | Cards API: edit and remove | Editing with every rule and removing your own cards, with malformed, unknown and other members' card ids refused | 3 | `apps/api/src/modules/cards/`, `apps/api/openapi.json`, `apps/api/test/cards-edit.integration.spec.ts` | `apps/api/src/modules/cards/**/*.spec.ts`, `apps/api/test/cards-edit.integration.spec.ts` | T1B | no |
| T1C | Circles API: a member's cards | The circle member cards endpoint with both memberships checked at request time through the bus, and the bank rename seen in both views | 4, 7 | `apps/api/src/modules/circles/member-cards/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/src/modules/cards/`, `apps/api/src/service-bus/service-bus.service.ts`, `apps/api/openapi.json`, `apps/api/test/circles-member-cards.integration.spec.ts` | `apps/api/src/modules/circles/member-cards/**/*.spec.ts`, `apps/api/test/circles-member-cards.integration.spec.ts` | T1D | no |
| T4A | Web: your cards | The regenerated client; the "Your cards" list with its empty and failed states; its route and the home link | 1 | `apps/web/src/api/generated.ts`, `apps/web/src/main.tsx`, `apps/web/src/routes/circles/home/`, `apps/web/src/routes/cards/list/`, `apps/web/e2e/cards.spec.ts` | `apps/web/src/routes/cards/list/**/*.test.tsx`, `apps/web/e2e/cards.spec.ts` | T1C | yes |
| T4E | Web: add a card | The add screen with the bank picker, credit or debit, variant, the reminder, every refusal in its place and the missing-bank note | 1, 2, 7 | `apps/web/src/main.tsx`, `apps/web/src/routes/cards/add/`, `apps/web/e2e/cards-add.spec.ts` | `apps/web/src/routes/cards/add/**/*.test.tsx`, `apps/web/e2e/cards-add.spec.ts` | T4A | yes |
| T4B | Web: edit and remove a card | Edit with every rule and its messages, remove with a confirmation | 3 | `apps/web/src/main.tsx`, `apps/web/src/routes/cards/edit/`, `apps/web/e2e/cards-edit.spec.ts` | `apps/web/src/routes/cards/edit/**/*.test.tsx`, `apps/web/e2e/cards-edit.spec.ts` | T4E | yes |
| T4C | Web: a circle member's cards | Opening a member from the circle's list to see their cards, with the no-cards, not-available and failed states | 4 | `apps/web/src/main.tsx`, `apps/web/src/routes/circles/member/`, `apps/web/src/routes/circles/circle/circle-page.tsx`, `apps/web/e2e/circle-member-cards.spec.ts` | `apps/web/src/routes/circles/member/**/*.test.tsx`, `apps/web/e2e/circle-member-cards.spec.ts` | T4B | yes |
| T4D | Web: the invitation to add cards | The "Add your cards" page after onboarding and after an invite with the just-onboarded marker, with Skip | 5 | `apps/web/src/main.tsx`, `apps/web/src/routes/cards/welcome/`, `apps/web/src/pages/onboarding-page.tsx`, `apps/web/src/routes/circles/join/join-page.tsx`, `apps/web/e2e/cards-welcome.spec.ts` | `apps/web/src/routes/cards/welcome/**/*.test.tsx`, `apps/web/e2e/cards-welcome.spec.ts` | T4C | yes |
| T7 | Live check | A CWF-3 production check section in the runbook, filled in from your live walk-through | 8 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T4D | yes |

The API parts run one after another: T1A, T1B, T1D, then T1C. Once all four merge, you take an
export and deploy the API; T4A starts after that, then T4E, T4B, T4C and T4D one after another,
each needing a browser run on this machine. T7 comes last.

New moving parts: the cards module in `apps/api/src/modules/cards/` (Done-when 1 to 4), which owns
banks and cards as the modular-monolith constitution requires.

## Notes

### What I need from you

- A manual export in Render before the API deploy, which adds the bank and card tables.
- For the live check: your second allowed account, plus two Google accounts that have never
  signed in to the app, added to the allowed list (`PRELAUNCH_ALLOWED_EMAILS` in Render), to see
  the invitation after onboarding, once plain and once through an invite.
