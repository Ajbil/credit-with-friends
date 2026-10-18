---
reader: codex (gpt-6-sol)
read_at: 2026-10-18T06:38:38+00:00
read_hash: 1dc186a44a43d485c79eed80517997eef602bf28
round: 9
passed: yes
doc_seen: 1dc186a44a43d485c79eed80517997eef602bf28
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 9ab1b3263023e25e55830b34e16dcc101a8bc58c
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. T1A cannot run its stated “every seeded bank can be added” test.
   The add endpoint arrives in T1B. T1A can prove the seeded bank list and order; move the add test to T1B.
   Disposition: keep amended: T1A proves the seeded list and order; adding a card for every seeded bank moved to T1B

2. The bank-list API contract conflicts with the constitution’s pagination rule.
   `GET /banks` promises all 46 banks, while list endpoints default to 20 items. T1A must pin the response and pagination contract so T4A can make every bank selectable.
   Disposition: keep amended: GET /banks is paged per the constitution (default 20, max 100) and the web asks for one page of 100

3. The refusal contract does not say where duplicate and 21st-card errors appear.
   Neither belongs to one field, yet T4A must show every refusal beside a field. T1A and T1B should pin status, code and `details.fieldErrors` values, including form-level errors, before T4A uses them.
   Disposition: keep amended: T1A pins the error contract: field errors on bankId and variant, CARD_DUPLICATE and CARD_LIMIT as 409 form-level errors shown above Save

4. Item 6 can record the wrong circles.
   The event is sent after the add commits; a join or leave before asynchronous recording could change its circle list. Pin how the add captures membership at that moment and test the race. T1B’s Scope also omits the usage recorder and any bus contract it must change.
   Disposition: keep amended: the add reads circle ids in its transaction under the member-row lock that joins, leaves and removals also take; T1B adds a CardListedEvent with circleIds to the usage recorder (usage module in scope) and races an add against a join

5. Unproven: item 6: an add by a member in no circle still creates one event with zero circles.
   T1B’s test says “none for a member in no circle,” which can mean no event and contradicts the confirmed specs.
   Disposition: keep amended: a member in no circle gets one event with zero circles

6. The welcome route contradicts the confirmed cards spec for existing members.
   The spec invites people to add cards after onboarding, with an invite shown first when applicable. T4D also sends an already onboarded member who opens an invite there, potentially on every visit. Pin how it recognises a newly onboarded invitee; test both finishing and skipping back to the circle.
   Disposition: keep amended: onboarding returns to the invite with a just-onboarded marker; only then does the invitation follow the invite; tests cover finishing, skipping and a later invite with no invitation

7. Unproven: item 8: the live onboarding and invite checks can be performed with the named accounts.
   The second allowed account has already onboarded during earlier live checks, and account deletion is deferred to CWF-5. T7 needs a fresh allowed identity or a different stated way to exercise onboarding.
   Disposition: keep amended: the live check uses two never-onboarded Google accounts added to the allowed list; noted under What I need from you

8. Unproven: item 1: a pending sign-in cannot list or add cards through direct requests, and an empty or failed “Your cards” load has a usable screen state.
   The named tests cover a completed member adding a card, but not those access and screen states.
   Disposition: keep amended: a pending sign-in refused (T1B) and the list empty and failed states (T4A)

9. Unproven: item 2: missing or malformed bank and type inputs, simultaneous identical adds, and non-storage or non-logging of a refused unsafe variant.
   “Each refusal” does not explicitly prove these direct-request, concurrency and privacy cases.
   Disposition: keep amended: missing and malformed bank and type, the identical-add race and a refused variant leaving no row or log line, all in T1B

10. Unproven: item 3: unknown and malformed card IDs return the same not-found result as another member’s card.
    T1B names only the other-member case.
   Disposition: keep amended: malformed ids are invalid input; unknown and other members' ids give the same not-found result; tested in T1D

11. Unproven: item 4: when two people share two circles and one membership ends, the old circle URL refuses access while the remaining circle still works.
    T1C names single-circle loss cases but not this boundary. T4C also needs proof for a member with no cards and for a failed card load.
   Disposition: keep amended: T1C tests two shared circles with one membership ended; T4C tests no cards and a failed load

12. Unproven: item 7: a bank rename appears in both the holder’s list and another member’s card view.
    The stated integration test checks one existing card without naming both responses.
   Disposition: keep amended: the rename test moved to T1C and checks both the holder's list and another member's view

13. Split: T1B → list/add with limits and usage recording; edit/remove with ownership checks.
    Four endpoints, locking, event integration and their API tests suggest more than about 400 changed lines.
   Disposition: keep amended: split into T1B (list and add, limits, event) and T1D (edit, remove, ownership)

14. Split: T4A → “Your cards” list and navigation; add form with refusals and the missing-bank note.
    The generated client, routes, stub pages, two screens and browser coverage make this task similarly large. Register future routes when their pages ship; the web tasks already run in sequence.
   Disposition: keep amended: split into T4A (client, list, home link) and T4E (add form, refusals, missing-bank note); each web part registers its own route as it ships

15. The Risks section omits permanent card removal.
    Item 3 hard-deletes a member’s card. Name that one-way step and its confirmation under Risks.
   Disposition: keep amended: Risks now names permanent card removal and its confirmation

## Round 2

16. Disputed keep 3: the error contract still does not name every promised refusal code.
    T1A names `CARD_DUPLICATE` and `CARD_LIMIT`, but gives only status and field for unknown bank, overlong variant and unsafe variant. Pin each code and its filter message.
    Disposition: keep amended: every refusal now has a pinned code, status, field and message: CARD_BANK_UNKNOWN, CARD_VARIANT_TOO_LONG, CARD_VARIANT_UNSAFE, CARD_DUPLICATE, CARD_LIMIT

17. Disputed keep 4: the stated member-row locking rule is false for membership endings.
    Current leave, removal and circle deletion paths lock the circle, not the departing member. They can change the membership while an add holds that member’s lock. T1B needs a compatible lock change in Scope and a leave or removal race test.
    Disposition: keep amended: the add locks the member row FOR UPDATE and its membership rows FOR SHARE, which blocks leave, removal and deletion from deleting them; it never takes a circle lock, so no deadlock; T1B races an add against a join and a leave

18. Unproven: item 6: edits and removals create no `card_listed` event.
    T1B promises a no-event edit test before T1D adds editing, and no task names a no-event removal test. Put both in T1D.
    Disposition: keep amended: T1D proves edits and removals record no event

19. Unproven: item 6: slow event recording does not delay the add response.
    A forced recording failure proves the card remains saved, but does not catch accidentally awaiting a slow recorder. T1B needs a blocked-handler test showing the add returns first.
    Disposition: keep amended: T1B holds the recorder open and sees the add return first

20. Unproven: item 5: the just-onboarded marker cannot be replayed.
    A later invite without `?welcome=1` is tested, but the suggested URL marker can be retained or reopened. Pin when it is consumed and test a later visit carrying the old marker.
    Disposition: keep amended: the marker is a one-time session-storage flag cleared on use, never a URL parameter; T4D tests reload and a later visit

21. Item 5’s add-card return path is unpinned between T4E and T4D.
    Plain onboarding sends an added card to “Your cards”; invite onboarding says finishing goes to the circle. Pin how the add page receives that destination, which task implements it, and a test for saving a card from the invite welcome flow.
    Disposition: keep amended: the add screen takes an internal returnTo (T4E, outside URLs ignored); the invitation passes the circle path; T4D tests saving from the invite flow

22. Unproven: item 3: editing an existing card when the member already has 20 cards succeeds.
    “Every add rule” could make the limit check refuse an edit that does not increase the count. Add this case to T1D.
    Disposition: keep amended: editing never counts against the limit; T1D edits at 20 cards

23. Unproven: item 4: malformed circle and member IDs receive a controlled refusal.
    T1C tests membership failures but names no malformed-ID case; an unchecked UUID can reach the database and become a server error.
    Disposition: keep amended: malformed circle and member ids are invalid input; tested in T1C

24. T4A’s production prerequisite is absent from its `After` entry.
    `After: T1C` makes it ready when T1C finishes, while the plan requires the manual export and a live API deploy first. Represent that gate so T4A cannot start early.
    Disposition: keep the After column accepts only task ids (Forge rejects anything else as malformed); the deploy checkpoint is stated as the gate under Production deploys and the coordinator enforces it

## Round 3

25. Item 6’s membership snapshot crosses the module boundary.
    T1B now reads and locks `CircleMembership` inside the cards module, while the constitution and architecture require cross-module reads through the service bus. Pin a transactionally consistent circles-module contract and include its files in Scope.
    Disposition: keep amended: the circles module answers a "lock and list a member's circles" bus request on the caller's transaction; the cards module never reads memberships; its folder is in T1B's Scope

26. Unproven: item 5: an invalid invite cannot leave the one-time flag for a different invite.
    The flag is cleared after a successful join or direct circle opening. Pin what happens when the original invite was reset, deleted or fails to load, and test a later valid invite in the same tab.
    Disposition: keep amended: the flag holds the invite path and is cleared on any outcome of that invite, including dead, blocked, refused and failed; other paths ignore and clear it; T4D tests a later valid invite in the same tab

27. Unproven: item 2: the edit screen always shows the card-details reminder and places each refusal correctly.
    T4E tests the add screen’s messages; T4B names only “edit errors.” Name the edit reminder and refusal cases in T4B’s browser tests.
    Disposition: keep amended: T4B tests the edit reminder and each refusal in its place

28. Unproven: item 4: another member’s next load reflects each add, edit and removal.
    T1C proves initial visibility and membership changes, but names no test that reloads the member view after those three card mutations.
    Disposition: keep amended: T1C reloads another member's view after the holder adds, edits and removes a card

29. Unproven: item 7: a corrected bank name appears in the bank picker.
    The confirmed spec says the correction appears everywhere the bank appears. T1C checks both card views after a rename, but no test checks `GET /banks`.
    Disposition: keep amended: T1A checks a renamed bank in GET /banks; T1C checks both card views

## Round 4

30. The new bus requests cannot be registered within their task scopes.
    `ServiceBus.registerRequest` accepts only keys declared in `apps/api/src/service-bus/service-bus.service.ts`. T1B’s circles request and T1C’s cards request both need that file in Scope, with their request names and input/output types pinned there.
    Disposition: keep amended: circles.lockMemberCircles (T1B) and cards.memberCards (T1C) are pinned with input and output types in the Requests map, and service-bus.service.ts is in both Scopes

31. Disputed keep 26: clearing the invitation flag on a failed load loses the invitation after a temporary network failure.
    A retry of the same valid invite would succeed without showing the promised post-onboarding page. Keep the path-bound flag for a retry of that invite; clear it for terminal refusals and an unrelated path, and test the retry.
    Disposition: keep amended: a failed load or failed Join keeps the path-bound flag so a successful retry still shows the invitation; only terminal results and other paths clear it; T4D tests the retry

32. Unproven: item 5: Skip after plain onboarding goes to the circles list.
    T4D explicitly tests Skip for the invite route, but “tests the plain onboarding route” does not pin its separate Skip destination.
    Disposition: keep amended: T4D tests that Skip after plain onboarding lands on the circles list

## Round 5

33. Unproven: item 4: membership ending between the access check and card fetch cannot expose cards.
    T1C checks both memberships, then calls `cards.memberCards`; the plan does not keep that authorization valid through the fetch. Pin the transaction or locking boundary and test a leave or removal racing that read.
    Disposition: keep amended: T1C runs the membership check and the cards request in one transaction holding both membership rows FOR SHARE; cards.memberCards takes that transaction; T1C races a leave and a removal against the read

## Round 6

No findings.

## Round 7

34. Simpler: `CardShortcut` table and endpoint → release-owned shortcut definitions in the web app.
    Shortcuts are never edited in the app and saved cards never refer to them. A small list of brand, bank id, type and variant would deliver the picker without a third table, migration or API endpoint.
    Disposition: keep amended: shortcuts are a release-owned list in the web app (card-shortcuts.ts); no table, migration or endpoint

35. Unproven: item 7: a corrected bank name appears in shortcut labels.
    Shortcuts store labels such as “OneCard (Federal Bank)”. Renaming `Bank.displayName` would leave those labels stale. Derive the bank portion from the current bank name and test the picker after a rename.
    Disposition: keep amended: labels are built from the brand and the bank's current name from GET /banks; T4E tests a rename

36. Unproven: item 1: the 27 shortcuts have the specified bank, type and variant, and remain editable.
    T1A proves only that each bank exists; T4E exercises one shortcut and changes only its variant. Those tests would miss a wrong issuer, the Jupiter debit shortcut set to credit, or a bank or type that cannot be changed before saving.
    Disposition: keep amended: T4E checks all 27 shortcuts against the spec in a table-driven test, every shortcut bank in the live list, and a flow on the Jupiter debit shortcut changing bank, type and variant

37. Unproven: item 1: a failed bank or shortcut load has a usable add screen.
    T4E names no loading failure or retry test for either picker source. A failed request must not leave a misleading partial list or an unusable form.
    Disposition: keep amended: T4E tests a failed bank-list load: error with retry, no partial picker, Save disabled

38. Unproven: item 7: the support address is visible without an email app.
    The spec requires the address as text as well as a `mailto:` link. T4E checks the link only.
    Disposition: keep amended: the address is visible text beside the button; T4E tests it

39. T1C conflicts with the architecture’s module ownership.
    `docs/architecture/10-system-overview.md` assigns member card browsing to `search/`, while T1C puts its endpoint in `circles/`. Pin the chosen ownership and include the architecture correction in T1C’s Scope.
    Disposition: keep amended: member card browsing follows the architecture: T1C creates the search module, which asks circles (circles.lockSharedMembership) and cards (cards.memberCards) through the bus on one transaction

40. Unproven: item 1: a saved card appears in “Your cards” in a browser flow.
    T1B checks the API list, while T4A names empty and failed states and T4E names saving. Add a browser assertion that the saved card appears on the list.
    Disposition: keep amended: T4E's browser flow sees the saved card in Your cards

## Round 8

41. T1C’s visibility contract conflicts with the privacy architecture.
    `docs/architecture/13-privacy-deletion-jobs.md` says one circles bus query backs member-card browsing. T1C introduces `circles.lockSharedMembership` instead. Update that architecture document in T1C’s Scope to describe the transaction-held check.
    Disposition: keep amended: T1C updates the privacy architecture doc (in its Scope) to describe the transaction-held per-circle check for browsing; the general sharing query stays for CWF-4 search and contact

42. Unproven: item 4: circle deletion racing a member-card read.
    T1C tests deletion after it finishes, but its locking claim also covers deletion during a read. Add an observed-wait race test that accepts cards only before deletion commits, or a not-found result afterward.
    Disposition: keep amended: T1C races a circle deletion against the read, alongside leave and removal

## Round 9

No findings.
