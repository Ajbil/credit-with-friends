---
reader: codex (gpt-6-sol)
read_at: 2026-10-14T12:47:55+00:00
read_hash: 0bd01f2a784595139cae119c4b8e296bc5f8ca59
round: 5
passed: yes
doc_seen: 0bd01f2a784595139cae119c4b8e296bc5f8ca59
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 56f9aeccd76d2367d439fad1995a504c7c3ceda0
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. The story contradicts itself on who can leave.
   Item 1 allows every member to leave; item 6 says “Only the admin can do any of this.” Narrow item 6 to the admin controls.
   Disposition: cut

2. T1A would deploy routes that the API contract presents as working but whose controllers are still stubs.
   The plan calls for a production deploy after each API part. Delay that deploy until T1B and T1C work, or keep the unfinished routes out of the deployed contract.
   Disposition: keep amended: the API deploys once after T1A, T1D, T1B and T1C merge, and stubs answer 501 until then

3. Split: T1A → shared schema and contract, then leave and succession.
   A migration, seven endpoint contracts, stub controllers, two shared helpers, leave behavior and database tests suggest more than about 400 changed lines. Keep the shared contract pinned before T1B and T1C use it.
   Disposition: keep amended: split into T1A (table, contract, stubs and shared helpers) and T1D (leave)

4. Split: T4A → leave screen, then admin settings.
   The generated client plus leave, rename, handover and delete flows and their browser tests suggest more than about 400 changed lines.
   Disposition: keep amended: split into T4A (client, leave and page structure with stub components) and T4C (rename, hand over, delete); T4B fills the removal component

5. T4A’s `After T1B` link appears unnecessary.
   T1A pins the full API contract and T4A uses leave and manage actions. Remove that link unless T4A needs a specific T1B implementation, and name that dependency.
   Disposition: keep amended: T4A now waits for T1D, T1B and T1C because its browser test needs the live endpoints and web parts deploy as they merge

6. Admin authorization must be checked when the mutation holds the circle lock.
   The plan pins locking but not a recheck after acquiring it. An old admin could otherwise pass an early check, wait for a concurrent handover, then remove or delete as the new admin takes over. Pin this shared rule in T1A for T1B and T1C.
   Disposition: keep amended: admin checks happen under the circle lock through one helper pinned by T1A; T1C races an old admin against a handover

7. Unproven: item 1: malformed circle ID, repeated leave and non-member leave.
   The stated integration test covers leave and rejoin, but not the promised not-found response or invalid input.
   Disposition: keep amended: item 1 now names malformed id, repeated leave and non-member leave, tested in T1D

8. Unproven: item 1: admin and last-member confirmation warnings.
   The web test says it confirms and cancels leave; it does not explicitly prove either warning branch before the access-ending action.
   Disposition: keep amended: T4A web tests check both warning branches before anything is sent

9. Unproven: item 2: leave racing removal and handover.
   T1A assigns these tests before T1B and T1C implement the other operations. Put each race test in the task that completes both sides.
   Disposition: keep amended: each race test moved to the task that completes both sides (T1D, T1B, T1C)

10. Trap: tests that fail only under machine load: item 2.
    “Tests race them” needs a controlled overlap and assertions for either valid ordering; timing-based starts or sleeps would make the result unreliable.
   Disposition: keep amended: races hold the lock, start the competitor, release, accept either order; no sleeps

11. Unproven: item 2: the last member’s departure performs the full deletion.
    The named test does not explicitly check that the old link dies, removal blocks are erased and past usage survives this deletion path.
   Disposition: keep amended: T1A core test checks last-member deletion in full: dead link, blocks erased, usage kept

12. Unproven: item 3: removing an already departed member, repeating removal, clearing an empty set and cancelling removal.
    Pin each refusal or harmless repeat and its user-visible result in T1B or T4B’s tests.
   Disposition: keep amended: departed member, repeated removal and empty clear pinned in T1B; cancelling removal in T4B

13. Unproven: item 4: handing over to oneself or a non-member, and malformed rename input.
    These refusals are specified, but the named tests cover only rename limits, a successful handover and the former admin’s lost powers. Also prove that cancelling handover keeps the current admin.
   Disposition: keep amended: handover to self or non-member and malformed rename in T1C; cancelling handover in T4C

14. Unproven: item 5: cancelling deletion and access after deletion.
    The tests retain usage rows and show the warning, but do not explicitly prove cancel leaves the circle intact, the old link fails for everyone, and former members get no list or direct-view access.
   Disposition: keep amended: delete tests cover cancel (T4C), dead link for everyone and former members without access (T1C)

15. Unproven: item 6: name visibility in both directions, with and without another shared circle.
    The details promise a test, but no task’s Tests cell assigns those cases. Name the owning integration test for leave, removal and deletion.
   Disposition: keep amended: T1D, T1B and T1C each test name visibility both ways, with and without another shared circle

16. The Risks section omits a one-way step: “Clear all removals.”
    It deletes every block, and the app intentionally has no list from which to reconstruct them. State the effect alongside the other access-changing actions.
   Disposition: keep amended: Risks now names Clear all removals as one-way

17. Cut or defer: item 7 as a standalone Done-when outcome.
    The confirmed circles spec has no live-phone success measure. Keep the phone walkthrough as proof for items 1–6. Its current procedure also permits the second account to use a desktop, so it does not prove the stated “phones” result.
   Disposition: keep the owner wants a live production walk-through recorded for each story, as in CWF-1 and CWF-2; reworded to creditwithfriends.in with a second account on another device or browser

## Round 2

18. Disputed keep 3: T1A still appears larger than the roughly 400-line task limit.
    It owns the migration, full API contract, three sets of stub controllers, three helpers, the invite-reset change and database tests. Splitting off leave did not make this part small.
    Disposition: keep amended: split again into T1A (table, contract and stubs) and T1E (shared helpers and the invite reset move)

19. Disputed keep 5: T4A’s `After` links do not ensure the API is live.
    T4A’s browser test uses leave, not T1B’s removal endpoint. Merging the API tasks does not itself complete the manual Render export and deploy; pin that checkpoint before the first web merge that calls the new API.
    Disposition: keep amended: T4A now waits for the owner's API deploy as an explicit checkpoint, after all API parts merge

20. Disputed keep 10: starting a competing request does not prove it reached the held lock.
    Under load, the request may begin only after the lock is released, so the test passes without exercising a race. Require an observed waiting state or another reliable barrier.
    Disposition: keep amended: each race waits until pg_stat_activity shows the competitor blocked on the lock before releasing; a race that never sees the wait fails

21. T1B and T1C need `After T1D`.
    T1B’s removal-versus-leave test and T1C’s handover-versus-leave test need T1D’s leave endpoint. Those tests cannot run while all three tasks proceed from T1A in parallel.
    Disposition: keep amended: T1B and T1C now follow T1D

22. Unproven: item 2: last-member deletion through the leave API.
    T1A tests the shared helper while its leave controller still returns 501; T1D does not explicitly test the full last-member result through HTTP. Put that proof in T1D, with the block-cleanup case after removal is available.
    Disposition: keep amended: T1D proves last-member deletion through the endpoint; T1B proves a removal block is erased when the last member later leaves

23. Unproven: item 3: using “Clear all removals” in the web flow.
    T1B tests the API and T7 checks production, but T4B’s named web tests cover removal and the blocked invite, not tapping Clear and then rejoining.
    Disposition: keep amended: T4B web test taps Clear all removals and has the removed person rejoin through Join

24. Unproven: item 4: successful web rename and the new admin’s controls.
    T4C’s named web tests cover rename errors and the former admin losing controls. Add proof that a valid rename appears and that the new admin sees the controls.
    Disposition: keep amended: T4C web tests a valid rename appearing and the new admin seeing the controls

25. Unproven: item 6: a non-member sends malformed input to an admin endpoint.
    The plan promises not-found for non-members and validation errors for malformed rename input, but does not pin which takes precedence or test the combination.
    Disposition: keep amended: input shape is checked first for everyone, then membership and admin; T1C tests a non-member malformed rename

## Round 3

26. The story is duplicated after the first `New moving parts: none` line.
    It now has two approval sections and conflicting task tables: the second still has eight parts and the old dependencies. Keep one copy and preserve its Notes.
    Disposition: cut

27. T1C needs `After T1B`.
    Its test that the former admin is refused *every* admin action includes remove and clear removals, which T1B implements. The first task table still runs them side by side.
    Disposition: keep amended: T1C now follows T1B; the API parts run one after another

28. Cut or defer: T1A’s claimed coverage of item 6.
    T1A delivers a table, contract and 501 stubs. Its contract test cannot prove admin-only refusal or name visibility; assign that coverage to the tasks with working endpoints.
    Disposition: keep amended: T1A now also owns the admin-under-lock helper and moves invite reset onto it, so its tests prove admin-only refusal for reset (item 6)

29. The admin-lock helper has two stated owners.
    Item 2 still says it is pinned by T1A, while the shared-helpers section and first task table assign it to T1E. Make the owner consistent.
    Disposition: keep amended: the admin-under-lock helper is pinned by T1A everywhere; T1E pins only the membership-ending helpers

30. Disputed keep 25: the non-member refusal rule still contradicts the chosen check order.
    Item 6 says non-members get not-found, while its new rule gives a non-member with malformed input an invalid-input response. Qualify the not-found promise as applying to well-formed requests.
    Disposition: keep amended: the not-found promise now applies to well-formed requests; malformed input gets invalid-input for everyone

31. T1E’s planned database inserts conflict with the repository’s test guidance.
    The Forge client test standard calls for test data through the app API. T1D and T1B now provide endpoint proof for the last-member cases, so the direct-insert full-deletion test in T1E needs a narrower purpose or a different setup.
    Disposition: keep amended: T1E's test sets up data through the create and join endpoints and calls the helpers through the app's service; block erasure moved to T1B through the endpoints

## Round 4

32. Disputed keep 28: T1A still does not deliver item 6.
    Item 6 names remove, clear, rename, handover and delete. T1A’s invite-reset refusal tests a different action, while those five routes still return 501.
    Disposition: keep amended: T1A now covers only item 2 (its shared helpers); item 6 is delivered by T1D, T1B and T1C with working endpoints

33. Simpler: upfront full contract and 501 stubs → implement and document each endpoint in its serial API task.
    The plan now runs API parts one after another, so the stated OpenAPI conflict between parallel parts no longer exists. T4A can still generate the client once after they finish.
    Disposition: keep amended: dropped the upfront contract and 501 stubs; each serial API part adds its own endpoints to the contract and the web client is generated once in T4A; T1E folded back into T1A

34. Trap: tests that fail only under machine load: item 2.
    Join records usage through an unawaited event. T1E and T1D must observe the usage row before deleting the circle and asserting it survives; a completed Join response alone does not establish that setup.
    Disposition: keep amended: any test that deletes a circle and checks its usage rows first waits until the join's usage row is visible

## Round 5

No findings.
