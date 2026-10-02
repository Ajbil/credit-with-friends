---
reader: codex (gpt-6-sol)
read_at: 2026-10-02T20:46:55+00:00
read_hash: 05e877aba232c85b4b252299cf7927dd1c9fa524
round: 2
passed: no
doc_seen: 05e877aba232c85b4b252299cf7927dd1c9fa524
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 8212acaa5bcbc3056b05e2e9ecac712a848995c4
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc once, then
run `forge read <doc> --amended`:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options. There is no second read.

1. Split: T1 → circle data and create/view; invite and usage API.
   It spans four modules, a migration, the full API contract, controllers and integration tests. Its scope strongly suggests more than 400 changed lines. The first part must pin the schema and API contract used by later tasks.
   Disposition: keep amended: split into T1A (data, create and view; pins schema, bus, lock helper, optional-session guard and the full API contract) and T1B (invite link and usage events), consistent with the owner's choice to split oversized parts in CWF-1

2. Split: T3 → leave, removal and succession; rename, handover and deletion.
   Seven operations, their permission checks and concurrency cases are too much for one task. Pin the shared circle-deletion operation in the first part so last-member leave and admin deletion use the same rule.
   Disposition: keep amended: split into T3A (leave, removal, succession; pins the shared circle-deletion operation) and T3B (rename, handover, delete using it)

3. Split: T4 → home and create; circle view and invite controls.
   Two screens, route registration, client generation and end-to-end coverage suggest more than 400 changed lines.
   Disposition: keep amended: split into T4A (home and create; pins routes and client) and T4B (circle screen and invite controls)

4. Split: T6 → leave and removal controls; remaining admin controls.
   Confirmations and UI states for six actions suggest more than 400 changed lines.
   Disposition: keep amended: split into T6A (leave, remove, clear removals) and T6B (rename, hand over, delete)

5. Pin the web route seam before T5 and T6.
   T4 promises to register their routes in `main.tsx`, but its scope does not include the join or manage folders needed for compilable stub components. Let T4 commit those stubs with explicit scope, or give route registration to a small wiring task. T5 and T6 should depend on the task that pins this shared route line.
   Disposition: keep amended: T4A's scope now covers apps/web/src/routes/circles/ and commits a stub component for every circle route; T4B, T5, T6A and T6B list T4A (directly or via T4B) under After

6. Pin an optional-session invite preview in T1’s API contract and scope.
   A signed-out visitor must see a dead-link result before sign-in, while a signed-in visitor must be recognized as a member or a blocked person. The existing session guard rejects unauthenticated requests, and its public-route mode skips session resolution entirely. Neither mode supports both cases; the guard change also sits outside T2’s scope.
   Disposition: keep amended: T1A pins an optional-session mode in the session guard (apps/api/src/modules/sessions/ in its scope) used by the invite preview

7. Pin the transaction and lock interface shared by T2 and T3.
   Both join and management actions change membership under a circle lock, but T1 pins no common lock function or lock order. Define the circle/member locking operation and order in T1 so parallel implementations cannot acquire them differently.
   Disposition: keep amended: T1A pins one lock helper in circles/core that locks the circle row first, then member rows in ascending id order; every membership write uses it

8. State the owner-configuration prerequisite for creation.
   `OWNER_GOOGLE_ACCOUNT_ID` is optional at boot today, yet Done-when 1 requires an owner-created value fixed at creation. T1 must say whether creation is refused until it is configured; the live setup notes also need that configuration step.
   Disposition: keep amended: Done-when 1 and the builders notes say isOwnerCreated is true only when OWNER_GOOGLE_ACCOUNT_ID is set and equals the creator; creation is never refused; production already has it set (CWF-1 runbook)

9. Clear `adminMemberId` when deleting a circle.
   The plan says deleted circles keep only their name, dates, owner flag and usage history, but its stated nulling rule applies when the member row is deleted. Admin deletion and last-member leave can leave the member row intact, so T3 must explicitly null this field on circle deletion.
   Disposition: keep amended: the shared deletion operation (T3A) clears inviteCode and adminMemberId, sets deletedAtUtc and deletes memberships and blocks

10. Cut or defer: the WhatsApp-number bus answer and “members sharing a circle with X” query.
    CWF-2 displays member names and controls circle access; no CWF-2 screen or API needs another member’s number or that future search query. Add each with the story that first uses it, while retaining the account lookup and usage recording needed here.
   Disposition: cut

11. Cut or defer: future-event fields in T1’s usage table.
    This story records only invite and join events. Bank, card, search and contact fields have no CWF-2 behaviour to serve, and the Bank table is scheduled for the cards story. Add those fields when their events are implemented.
   Disposition: cut

## Round 2

12. Disputed keep 1: T1A still appears too large for one task.
    It includes a service bus, four tables and a migration, account and session changes, a lock helper, create/list/view endpoints, the full API contract, four stub controller areas, and integration tests. Split the shared foundations from create and view while keeping the contract pinned before its consumers start.
   Disposition: keep amended: T1A now holds foundations, create and list (Done-when 1); the circle view with members moved to new T1C (Done-when 4); the API contract stays pinned in T1A before its consumers start

13. Creation cannot use the stated lock order.
    The shared helper says every membership write locks the circle row first, but a new circle has no row to lock. Pin creation’s lock path and test simultaneous creates and joins for a member near the 20-circle limit.
   Disposition: keep amended: creation locks only the creator's member row (no circle row exists yet, so it never deadlocks with a join's circle-then-member order); a test races creates and joins near the 20-circle limit

14. T1A must initialize the invite code when it creates a circle.
    The spec requires every circle to have one active link. T1B owns invite behaviour but has no scope to change T1A’s create operation. Assign code generation to T1A and prove a newly created circle has a valid, unique link.
   Disposition: keep amended: T1A generates the invite code at creation, with a test that each new circle has a valid, unique code

15. Pin the usage module’s registration before T1B.
    `AppModule` explicitly registers modules. T1B adds `UsageModule` but cannot edit `app.module.ts`; T1A owns that file and does not promise a usage stub. Give that registration to T1A, or assign the shared line to a wiring task.
   Disposition: keep amended: T1A registers a stub UsageModule in app.module.ts and owns apps/api/src/modules/usage/ for it; T1B fills it in

16. Usage-event failure contradicts Done-when 2 and 3.
    Those items say every copy, share and successful join records an event. The builders’ rule logs and discards a failed post-commit record, permanently losing that count. Specify the intended guarantee and a failure test before implementation.
   Disposition: keep amended: Done-when 2 and 3 now say a failed record never undoes the action and leaves that one event uncounted, matching the roadmap; the builders notes require a test that forces a failure

17. Unproven: item 3: a dead link opened with an expired or invalid session cookie.
    Optional-session preview must still show the same dead-link message to that visitor. T2’s Tests cell names an integration file but does not pin this case or the guard behaviour it depends on.
   Disposition: keep amended: the optional-session mode treats an expired or invalid cookie as no session, never a 401; T2 tests a dead link opened with such a cookie
