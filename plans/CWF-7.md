# Leave, remove and run a circle

8 parts · Risks: a production migration, lost access after removal, deletion or clearing removals, admin succession under load · New moving parts: none

## What changes for you

- Any member can leave a circle from the circle screen, after confirming. They stop seeing the
  circle at once and can come back later through a valid invite link.
- If the admin leaves, the member who joined earliest becomes the new admin. If the last member
  leaves, the circle is deleted and its invite link stops working.
- As admin, you can remove a member after confirming. A removed person can't rejoin through this
  link or any later one; they see only "You can't join this circle." A "Clear all removals"
  button lets every removed person rejoin, but only by opening a valid link and tapping "Join".
  Nobody ever sees a list of who was removed.
- As admin, you can rename the circle, hand the admin role to another member after confirming,
  and delete the circle after a confirmation that says it is permanent. Deleting ends every
  membership and kills its invite link.
- Only the admin sees or can use these admin controls; other members see a "Leave circle"
  button only.
- When two people no longer share any circle, they stop seeing each other's names.
- Deleting your own account comes in a later story (CWF-5), and so do cards, search and the
  usage view.

## Why

A circle is a trusted group, and a leaked invite link can bring in someone who shouldn't be
there (decision 0006). Until now an admin's only remedy was resetting the link, which can't
take out someone who already joined. This story gives members a way out and gives the admin the
powers the circles spec promised: remove, clear removals, rename, hand over and delete. It comes
before cards (CWF-3), so that by the time people list which bank cards they hold, every circle
can already be cleaned up.

## Done when

1. **Any member can leave a circle after confirming, and can come back later through a valid
   link.**
2. **When the admin leaves, the earliest-joined remaining member becomes admin, and when the
   last member leaves, the circle is deleted and its link stops working.**
3. **The admin can remove a member after confirming; a removed person can't rejoin through any
   link and sees only "You can't join this circle." until the admin taps "Clear all
   removals".**
4. **The admin can rename the circle and hand the admin role to another member, after which
   only the new admin has admin powers.**
5. **The admin can delete the circle after a confirmation that says it is permanent; every
   membership ends, its link stops working, and its past usage is kept.**
6. **Only the admin can remove, clear removals, rename, hand over or delete, and people who no
   longer share a circle stop seeing each other's names, including through direct data
   requests.**
7. **It works live on creditwithfriends.in, checked by you and a second allowed account.**

## Risks

- **The first API deploy adds a new database table to production** (for removal blocks). Before
  that deploy, take a manual export in Render first (decision 0017).
- **Removing a member, deleting a circle and leaving take away access at once and can't be
  undone.** A removed or departed person can only come back through a valid link, and a deleted
  circle can't be restored. Each asks for confirmation first, and deletion says it is permanent.
- **"Clear all removals" can't be undone either.** It lifts every block in the circle at once,
  and since no list of removed people is kept on purpose, the blocks can't be rebuilt; the admin
  would have to remove each person again after they rejoin.
- **Admin succession must stay exact when actions happen at the same time.** A circle with
  members must always have exactly one admin, even when the admin leaves while someone joins or
  is removed. Every change runs one at a time under the circle lock that CWF-2 added, and tests
  race them.

## For the builders

The spec is `docs/specs/circles.md` (Leave, Remove, Admin powers, When the admin leaves, Deleted
circles and usage history, acceptance criteria 5 to 8, 10 to 15 and 17). The tables are in
`docs/architecture/11-data-model.md`.

### Done-when details

1. **Leave.**
   - `POST /api/v1/circles/:circleId/leave`, members only. It deletes the caller's
     `CircleMembership` row under the shared lock helper. Leaving never creates a removal block,
     so the person can rejoin later through a valid link and "Join".
   - Leaving is never refused for being the admin.
   - The web circle screen shows "Leave circle" to every member. The confirmation names the
     circle; for the admin it also says the admin role passes to the earliest-joined member, and
     for the last member it says the circle will be deleted. After leaving, the member lands on
     their circles list and the circle is gone from it.
   - A malformed circle id is refused as invalid input; leaving a second time, or leaving a
     circle you're not in, gives the same not-found result as viewing a circle you aren't in.
   - Tests (T1D): integration tests for leave and rejoin through the same link, a malformed id,
     a repeated leave and a non-member leave. Web tests (T4A): cancelling keeps the member in the
     circle; confirming leaves; the admin's confirmation shows the succession warning and the last
     member's shows the deletion warning before anything is sent.
2. **Succession and last member.**
   - When the admin leaves, in the same transaction, `Circle.adminMemberId` becomes the
     remaining member with the earliest `joinedAtUtc`; equal join times are broken by the lowest
     membership id, so the pick is always the same.
   - When no member remains, the circle is deleted as in item 5: `deletedAtUtc` set,
     `inviteCode` cleared, `adminMemberId` null and its removal blocks erased. Its link then
     shows the no-longer-valid message.
   - Every membership change (join, leave, remove, hand over, delete) takes the circle row lock
     first through the CWF-2 lock helper, so a circle with members always has exactly one admin.
   - **Admin checks happen under the lock.** Every admin action (remove, clear, rename, hand
     over, delete, invite reset) checks that the caller is the admin only after it holds the
     circle lock, through one helper pinned by T1A. An old admin who passed an earlier check can
     never act after a handover commits.
   - **Race tests don't depend on timing.** Each race holds the circle lock in one transaction,
     starts the competing action, waits until Postgres shows that action blocked on the lock
     (`pg_stat_activity` with `wait_event_type = 'Lock'` for its connection), then releases the
     lock and accepts either valid order, then checks the invariant (exactly one admin among
     current members, limits held). No sleeps; a race that never observes the wait fails.
   - **Usage rows are awaited before deletion.** Join records its usage event after the join
     commits, without waiting. Any test that deletes a circle and then checks its usage rows
     survive first waits until the join's usage row is visible in the database.
   - Tests: T1A's core tests cover succession, the tie-break, and the last member's departure
     deleting the circle: old link dead and usage rows kept (the test sets up the circle, members and usage events through the create and join endpoints, then
     calls the helpers through the app's own service; block erasure is proven in T1B through
     the endpoints). T1D proves the last member leaving through the leave
     endpoint: the old link gives the no-longer-valid result and usage rows remain. T1B proves,
     through the endpoints, that a removal's block is erased when the last member later leaves.
     T1D races an admin leaving against a join; T1B races a removal against a join and against
     the removed member leaving; T1C races the admin leaving against a handover, and an old
     admin's action against a handover.
3. **Remove and clear removals.**
   - `CircleRemovalBlock` (circleId, memberId, createdAtUtc; unique on the pair), as in the data
     model. Removing deletes the membership and creates the block in one transaction.
   - The admin cannot remove themselves (refused with a reason; the web screen offers no Remove
     button on the admin's own row).
   - `POST /api/v1/circles/:circleId/removals/clear` deletes every block of that circle. No
     endpoint ever returns removed people or a count of them.
   - The invite preview gains a `blocked` status, checked after "already a member" and before
     showing the preview, as in the spec's order. A blocked person sees only "You can't join this
     circle." with no circle name or count.
   - Join re-checks the block under the lock at the moment "Join" is pressed and refuses with the
     same message, whatever the screen showed. The block holds through every later reset of the
     link.
   - After clearing, a removed person is not added back; they rejoin only by opening a valid link
     and pressing "Join".
   - Removing someone who is no longer a member, or removing them twice, gives the not-found
     result and creates no extra block. Clearing a circle with no blocks succeeds and changes
     nothing.
   - Tests (T1B): integration tests for remove, blocked preview and join, a block surviving a
     reset, clear then rejoin, removing a departed member, a repeated removal, clearing an empty
     set, and the admin removing themselves refused. Web tests (T4B): cancelling a removal keeps
     the member; confirming removes them; the blocked invite message before and at Join; and the
     admin tapping "Clear all removals", after which the removed person opens a valid link, sees
     the preview and joins only by tapping "Join".
4. **Rename and hand over.**
   - Rename uses the same 1 to 40 character rule and message as creating
     (`circles/core/circle-create.rules.ts`), returned as a field error. A rename body that is
     missing a name or isn't text is refused as invalid input.
   - Hand over moves `adminMemberId` to another current member of the circle, after a
     confirmation that names them. Handing over to a non-member or to yourself is refused.
   - After a handover, the old admin is an ordinary member: the invite link, reset, remove,
     clear, rename, hand over and delete are refused to them, including through direct
     requests, and allowed to the new admin.
   - Tests (T1C): integration tests for rename limits and malformed input, handover, handing over
     to yourself or to a non-member refused, and the old admin refused every admin action
     afterwards. Web tests (T4C): rename errors; a valid rename shows the new name on the circle
     screen and in the circles list; cancelling a handover keeps the current admin; confirming
     hands it over, the old admin's controls disappear and the new admin sees them.
5. **Delete.**
   - Delete sets `deletedAtUtc`, clears `inviteCode` and `adminMemberId`, and deletes every
     membership and removal block of that circle in one transaction. The circle row stays with
     its last name, `createdAtUtc`, `deletedAtUtc` and `isOwnerCreated`, and its `UsageEvent`
     and `UsageEventCircle` rows stay untouched, so CWF-6 can count them under the last name
     marked "(deleted)".
   - The confirmation says deletion is permanent and can't be undone.
   - After deletion: the old link shows the no-longer-valid message to everyone, the circle is
     gone from every former member's list, and viewing it gives the not-found result.
   - Tests (T1C): an integration test deletes a circle with usage events and checks those events
     and the kept fields remain; that the old link gives the no-longer-valid result to a former
     member and to an outsider; and that former members get no list entry and the not-found
     result on a direct view. Web tests (T4C): the permanent warning, cancelling keeps the circle,
     confirming lands on the circles list without it.
6. **Admin-only and visibility.**
   - Remove, clear removals, rename, hand over and delete are refused to non-admin members and
     to non-members, including through direct requests; for a well-formed request, a non-member
     gets the not-found result.
   - **Order of checks:** the shape of the input (a malformed circle or member id, a rename body
     without text) is checked first, for everyone, and the invalid-input answer says nothing
     about any circle. Membership and the admin check come after, under the lock. T1C tests a
     non-member sending a malformed rename and getting the same invalid-input answer as a member.
   - A person's display name reaches someone only while they share at least one non-deleted
     circle. After a leave, removal or deletion, the circle view no longer returns either side's
     name to the other unless they still share another circle.
   - No endpoint in this story returns another member's WhatsApp number.
   - Tests: T1D (leave), T1B (removal) and T1C (deletion) each check both directions, once where
     the two people share no other circle and once where they still share another. Each API task
     tests its own admin-only refusals: T1B for remove and clear, T1C for rename, hand over and
     delete. T4B and T4C check that non-admins see no admin controls.
7. **Live check.** Kept as its own item at the owner's standing request, as in CWF-1 and CWF-2.
   On `creditwithfriends.in`, with the owner on their phone and a second allowed account on
   another device or browser: rename the circle; remove the second account and see it blocked
   on the old and a reset link; clear removals and rejoin; hand over the admin role and back;
   leave and rejoin; delete a throwaway circle and see its link die. Results go in a CWF-7
   section of `docs/architecture/deployment.md`.

- **Out of this story:**
  - **CWF-5 (account deletion):** passing the admin role on and erasing removal blocks when a
    member deletes their account (spec criteria 12 and 16 for account deletion).
  - **CWF-3 and CWF-4:** cards and WhatsApp numbers between members, which follow the same
    shared-circle rule.
  - **CWF-6:** showing usage counts, including deleted circles marked "(deleted)".
- **API contract, one part at a time:** the API parts run one after another, so each adds its own
  endpoints to `apps/api/openapi.json` and registers its controller in `circles.module.ts`:
  leave (T1D); remove, clear removals, the preview's `blocked` status and the join refusal code
  (T1B); rename, hand over and delete (T1C). The web client is generated once, in T4A, after all
  of them.
- **The admin-under-lock helper, pinned by T1A:** `circles/core/` gains the function that locks a
  circle and then confirms the caller is its admin. T1A moves the existing invite reset onto it;
  remove and clear (T1B) and rename, hand over and delete (T1C) call it.
- **Membership-ending helpers, pinned by T1A:** `circles/core/` gains the function that ends a
  membership under the lock and applies succession or last-member deletion, and the function
  that deletes a circle. Leave (T1D), remove (T1B) and delete (T1C) call them.
- **Web structure, pinned by T4A:** T4A owns `circle-page.tsx`. It wires the leave control and
  commits stub `circle-member-removal.tsx` and `circle-admin-settings.tsx` components in their
  places on the page, so T4B and T4C each fill only their own file.
- **Proof belongs where the behaviour lives:** locking, races, blocks, succession and kept usage
  rows are proven in API integration tests against the real database. Web tests prove what the
  screens show and send; they don't repeat server proofs.
- **Production deploys:** deploy the API once, after T1A, T1D, T1B and T1C have all merged, so
  every new endpoint goes live together. Take an export in Render before that deploy, since it brings
  the migration (decision 0017). **Checkpoint:** T4A starts only after the owner confirms that
  API deploy is live, because Cloudflare publishes each web part as soon as it merges.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| T1A | Circles API: removal table and shared helpers | The `CircleRemovalBlock` table and migration; the helpers that end a membership with succession or last-member deletion, delete a circle, and lock a circle then confirm its admin; invite reset moved onto the admin helper | 2 | `apps/api/prisma/`, `apps/api/src/modules/circles/core/`, `apps/api/src/modules/circles/invite/`, `apps/api/test/circles-membership-end.integration.spec.ts` | `apps/api/src/modules/circles/core/**/*.spec.ts`, `apps/api/src/modules/circles/invite/**/*.spec.ts`, `apps/api/test/circles-membership-end.integration.spec.ts` | | no |
| T1D | Circles API: leave | The leave endpoint and its contract, through the shared helper, with succession, last-member deletion through the endpoint, its refusals, the leave-against-join race and name visibility after leaving | 1, 2, 6 | `apps/api/src/modules/circles/leave/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/openapi.json`, `apps/api/test/circles-leave.integration.spec.ts` | `apps/api/src/modules/circles/leave/**/*.spec.ts`, `apps/api/test/circles-leave.integration.spec.ts` | T1A | no |
| T1B | Circles API: remove and clear removals | The remove and clear endpoints and their contract; the blocked preview status and the join re-check under the lock; its races (including against leaving) and name visibility after removal | 3, 6 | `apps/api/src/modules/circles/removals/`, `apps/api/src/modules/circles/join/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/openapi.json`, `apps/api/test/circles-removals.integration.spec.ts` | `apps/api/src/modules/circles/removals/**/*.spec.ts`, `apps/api/src/modules/circles/join/**/*.spec.ts`, `apps/api/test/circles-removals.integration.spec.ts` | T1D | no |
| T1C | Circles API: rename, hand over and delete | The rename, hand over and delete endpoints and their contract, admin-only under the lock, with usage rows kept; its races (including against leaving), the order of checks and name visibility after deletion | 4, 5, 6 | `apps/api/src/modules/circles/manage/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/openapi.json`, `apps/api/test/circles-manage.integration.spec.ts` | `apps/api/src/modules/circles/manage/**/*.spec.ts`, `apps/api/test/circles-manage.integration.spec.ts` | T1B | no |
| T4A | Web: leave and circle screen structure | The regenerated API client; "Leave circle" with its confirmation and warnings; stub removal and admin-settings components placed on the circle screen | 1 | `apps/web/src/api/generated.ts`, `apps/web/src/routes/circles/circle/`, `apps/web/e2e/circle-leave.spec.ts` | `apps/web/src/routes/circles/circle/circle-leave*.test.tsx`, `apps/web/e2e/circle-leave.spec.ts` | T1B, T1C | yes |
| T4B | Web: remove members and blocked invites | The admin's Remove on each member row with its confirmation and "Clear all removals"; the invite page's "You can't join this circle." for a blocked person, before and at Join | 3, 6 | `apps/web/src/routes/circles/circle/circle-member-removal.tsx`, `apps/web/src/routes/circles/circle/circle-member-removal.test.tsx`, `apps/web/src/routes/circles/join/`, `apps/web/e2e/circle-removals.spec.ts` | `apps/web/src/routes/circles/circle/circle-member-removal.test.tsx`, `apps/web/src/routes/circles/join/**/*.test.tsx`, `apps/web/e2e/circle-removals.spec.ts` | T4A | yes |
| T4C | Web: rename, hand over and delete | The admin's rename, hand over and delete controls with their confirmations; non-admins see none of them | 4, 5, 6 | `apps/web/src/routes/circles/circle/circle-admin-settings.tsx`, `apps/web/src/routes/circles/circle/circle-admin-settings.test.tsx`, `apps/web/e2e/circle-admin.spec.ts` | `apps/web/src/routes/circles/circle/circle-admin-settings.test.tsx`, `apps/web/e2e/circle-admin.spec.ts` | T4A | yes |
| T7 | Live check | A CWF-7 production check section in the runbook, filled in from your live walk-through | 7 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T4B, T4C | yes |

The API parts run one after another: T1A, T1D, T1B, then T1C, because T1C proves a former
admin is refused every admin action, including T1B's. Once all API parts merge, you
take an export and deploy the API; T4A starts after that, then T4B and T4C run side by side,
each filling its own component. T7 comes last.

New moving parts: none

## Notes

### What I need from you

- A manual export in Render before the first API deploy, which adds the removal table.
- The same second allowed Google account as last time, for the live check.
- A throwaway circle for the live check's deletion step, so "Family" survives.
