# Create, join and run circles

7 parts · Risks: permanent circle deletion, leaked invite links, a production migration · New moving parts: listed under Tasks

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
   configuration, and changing that setting later never changes it. Creating a circle records
   no join.
2. **Only the admin can get, share or reset the invite link.** Each circle has exactly one
   active link, whose code has at least 128 bits of randomness. Only the admin can retrieve it,
   including through direct data requests. "Share on WhatsApp" opens WhatsApp with the circle
   name and link filled in. Each "Copy" or "Share on WhatsApp" tap records one invite usage
   event with the admin and the circle. After a reset the old link stops working at once, the
   new one works, and existing members are unaffected. Recording a usage event never blocks or
   undoes what the member did.
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
     the circle.
4. **What's inside a circle reaches only its members.** Members see the circle name, every
   member by display name and which one is the admin. Non-members never receive the member list
   or any member name, including through direct data requests. A member's display name and
   WhatsApp number reach only people who share at least one circle with them, and only while
   they do.
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
  - Circles uses it to ask accounts for a completed member's display name, WhatsApp number and
    owner status, and to tell usage to record an event.
  - Circles answers one query that later stories reuse: "member ids sharing a non-deleted circle
    with X".
- **Tables:** `Circle`, `CircleMembership`, `CircleRemovalBlock`, `UsageEvent` and
  `UsageEventCircle`, as in the data model.
  - **Invite codes:** 22-character base64url from 16 random bytes.
  - **Deleting a circle:** clears `inviteCode`, sets `deletedAtUtc` and hard-deletes its
    memberships and blocks.
  - **Admin column:** `Circle.adminMemberId` is set to null when the member row goes.
- **Concurrency:** create, join, leave, remove, handover and delete each run in one transaction
  that locks the circle row and the member row (`SELECT ... FOR UPDATE`) before checking limits
  and writing. Admin succession picks the earliest `joinedAtUtc`, breaking ties by membership id.
- **Usage events:** they're recorded through the bus after the member's action commits. A failed
  record is logged and swallowed, never undoing or delaying the action.
- **Invite URL:** `https://<domain>/circles/join/<code>`. Every handled case of a dead link
  returns the same response. The sign-in return path from CWF-1 brings a signed-out visitor back
  to it.
- **WhatsApp share:** the link is `https://wa.me/?text=<encoded circle name and link>`, opened by
  the phone; the API never calls WhatsApp.
- **One API contract, pinned by T1:** T1 commits `apps/api/openapi.json` with every circle
  endpoint T2 and T3 will fill in, plus stub controllers under `circles/join/` and
  `circles/manage/` registered in `circles.module.ts`. That way the web client is generated once,
  in T4.
- **Web screens:** the signed-in home screen becomes the circles list (with "Your profile" kept).
  T4 also pins every circle route in `apps/web/src/main.tsx`, so T5 and T6 only fill in their own
  folders.
- **Production deploys:** after each API part merges, deploy it in Render by hand. Take an
  export first whenever the part brings a migration (decision 0017).

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| T1 | Circles API: create, view and invite link | The service bus, the circle and usage tables and migration, usage-event recording, accounts' bus answers, create and list circles, circle view with members, the admin's invite link with copy and share events and reset, the visibility query, and the full circles API contract with stub join and manage controllers | 1, 2, 4 | `apps/api/src/service-bus/`, `apps/api/src/modules/circles/`, `apps/api/src/modules/usage/`, `apps/api/src/modules/accounts/`, `apps/api/src/app.module.ts`, `apps/api/prisma/`, `apps/api/openapi.json`, `apps/api/test/circles-core.integration.spec.ts` | `apps/api/src/service-bus/**/*.spec.ts`, `apps/api/src/modules/circles/**/*.spec.ts`, `apps/api/src/modules/usage/**/*.spec.ts`, `apps/api/test/circles-core.integration.spec.ts` | | no |
| T2 | Circles API: open a link and join | The invite preview with every case in order, and joining with all checks repeated at the moment of joining under row locks, refusal reasons and the join event | 3 | `apps/api/src/modules/circles/join/`, `apps/api/test/circles-join.integration.spec.ts` | `apps/api/src/modules/circles/join/**/*.spec.ts`, `apps/api/test/circles-join.integration.spec.ts` | T1 | no |
| T3 | Circles API: leave, remove and admin powers | Leave, remove, removal blocks and clear all removals, rename, hand over, delete, admin succession and last-member deletion, all admin-only where the spec says so | 5, 6 | `apps/api/src/modules/circles/manage/`, `apps/api/test/circles-manage.integration.spec.ts` | `apps/api/src/modules/circles/manage/**/*.spec.ts`, `apps/api/test/circles-manage.integration.spec.ts` | T1 | no |
| T4 | Web: circles home and circle screen | The signed-in home as the circles list with create and "Your profile", the circle screen with members and admin marker, and the admin's copy, share on WhatsApp and reset link; pins every circle route and regenerates the API client | 1, 2, 4 | `apps/web/src/routes/circles/home/`, `apps/web/src/routes/circles/circle/`, `apps/web/src/pages/sign-in-page.tsx`, `apps/web/src/main.tsx`, `apps/web/src/api/generated.ts`, `apps/web/e2e/circles.spec.ts` | `apps/web/src/routes/circles/**/*.test.tsx`, `apps/web/e2e/circles.spec.ts` | T1 | yes |
| T5 | Web: invite page and joining | The invite page for every case, with sign-in and onboarding returning to it, the "Join" button and refusal messages | 3 | `apps/web/src/routes/circles/join/`, `apps/web/e2e/join.spec.ts` | `apps/web/src/routes/circles/join/**/*.test.tsx`, `apps/web/e2e/join.spec.ts` | T2, T4 | yes |
| T6 | Web: leave, remove and admin actions | Leave, remove and delete with confirmation steps, clear all removals, rename and hand over | 5, 6 | `apps/web/src/routes/circles/manage/`, `apps/web/e2e/manage.spec.ts` | `apps/web/src/routes/circles/manage/**/*.test.tsx`, `apps/web/e2e/manage.spec.ts` | T3, T4 | yes |
| T7 | Live check on your phone | A CWF-2 production check section in the runbook, filled in from your live walk-through | 7 | `docs/architecture/deployment.md` | `docs/architecture/deployment.md` (the recorded production check) | T5, T6 | yes |

T2, T3 and T4 can run side by side once T1 merges; T5 and T6 can run side by side after that.

New moving parts:
- **T1:** the in-process service bus in `apps/api/src/service-bus/` (Done-when 2 and 4), required by the modular-monolith constitution for the first cross-module call; and the usage module that records events (Done-when 2 and 3).

## Notes

### What I need from you

- A second allowed Google account for the live check in T7. It must be on your pre-launch list,
  and one you can sign in with on another device or browser.
- A manual export in Render before deploying T1, which adds the circle tables.
