# Find a card holder and message them on WhatsApp

6 parts · Risks: a production migration, card details typed into a search, WhatsApp numbers reaching someone outside a shared circle · New moving parts: none

## What changes for you

- Home gets a "Find a card" button, first above "Your cards" and "Your profile". It opens a
  search: pick a bank or one of the brand cards (the same picker as adding a card), choose
  credit, debit or "credit or debit", optionally type a variant, and tap Search.
- You see who in your circles holds that card: each person once, with every matching card and the
  names of the circles you share, in A to Z order. You never appear in your own results, and
  nobody you share no circle with ever does.
- When you type a variant, people whose card matches it come first under "Matching variant", then
  people who listed that bank and type without a variant under "Variant not stated". When nobody
  matches, you see only "No one in your circles has this card yet."
- A variant that looks like card details is refused with the same warning as on the add screen,
  and what you type in a search is never stored or logged.
- Every matching card, and every card on a circle member's cards screen, has a "Message on
  WhatsApp" button. Tapping it checks first that the card still exists and that you still share a
  circle, then opens WhatsApp to that person with a message you can edit before sending, for
  example: "Hi Meera Shah, do you have a moment? I need your HDFC Bank credit card, Regalia Gold,
  for an offer." Without a variant it reads "...your HDFC Bank credit card for an offer." The app
  sends nothing itself.
- If the card was removed, or you no longer share a circle, the button shows "This card is no
  longer available." and opens nothing.
- Next to the buttons the app reminds you that the card holder places the order themselves and
  that nobody should ever share card numbers, CVV, expiry dates or OTPs.
- Coming back from WhatsApp returns you to the same results without searching again.
- Each search (with the bank, the type and how many people it found, never the variant text) and
  each WhatsApp tap (with the person you tapped and the circles you share) is counted for your
  later usage view. Counting never slows or blocks either.

Design: docs/design/CWF-4/ (a8aa6c7725a53cde18997adacbd4720c14c74ab4)

## Why

This is the job the app exists for: someone sees an offer on a card they don't hold and needs to
know, in under a minute, which trusted person holds one, then message just that person (product
brief). Cards are listed and visible inside circles now (CWF-3), so search and the WhatsApp
button can be built on them. The app only finds and connects: the holder places the order and is
repaid outside the app (decisions 0002 and 0003), and only first-party counts are kept
(decision 0008).

## Done when

1. **From home you can find a card: pick a bank or brand card, credit, debit or either, and an
   optional variant, and see each person in your circles who holds it once, with their matching
   cards and the circles you share, in A to Z order.**
2. **With a variant, matching people come first under "Matching variant" and people without a
   stated variant follow under "Variant not stated"; a search with no match shows only "No one in
   your circles has this card yet."; a variant that looks like card details is refused.**
3. **"Message on WhatsApp" on a search result or on a circle member's card opens WhatsApp to that
   person with the ready message you can edit, next to the reminder that the holder places the
   order and nobody shares card details.**
4. **A card that was removed, or whose holder no longer shares a circle with you, shows "This
   card is no longer available." and opens nothing, and people you share no circle with never
   appear in a search or a member's view.**
5. **Each search and each WhatsApp tap is counted for your usage view, without the variant text,
   and counting never slows or blocks either.**
6. **On your phone, on creditwithfriends.in, you get from opening the app to an open WhatsApp
   chat with a matching circle member in under a minute, checked live by you.**

## Risks

- **The first API deploy changes a production table** (it adds the search and WhatsApp tap fields
  to usage events). Before it, take a manual export in Render (decision 0017).
- **Someone might type card details into the search's variant box.** The same guard as adding a
  card refuses it, the search is sent in the request body rather than the address, and the
  variant is never stored or logged.
- **WhatsApp numbers must never reach someone outside a shared circle.** A number is only ever
  returned inside the WhatsApp link, after the check that the card exists and both people share
  a circle at that moment.

## For the builders

The spec is `docs/specs/find-and-contact.md`; usage events are in `docs/specs/usage-metrics.md`
(search: member, their circles or none, people found, bank and type, never the variant;
WhatsApp tap: member, card holder, their shared circles); the tables are in
`docs/architecture/11-data-model.md`. The approved screens are in `docs/design/CWF-4/`: build to
them in the app's existing hand-written CSS (no new UI library), at phone width first.

The approved message wording puts the variant between commas ("card, Regalia Gold, for an
offer"); T1C updates the spec's template line to match.

### Done-when details

1. **Search.**
   - `POST /api/v1/searches?page=&limit=` with body `{ bankId, type, variant? }`, where `type` is
     `credit`, `debit` or `any`. A POST keeps the variant out of addresses, proxy logs and browser
     history; it needs the `X-Requested-With` header like every POST. Paging follows the
     constitution (page from 1, limit default 20, maximum 100; `data.items` plus
     `data.pagination`); the web asks for one page of 100 and shows "Show more" when there are
     more pages. Rate limit: 60 per minute per member (`docs/architecture/12-auth-sessions-security.md`).
   - Each item is one person: `memberId`, `displayName`, `group` (`matching` or `unstated`, or
     `all` without a variant), the shared circles as `{ id, name }` sorted by name, and every
     qualifying card as `{ id, bankId, bankName, type, variant }`. Never a WhatsApp number.
   - Order: without a variant, one list by display name (case-insensitive), ties by member id;
     with a variant, all `matching` people first, then `unstated`, each ordered the same way.
     Paging runs over that order.
   - **Ownership follows `docs/architecture/10-system-overview.md`:** the search module never
     reads memberships or cards itself. In one transaction it makes a new circles bus request,
     `circles.lockCoMembers` (input `{ memberId, tx }`, output `{ circleIds, coMembers: { memberId,
     circles: { id, name }[] }[] }`), which locks the searcher's membership rows and their
     co-members' membership rows in non-deleted circles `FOR SHARE` (circle rows first, then
     membership rows in id order, as `circles.lockSharedMembership` does) and excludes the
     searcher; then a new cards bus request, `cards.findHolders` (input `{ memberIds, bankId,
     type, variant?, tx }`, output the qualifying cards with their match kind); then
     `accounts.displayNames`. This is the "member ids sharing a circle with X" query the
     architecture names; T1B records it in `docs/architecture/13-privacy-deletion-jobs.md`.
   - Variant matching: trim; empty counts as no variant; otherwise compare against the card's
     case-insensitive `variantKey` with a substring match that escapes `%`, `_` and `\`.
   - Tests (T1B): integration tests for the exact result set across two circles (a person in both
     appears once with both circle names), the searcher never included, credit, debit and any,
     paging and its order, a bank rename showing the new name without changing matches, results
     after an add, an edit (old values no longer match) and a removal, and a leave, a removal and
     a circle deletion each racing a search (observed-wait barrier, Known traps), where the result
     is either from before the change committed or excludes the person. Web tests (T4A) for the
     form, both brand-card and bank picks, the result list, "Show more", the failed state with a
     retry, and returning from WhatsApp to the same results without a new search request.
2. **Variant groups, no one yet, refusals.**
   - With a variant, a card qualifies when its variant contains the text (`matching`) or it has no
     variant (`unstated`); a different stated variant never qualifies. A person with any matching
     card is in `matching` and shows all their qualifying cards, including unstated ones.
   - Refusals reuse the card codes and messages from the exception filter: an unknown bank is
     `CARD_BANK_UNKNOWN` beside the bank field; a variant over 40 characters after trimming is
     `CARD_VARIANT_TOO_LONG` and a card-like variant is `CARD_VARIANT_UNSAFE` beside the variant
     field, checked by the cards module's card-rules helper with the bank id (811 on Kotak
     Mahindra Bank stays allowed). A missing or malformed bank or type is invalid input (400).
     A refused search records no event, and its variant appears in no log line (capture the pino
     output as the CWF-3 add tests do).
   - No match returns an empty page; the web shows only "No one in your circles has this card
     yet." under the form.
   - Tests (T1B): spaces-only variant equals no variant, case-insensitive contains, a
     different stated variant excluded, a person with matching and unstated cards in `matching`
     only, `%` and `_` treated literally, each refusal through the API. Web tests (T4A): the two
     group headings, the no-one-yet state with nothing else, each refusal beside its field.
3. **Message on WhatsApp.**
   - `POST /api/v1/contacts` with body `{ cardId }` returns `{ whatsappUrl }`:
     `https://wa.me/<digits of the holder's current E.164 number>?text=<encoded message>`, the
     message being "Hi <holder's display name>, do you have a moment? I need your <bank> <credit
     or debit> card, <variant>, for an offer." or, without a variant, "Hi <name>, do you have a
     moment? I need your <bank> <credit or debit> card for an offer." with the bank's current
     display name. Encode with `encodeURIComponent`.
   - In one transaction the search module reads the card's holder through `cards`, makes a new
     circles request `circles.lockSharedCircles` (input `{ memberId, otherMemberId, tx }`, output
     `{ circleIds }`, locking both members' membership rows in shared non-deleted circles `FOR
     SHARE`, circles first), then `cards.lockCard` (input `{ cardId, tx }`, the card `FOR SHARE`
     with its bank name, type and variant, or null), then a new accounts request
     `accounts.contactDetails` (input a member id, output `{ displayName, whatsappE164 }`).
     Membership rows are always locked before card rows, in both search and contact.
   - The web button calls the endpoint and, on success, opens the link in the same tab with
     `window.location.assign` (a new tab opened after a network wait is blocked as a pop-up on
     phones). The button shows a busy state and ignores repeat taps while waiting.
   - Any other failure of the press (no connection, a timeout or a server error) opens nothing and
     shows "We couldn't open WhatsApp. Check your connection and try again." in an alert under
     that card, with the button enabled again so the next tap retries; the rest of the screen
     stays usable. A 401 or a required privacy notice redirects as on the member cards screen.
   - The reminder, exactly "The card holder places the order themselves. Never share card
     numbers, CVV, expiry dates or OTPs." with the second sentence bold, sits directly above the
     buttons on the results and on the member cards screen, as in the designs.
   - Tests (T1C): the link and both message forms through the API, the bank's current name, the
     number's digits only. Web tests (T4B): from a search result and from the member cards screen
     the browser goes to the expected `wa.me` link (intercept the navigation; never open
     WhatsApp), the reminder beside the buttons, the busy state, and a failed press (the request
     aborted, then a server error) showing the retry message and opening nothing, followed by a
     successful retry that goes to the link.
4. **No longer available, and nobody outside a shared circle.**
   - The contact endpoint refuses with a new code, `CARD_UNAVAILABLE`, 404, message "This card is
     no longer available.", added to the code map in
     `apps/api/src/common/api/api-exception.filter.ts` (Known traps), when the card doesn't exist,
     is the caller's own, or its holder shares no non-deleted circle with the caller at that
     moment. A malformed card id is invalid input (400). Nothing is recorded for a refusal.
   - The web shows the message in an alert under that card, disables only that card's button, and
     leaves the rest of the results usable, as in the designs.
   - `whatsappE164` joins the redacted fields in `apps/api/src/common/logging/logging.config.ts`
     (T1A).
   - Tests (T1C): a removed card, an unknown card, your own card, a holder who left or was
     removed, and a deleted circle each refused with the code; a holder still sharing another
     circle still works; a removal, a leave and a circle deletion each racing a contact press
     (observed-wait barrier), where the press either gets the link before the change committed
     or the refusal, never a link after it. Search's own exclusion tests are in item 1. Web tests
     (T4B): the message under the card and nothing opened.
5. **Usage counts.**
   - **The event shapes are pinned by T1A.** A migration adds nullable `holderMemberId` (foreign
     key to the member, set null when that member is deleted), `bankId`, `cardType` and
     `peopleFound` to `UsageEvent`, as `docs/architecture/11-data-model.md` already describes. The
     usage recorder gains two events through the bus: `CardSearchedEvent` with data `{ circleIds,
     bankId, cardType, peopleFound }` recorded as type `search`, and `CardHolderContactedEvent`
     with data `{ holderMemberId, circleIds }` recorded as type `whatsapp_tap`, each with one
     `UsageEventCircle` row per circle, following the `CardListedEvent` pattern (published after
     commit, idempotent on the event id, failures logged and swallowed).
   - T1B publishes `CardSearchedEvent` once per search, only for page 1 (a "Show more" page is the
     same search), with the searcher's circles at that moment and `peopleFound` equal to the total
     number of distinct people across all pages; T1C publishes `CardHolderContactedEvent` once
     per successful press, from search or a member's screen alike.
   - Tests: T1A unit and integration tests for both events, including a duplicate event id and a
     forced failure; T1B and T1C tests that the response returns before a held-open recorder and
     that a forced recorder failure still returns the results or the link, and that the variant
     never reaches the event or its row. Any test that checks an event waits until its row is
     visible.
6. **Live check.** On `creditwithfriends.in`, with the owner on their phone and the second
   allowed account on another device: search with and without a variant, a brand card, a
   refused variant, no one yet, message from a result and from a member's cards, a card removed
   meanwhile, and a timed run from opening the app to an open WhatsApp chat in under a minute.
   Results go in a CWF-4 section of `docs/architecture/deployment.md`.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing | Developer |
|---|---|---|---|---|---|---|---|---|
| T1A | Usage events for searches and taps | The migration adding the search and tap fields to usage events, the recorder's two new events, and the number added to the log redaction list | 5 | `apps/api/prisma/`, `apps/api/src/modules/usage/`, `apps/api/src/common/logging/logging.config.ts`, `apps/api/test/usage-search-contact.integration.spec.ts` | `apps/api/src/modules/usage/**/*.spec.ts`, `apps/api/test/usage-search-contact.integration.spec.ts` | | no | |
| T1B | Search API | The searches endpoint with variant groups, paging and refusals; the circles module's co-members lock and the cards module's holder lookup through the bus; the search event | 1, 2 | `apps/api/src/modules/search/`, `apps/api/src/modules/circles/member-circles/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/src/modules/cards/`, `apps/api/src/service-bus/service-bus.service.ts`, `apps/api/openapi.json`, `docs/architecture/13-privacy-deletion-jobs.md`, `apps/api/test/search.integration.spec.ts` | `apps/api/src/modules/search/**/*.spec.ts`, `apps/api/src/modules/circles/member-circles/**/*.spec.ts`, `apps/api/src/modules/cards/**/*.spec.ts`, `apps/api/test/search.integration.spec.ts` | T1A | no | |
| T1C | Contact API | The contacts endpoint with the WhatsApp link, the no-longer-available refusal, the shared-circles lock, the card lock and the contact details request through the bus, the tap event, and the spec's message line | 3, 4 | `apps/api/src/modules/search/`, `apps/api/src/modules/circles/member-circles/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/src/modules/cards/`, `apps/api/src/modules/accounts/`, `apps/api/src/service-bus/service-bus.service.ts`, `apps/api/src/common/api/api-exception.filter.ts`, `apps/api/openapi.json`, `docs/specs/find-and-contact.md`, `apps/api/test/contact.integration.spec.ts` | `apps/api/src/modules/search/**/*.spec.ts`, `apps/api/src/modules/accounts/**/*.spec.ts`, `apps/api/test/contact.integration.spec.ts` | T1B | no | |
| T4A | Web: find a card | The regenerated client; the "Find a card" button on home; the search screen with the picker, type, variant, results, groups, "Show more", no one yet, refusals and the failed state; returning from WhatsApp to the same results | 1, 2 | `apps/web/src/api/generated.ts`, `apps/web/src/main.tsx`, `apps/web/src/routes/circles/home/`, `apps/web/src/routes/search/`, `apps/web/src/routes/cards/add/card-form.tsx`, `apps/web/e2e/search.spec.ts` | `apps/web/src/routes/search/**/*.test.tsx`, `apps/web/src/routes/circles/home/**/*.test.tsx`, `apps/web/e2e/search.spec.ts` | T1C | yes | |
| T4B | Web: message on WhatsApp | The button with its busy state on search results and on the member cards screen, the reminder above the buttons, and the no-longer-available message | 3, 4 | `apps/web/src/routes/search/`, `apps/web/src/routes/circles/member/`, `apps/web/src/components/`, `apps/web/e2e/contact.spec.ts` | `apps/web/src/routes/search/**/*.test.tsx`, `apps/web/src/routes/circles/member/**/*.test.tsx`, `apps/web/e2e/contact.spec.ts` | T4A | yes | |
| T7 | Live check | A CWF-4 production check section in the runbook, filled in from your live walk-through, with the timed run | 6 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T4B | yes | |

The API parts run one after another: T1A, T1B, then T1C, since they share the bus's request list,
the exception filter and the API description. Once all three merge, you take an export and deploy
the API; T4A starts only after you confirm that deploy is live, then T4B, each needing a browser
run on this machine. T7 comes last.

The way in to each new screen (Known traps): T4A adds the "Find a card" button on home and its
browser test reaches the search screen by clicking it; T4B's buttons live on screens that are
already reachable (search results, and a member's cards from the circle's member list), and its
browser tests reach them by clicking.

New moving parts: none

## Notes

### What I need from you

- A manual export in Render before the API deploy, which changes the usage events table.
- For the live check: your second allowed account sharing a circle with you, with a card or two
  listed, and WhatsApp on your phone.
