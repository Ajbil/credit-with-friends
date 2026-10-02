---
slug: circles
title: Circles
status: confirmed
saved: 2026-09-26T16:58:00+00:00
---

# Circles

## Why

Cards are only useful to people you trust, and the MVP must spread through
existing communities such as a college batch, a family or an office
(decision 0001). A circle is that trusted group: one invite link shared in a
WhatsApp group can bring the whole group in, and membership decides who can
see whose name, WhatsApp number and cards (decision 0006). Because a leaked
link would expose members' data, each circle has an admin who can remove
people and reset the link.

## Behaviour

**Create**
- Any member can create a circle by giving it a name of 1 to 40 characters
  after trimming. Names need not be unique.
- The creator becomes the circle's first member and its admin. A circle has
  exactly one admin at a time.
- A member can belong to at most 20 circles, and a circle can have at most
  100 members. Creating a circle counts toward the member's 20 and is refused,
  with a clear message, when they already belong to 20.

**Invite link**
- Each circle has exactly one active invite link. The link contains a random
  code with at least 128 bits of randomness, so it cannot practically be
  guessed.
- In the app, only the admin can retrieve the active link: see it, copy it, or
  share it through a "Share on WhatsApp" button that opens WhatsApp with the
  circle name and link prefilled. Once shared, anyone holding the link can
  forward it; the admin's remedy for a leaked link is to reset it. Other
  members who want to bring someone in ask the admin, or create a circle of
  their own.
- Every tap on "Copy" or "Share on WhatsApp" records one "invite" usage event
  carrying the admin and the circle (decision 0008). The app cannot see whether
  the WhatsApp message was actually sent, so the tap is what counts.
- Recording a join or invite usage event never blocks or undoes the member's
  action. If recording fails, that one event is left uncounted.
- The admin can reset the link. The old link stops working at once, and a new
  one replaces it; existing members are unaffected.

**Join**
- Opening a link is handled in this order:
  1. A link that is unknown, malformed, reset, or whose circle was deleted
     shows "This invite link is no longer valid. Ask the person who shared it
     for a new one." to everyone, members included. Nothing about any circle is
     revealed.
  2. Sign-in and onboarding come first when needed (Accounts capability).
  3. A person who is already a member is taken straight to the circle.
  4. A person blocked by a removal sees "You can't join this circle." and
     nothing else about it.
  5. Anyone else sees the circle name and the number of members, but no
     member names, and can press "Join".
- The person joins only by pressing "Join"; opening the link alone does not
  join them.
- When "Join" is pressed, the system checks everything again at that moment,
  whatever the screen showed: the link is still the active one, the person has
  a completed account, they are not blocked by a removal, the circle has fewer
  than 100 members and they belong to fewer than 20 circles. Simultaneous joins
  can never push a circle past 100 members or a person past 20 circles.
- A refused join shows a clear message naming the reason (circle full, or too
  many circles).
- On joining, they become a member, their cards become visible to the circle
  and the circle's members' cards become visible to them. A "join" usage event
  carrying the member and the circle is recorded.

**Inside a circle**
- Members see the circle name, the list of members by display name, and which
  member is the admin. Non-members never receive the member list or member
  names, including through direct data requests. Viewing members' cards and
  contacting them belong to the Find & contact capability.
- A member sees a list of all circles they belong to.

**Leave**
- Any member can leave a circle after a confirmation step. From that moment,
  they and the circle's other members stop seeing each other's data through
  that circle; they still see each other through any other circle they share.
- Leaving does not block the person. They can rejoin later through a valid
  invite link, like anyone else.

**Remove**
- The admin can remove a member after a confirmation step. The removed person
  immediately loses access to the circle, with the same visibility effect as
  leaving.
- A removed person is blocked from rejoining that circle through any of its
  links, including links created after later resets.
- The admin can lift the blocks with "Clear all removals", which unblocks every
  removed person of that circle at once. No list or names of removed people
  are shown to anyone. An unblocked person is not added back; they rejoin only
  by opening a valid link and pressing "Join".
- A block is erased when the blocked person deletes their account, as part of
  account deletion (Accounts capability). If they sign up again, they are a new
  person and are not blocked; the admin can reset the link if needed.

**Admin powers**
- The admin can:
  - remove a member and clear all removals;
  - retrieve, share and reset the invite link;
  - rename the circle, under the same 1 to 40 character rule as creating it;
  - hand the admin role to another member;
  - delete the circle, after a confirmation that says it is permanent. Every
    membership ends at once and its invite link stops working.
- The admin cannot remove themselves; they leave instead.

**When the admin leaves or deletes their account**
- If the admin leaves the circle, or deletes their account, the admin role
  passes automatically to the remaining member with the earliest join time.
  If two join times are identical, the system picks one of them consistently.
- If no members remain, the circle is deleted.
- Neither leaving nor account deletion is ever blocked by being an admin.
- Leaving, removal, handover and deletion are applied one at a time, so a
  circle that still has members always has exactly one admin.

**Deleted circles and usage history**
- When a circle is deleted, its past usage events stay in the owner's usage
  counts, shown under the circle's last name marked "(deleted)" (decision
  0008).

**Out of scope**
- Several admins per circle, join approval, and friends-of-friends visibility
  (decision 0006).
- Choosing which circles see which card (decision 0006).
- Public or searchable circles.
- A list of removed people, or unblocking one person at a time.
- Circle photos, descriptions or chat.

## Acceptance criteria

1. Creating a circle with a 1 to 40 character name makes the creator its only
   member and its admin; an empty or longer name is rejected, and a member who
   already belongs to 20 circles cannot create another.
2. Only the admin can retrieve, copy or share the circle's active invite link
   in the app, including through direct data requests, and each "Copy" or
   "Share on WhatsApp" tap records one "invite" usage event with the admin and
   circle.
3. Opening a valid link without being a member shows the circle name and
   member count but no member names, and does not join the person until they
   press "Join".
4. After joining, the new member and the existing members can see each other's
   cards through that circle, and a "join" usage event with the member and
   circle is recorded.
5. An unknown, malformed, reset or deleted-circle link shows the same
   no-longer-valid message to everyone, including members, and reveals nothing
   about any circle; after a reset, the new link works and existing members are
   unaffected.
6. A member who leaves, or is removed, immediately stops seeing that circle and
   the data of members they share no other circle with, and those members stop
   seeing theirs, including through direct data requests; visibility through
   any other shared circle continues.
7. A removed person cannot rejoin through the current or any later invite link,
   and sees only "You can't join this circle."; after "Clear all removals" they
   can rejoin only by opening a valid link and pressing "Join".
8. A person who left voluntarily can rejoin through a valid link.
9. Joining is refused with a reason at 100 members per circle and at 20
   circles per member, and simultaneous joins never exceed either limit.
10. Only the admin can remove members, clear removals, retrieve or reset the
    link, rename, hand over the admin role or delete the circle, including
    through direct data requests; a rename follows the 1 to 40 character rule.
11. Leaving, removing a member and deleting a circle each require a
    confirmation step.
12. When the admin leaves or deletes their account, the remaining member with
    the earliest join time becomes admin; when the last member leaves or
    deletes their account, the circle is deleted and its link shows the
    no-longer-valid message.
13. Deleting a circle ends every membership, makes its invite link show the
    no-longer-valid message, and keeps its past usage events under its last
    name marked "(deleted)".
14. The admin can hand the admin role to another member, after which only the
    new admin has admin powers.
15. Non-members never receive a circle's member list or member names,
    including through direct data requests.
16. A removed person who deletes their account and signs up again is not
    blocked from that circle.
17. Recording a join or invite usage event never blocks or undoes the member's
    action; a failed record leaves that one event uncounted.
