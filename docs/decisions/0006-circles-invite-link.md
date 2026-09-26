---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Circles joined by invite link, creator is admin

## Context
The MVP should spread through existing communities (college batch, family,
office). 1:1 friend links build coverage slowly; friends-of-friends weakens
trust; a fully open link with no admin leaves a leaked link exposing everyone's
cards.

## Decision
Anyone can create a circle and share its invite link. The creator is admin and
can remove members and reset the invite link; any member can leave at any
time. A member's cards are visible to all members of every circle they belong
to, and to no one else.

## Consequences
- One shared link can onboard a whole WhatsApp group.
- Visibility is controlled by which cards a member lists and which circles they
  join; there is no per-circle card selection.
- No friends-of-friends, public profiles or join approval in the MVP.
