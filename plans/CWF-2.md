# Create, join and run circles

12 parts · Risks: permanent circle deletion, leaked invite links, a production migration · New moving parts: listed under Tasks

## What changes for you

- After signing in, your home screen lists the circles you belong to, with a button to create a
  new one and a link to your profile.
- You create a circle by giving it a name. You become its only member and its admin.
- As admin, you can copy the circle's invite link or share it straight into WhatsApp with the
  circle name filled in. You can also reset the link if it leaks; the old one stops working.
- Someone who opens the link sees the circle's name and how many people are in it, but no names,
  and joins only by tapping "Join". If they aren't signed in yet, they sign in and onboard first
  and land back on the invite.
- Inside a circle, members see its name, everyone in it by display name, and who the admin is.
  People outside the circle see none of this.
- Anyone can leave a circle. As admin, you can remove people, clear all removals, rename the
  circle, hand the admin role to someone else, or delete the circle. Leaving, removing and
  deleting each ask you to confirm first.
- Each copy or share of the invite link, and each join, is counted for your later usage view.
- Cards, search and the usage view itself come in later stories.

## Why

A circle is the trusted group that decides who can see whose details (decision 0006). The app
spreads by one invite link shared in an existing WhatsApp group, such as a college batch, a
family or an office (decision 0001). Every later story needs circles: cards are visible only
within them, search looks only inside them, and the usage view counts by them. So circles come
straight after sign-in.

## Done when

1. **You can create a circle and see all your circles.** The name must be 1 to 40 characters
   after trimming; an empty or longer name is rejected with a message. The creator becomes its
   only member and its admin. A member already in 20 circles can't create another and is told
   why. Each circle records at creation whether its creator was the owner named in deployment
   configuration, and changing that setting later never changes it; when no owner is
   configured, no circle is owner-created. Creating a circle records no join.
2. **Only the admin can get, share or reset the invite link.** Each circle has exactly one
   active link, whose code has at least 128 bits of randomness. Only the admin can retrieve it,
   including through direct data requests. "Share on WhatsApp" opens WhatsApp with the circle
   name and link filled in. Each "Copy" or "Share on WhatsApp" tap records one invite usage
   event with the admin and the circle. After a reset the old link stops working at once, the
   new one works, and existing members are unaffected. Recording a usage event never blocks or
   undoes what the member did; if recording fails, that one event stays uncounted.
3. **Opening an invite link and joining works safely in every case.**
   - **A dead link:** an unknown, malformed, reset or deleted-circle link shows the same "This
     invite link is no longer valid. Ask the person who shared it for a new one." to everyone,
     members included, and reveals nothing about any circle.
   - **Not signed in:** the person signs in and onboards first, then lands back on the invite.
   - **Already a member:** they go straight to the circle.
   - **Blocked by a removal:** they see only "You can't join this circle."
   - **Anyone else:** they see the circle name and member count, no names, and join only by
     tapping "Join".
   - **At the moment of joining:** the system checks again that the link is still active, the
     person has a completed account and isn't blocked, the circle has fewer than 100 members and
     the person is in fewer than 20 circles. A refused join says why. Simultaneous joins never
     go past either limit. A successful join records one join usage event with the member and
     the circle; a failed record never undoes the join and leaves that one event uncounted.
4. **What's inside a circle reaches only its members.** Members see the circle name, every
   member by display name and which one is the admin. Non-members never receive the member list
   or any member name, including through direct data requests. A member's display name reaches
   only people who share at least one circle with them, and only while they do. Nothing in this
   story returns another member's WhatsApp number.
5. **Leaving and removal take effect at once.** Any member can leave after confirming. The admin
   can remove anyone else after confirming, but can't remove themselves. From that moment, the
   person who left or was removed and the remaining members stop seeing each other through that
   circle, including through direct data requests; visibility through any other shared circle
   continues. A removed person can't rejoin through the current or any later link and sees only
   "You can't join this circle." After the admin's "Clear all removals", they can rejoin only by
   opening a valid link and tapping "Join". No list or names of removed people are shown to
   anyone. Someone who left on their own can rejoin through a valid link.
6. **The admin can rename, hand over and delete, and a circle always has one admin.**
   - **Admin only:** only the admin can remove members, clear removals, get or reset the link,
     rename, hand over or delete, including through direct data requests.
   - **Rename:** a rename follows the 1 to 40 character rule.
   - **Hand over:** after handing the admin role to another member, only the new admin has
     admin powers.
   - **Delete:** deleting needs a confirmation that says it is permanent. It ends every
     membership at once and makes the link show the no-longer-valid message. The deleted circle
     keeps its last name, creation time, deletion time, owner-created flag and past usage
     events.
   - **The admin leaves:** the remaining member with the earliest join time becomes admin.
   - **The last member leaves:** the circle is deleted and its link shows the no-longer-valid
     message.
7. **It works live on your phone.** On `creditwithfriends.in` you create a circle, share its
   link into WhatsApp, and a second allowed Google account joins from that link. You rename the
   circle and hand over the admin role, then the second account removes you. After "Clear all
   removals" you rejoin, and the second account deletes the circle. Every step behaves as above,
   and the results are recorded in the deployment runbook.

## Risks

- **Deleting a circle is permanent.** It can't be undone by design; a confirmation says so, and
  the deleted circle keeps only its name, dates, owner flag and usage history.
- **A leaked invite link lets anyone holding it see the circle's name and member count and ask
  to join.** Before launch only the emails you list can sign in at all (decision 0016). After
  launch, your remedy is to reset the link, and you can remove anyone who joined.
- **The first part adds new database tables to production.** Before each API deploy that brings
  a migration, take a manual export in Render first (decision 0017).
- **Getting the limits right under load is the hard part.** Simultaneous joins must never pass
  100 members or 20 circles; the plan locks rows inside one transaction and tests it.

## For the builders

The spec is `docs/specs/circles.md`; the tables and invariants are in
`docs/architecture/11-data-model.md`. Account deletion, cards and the usage view are other
stories.

- **Out of this story:**
  - **CWF-5 (account deletion):** passing the admin role on, and erasing removal blocks, when a
    member deletes their account.
  - **CWF-3 (cards):** cards becoming visible on joining.
  - **CWF-6:** showing usage counts.

  CWF-2 still records the join and invite events those later stories count.
- **Service bus:** `apps/api/src/service-bus/` is the in-process request and event layer that
  `constitution/03-modular-monolith-structure.md` requires, added here because circles is the
  first module that needs another module.
  - It depends on no domain module.
  - Circles uses it to ask accounts whether a member has completed onboarding, for their
    display name, and whether their Google account ID is the configured owner's. It also uses it
    to tell usage to record an event.
  - Other members' WhatsApp numbers and a "who shares a circle with X" query are added by the
    stories that first use them (CWF-3 and CWF-4).
- **Tables:** `Circle`, `CircleMembership` and `CircleRemovalBlock`, as in the data model, plus
  `UsageEvent` with only `type` (join or invite), `occurredAtUtc` and `memberId`, and
  `UsageEventCircle`. The card, bank and search fields are added by the stories that record
  those events.
  - **Invite codes:** 22-character base64url from 16 random bytes. A new circle gets its code at
    creation, in T1A, and a test proves each new circle has a valid, unique code.
  - **Deleting a circle:** one shared operation, pinned by T3A and used by both admin deletion
    (T3B) and last-member leave (T3A). It clears `inviteCode` and `adminMemberId`, sets
    `deletedAtUtc`, and hard-deletes its memberships and blocks.
  - **Admin column:** `Circle.adminMemberId` is also set to null by the database if the member
    row goes (account deletion, CWF-5).
- **Owner flag:** at creation, `isOwnerCreated` is true only when `OWNER_GOOGLE_ACCOUNT_ID` is
  set and equals the creator's Google account ID. Creation is never refused for a missing owner
  setting; production already has it set (CWF-1 runbook).
- **Concurrency, one lock helper pinned by T1A:** every write that changes memberships (create,
  join, leave, remove, handover, delete) runs in one transaction. Each locks the circle row first
  and then the member rows in ascending id order (`SELECT ... FOR UPDATE`), through one helper in
  `apps/api/src/modules/circles/core/`, before checking limits and writing. Admin succession
  picks the earliest `joinedAtUtc`, breaking ties by membership id.
  - **Creation** has no circle row to lock yet, so it locks only the creator's member row before
    counting their circles and inserting. It never locks a circle row, so it can't deadlock with
    a join. A test races creates and joins for a member near the 20-circle limit.
- **Invite preview without sign-in, pinned by T1A:** the session guard gets an optional-session
  mode. The preview resolves the session when one is present and works without one. That way a
  signed-out visitor sees a dead-link result before signing in, and a signed-in visitor is
  recognised as a member or a blocked person. An expired or invalid session cookie counts as no
  session; it never turns a preview into a 401. T2 tests a dead link opened with such a cookie.
- **Usage events:** they're recorded through the bus after the member's action commits. A failed
  record is logged, never undoes or delays the action, and leaves that one event uncounted, as
  the roadmap says. A test forces a failure and checks the action still succeeds.
- **Module registration, pinned by T1A:** T1A registers a stub `UsageModule` in `app.module.ts`,
  which T1B fills in.
- **Invite URL:** `https://<domain>/circles/join/<code>`. Every handled case of a dead link
  returns the same response. The sign-in return path from CWF-1 brings a signed-out visitor back
  to it.
- **WhatsApp share:** the link is `https://wa.me/?text=<encoded circle name and link>`, opened by
  the phone; the API never calls WhatsApp.
- **One API contract, pinned by T1A:** T1A commits `apps/api/openapi.json` with every circle
  endpoint. It also adds stub controllers under `circles/view/`, `circles/invite/`,
  `circles/join/`, `circles/membership/` and `circles/admin/`, registered in
  `circles.module.ts`, which T1C, T1B, T2, T3A and T3B fill in. That way the web client is generated once, in T4A.
- **Web screens, routes pinned by T4A:** the signed-in home screen becomes the circles list, with
  "Your profile" kept. T4A registers every circle route in `apps/web/src/main.tsx` and commits a
  stub component for each, so T4B, T5, T6A and T6B only fill in their own folders.
- **Production deploys:** after each API part merges, deploy it in Render by hand. Take an
  export first whenever the part brings a migration (decision 0017).

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| T1A | Circles API: foundations, create and list | The service bus; the circle, membership, removal-block and minimal usage tables and migration; accounts' bus answers; the shared lock helper, including creation's member-only lock; the session guard's optional-session mode; a stub usage module registered in `app.module.ts`; create, with its invite code, and list circles; and the full circles API contract with stub view, invite, join, membership and admin controllers | 1 | `apps/api/src/service-bus/`, `apps/api/src/modules/circles/core/`, `apps/api/src/modules/circles/circles.module.ts`, `apps/api/src/modules/circles/view/`, `apps/api/src/modules/circles/invite/`, `apps/api/src/modules/circles/join/`, `apps/api/src/modules/circles/membership/`, `apps/api/src/modules/circles/admin/`, `apps/api/src/modules/usage/`, `apps/api/src/modules/accounts/`, `apps/api/src/modules/sessions/`, `apps/api/src/app.module.ts`, `apps/api/prisma/`, `apps/api/openapi.json`, `apps/api/test/circles-core.integration.spec.ts` | `apps/api/src/service-bus/**/*.spec.ts`, `apps/api/src/modules/circles/core/**/*.spec.ts`, `apps/api/test/circles-core.integration.spec.ts` | | no |
| T1C | Circles API: circle view and members | The circle view with its name, members by display name and the admin, for members only; non-members get nothing, including through direct data requests | 4 | `apps/api/src/modules/circles/view/`, `apps/api/test/circles-view.integration.spec.ts` | `apps/api/src/modules/circles/view/**/*.spec.ts`, `apps/api/test/circles-view.integration.spec.ts` | T1A | no |
| T1B | Circles API: invite link and usage events | The usage module recording events through the bus without ever blocking the action; the admin-only invite link with copy and share events; and reset | 2 | `apps/api/src/modules/usage/`, `apps/api/src/modules/circles/invite/`, `apps/api/test/circles-invite.integration.spec.ts` | `apps/api/src/modules/usage/**/*.spec.ts`, `apps/api/src/modules/circles/invite/**/*.spec.ts`, `apps/api/test/circles-invite.integration.spec.ts` | T1A | no |
| T2 | Circles API: open a link and join | The invite preview with every case in order, with or without a session, and joining with every check repeated under the shared lock helper, refusal reasons and the join event | 3 | `apps/api/src/modules/circles/join/`, `apps/api/test/circles-join.integration.spec.ts` | `apps/api/src/modules/circles/join/**/*.spec.ts`, `apps/api/test/circles-join.integration.spec.ts` | T1B | no |
| T3A | Circles API: leave, removal and succession | Leave; admin-only remove with blocks and clear all removals; admin succession; and the shared circle-deletion operation used for last-member leave | 5, 6 | `apps/api/src/modules/circles/membership/`, `apps/api/test/circles-membership.integration.spec.ts` | `apps/api/src/modules/circles/membership/**/*.spec.ts`, `apps/api/test/circles-membership.integration.spec.ts` | T1A | no |
| T3B | Circles API: rename, hand over and delete | Admin-only rename with the 1 to 40 rule, handover, and delete through the shared deletion operation | 6 | `apps/api/src/modules/circles/admin/`, `apps/api/test/circles-admin.integration.spec.ts` | `apps/api/src/modules/circles/admin/**/*.spec.ts`, `apps/api/test/circles-admin.integration.spec.ts` | T3A | no |
| T4A | Web: circles home and create | The signed-in home as the circles list with create and "Your profile"; registers every circle route with stub components; regenerates the API client | 1 | `apps/web/src/main.tsx`, `apps/web/src/pages/sign-in-page.tsx`, `apps/web/src/api/generated.ts`, `apps/web/src/routes/circles/`, `apps/web/e2e/circles-home.spec.ts` | `apps/web/src/routes/circles/home/**/*.test.tsx`, `apps/web/e2e/circles-home.spec.ts` | T1A | yes |
| T4B | Web: circle screen and invite controls | The circle screen with members and the admin marker; the admin's copy, share on WhatsApp and reset link | 2, 4 | `apps/web/src/routes/circles/circle/`, `apps/web/e2e/circle.spec.ts` | `apps/web/src/routes/circles/circle/**/*.test.tsx`, `apps/web/e2e/circle.spec.ts` | T1B, T1C, T4A | yes |
| T5 | Web: invite page and joining | The invite page for every case, with sign-in and onboarding returning to it, the "Join" button and refusal messages | 3 | `apps/web/src/routes/circles/join/`, `apps/web/e2e/join.spec.ts` | `apps/web/src/routes/circles/join/**/*.test.tsx`, `apps/web/e2e/join.spec.ts` | T2, T4A | yes |
| T6A | Web: leave, remove and clear removals | Leave and remove with confirmation steps, and clear all removals | 5 | `apps/web/src/routes/circles/membership/`, `apps/web/e2e/membership.spec.ts` | `apps/web/src/routes/circles/membership/**/*.test.tsx`, `apps/web/e2e/membership.spec.ts` | T3A, T4B | yes |
| T6B | Web: rename, hand over and delete | Rename, hand over, and delete with a confirmation that says it is permanent | 6 | `apps/web/src/routes/circles/admin/`, `apps/web/e2e/admin.spec.ts` | `apps/web/src/routes/circles/admin/**/*.test.tsx`, `apps/web/e2e/admin.spec.ts` | T3B, T4B | yes |
| T7 | Live check on your phone | A CWF-2 production check section in the runbook, filled in from your live walk-through | 7 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T5, T6A, T6B | yes |

Once T1A merges, T1B, T1C, T3A and T4A can run side by side. Then T2, T3B and T4B can run side
by side. T5, T6A and T6B follow as their API parts land.

New moving parts:
- **T1A:** the in-process service bus in `apps/api/src/service-bus/` (Done-when 1 and 4), required by the modular-monolith constitution for the first cross-module call.
- **T1B:** the usage module that records events (Done-when 2 and 3).

## Notes

### What I need from you

- A second allowed Google account for the live check in T7. It must be on your pre-launch list,
  and one you can sign in with on another device or browser.
- A manual export in Render before deploying T1A, which adds the circle tables, and before any
  later part that brings a migration.
