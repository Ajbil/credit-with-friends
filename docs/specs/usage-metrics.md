---
slug: usage-metrics
title: Usage metrics
status: confirmed
saved: 2026-09-26T19:17:20+00:00
---

# Usage metrics

## Why

The MVP exists to test whether the idea is worth pursuing. Its success bar is
that it spreads through the owner's network with members bringing others in,
and that it gets real use through one sale season (decision 0001). The
directory-plus-WhatsApp model cannot see whether orders happen (decision
0003), so first-party counts are the evidence (decision 0008). They are
proxies: spread shows up as joins and as circles created by people other than
the owner, and use shows up as searches and WhatsApp taps. Who brought in whom
is not measured. Only the owner needs these counts, and they must not expose
members' personal data.

## Behaviour

**The owner**
- The owner is the single person whose Google account ID (the stable
  identifier the Accounts capability uses, not an email address) is named in
  the app's deployment configuration. There is no in-app way to become, add or
  change the owner.
- Owner access follows the configured Google account ID. If the owner deletes
  their account and signs up again with the same Google account, they are a
  new member with no prior data (Accounts) but keep owner access, because the
  ID is unchanged. Moving ownership to a different Google account requires a
  configuration change.
- Every member's own profile shows their Google account ID to them alone, so
  the owner can copy theirs into the configuration. It is never shown to
  another member (Accounts).
- The owner also uses the app as an ordinary member; the usage view is an
  extra screen only they can open.

**Usage events**
- The app records these events, as defined by the other capabilities:

  | Event | Recorded when | Carries |
  |---|---|---|
  | join | a person joins a circle (Circles) | member, circle |
  | invite | the admin taps Copy or Share on WhatsApp (Circles) | admin, circle |
  | card listed | a member adds a card (Cards) | member, their circles at that moment or none |
  | search | a member searches (Find and contact) | member, their circles at that moment or none, number of people found, and the chosen bank and type (never the variant text) |
  | WhatsApp tap | a member presses Message on WhatsApp (Find and contact) | member, card holder, their shared circles |

- Every event also carries the time it happened.
- This spec extends the search event defined by Find and contact with the
  chosen bank and type; the app records them with every search.
- Creating a circle does not record a join event; it is counted as a new
  circle instead.
- Recording an event never blocks, delays or undoes the member's action. If
  recording fails, that event goes uncounted; this applies to all five events,
  as Find and contact already requires for WhatsApp taps.
- The privacy notice's description of usage events (Accounts) includes that a
  WhatsApp tap records the card holder contacted and that a search records the
  bank and type searched. This is part of the first notice version, so it
  triggers no re-acceptance.
- The member and card-holder links on events are kept only so the view can
  count distinct active members and distinct card holders contacted. When a
  member deletes their account, their identity is removed from every event
  they appear in; the events stay with their time, circles and search bank and
  type but no member identifier, and are used only to produce counts, as the
  Accounts deletion rule states.
  Counts for a very small circle may still let someone guess who acted, which
  is why the view is owner-only and shows counts alone.
- Distinct active-member and card-holder counts only count identities still on
  events, so they drop when a member deletes their account.
- Every circle records, when it is created, whether its creator was the
  configured owner at that moment; a later change of owner does not reclassify
  existing circles.
- When a circle is deleted, its events stay, and its last name, creation time,
  deletion and owner-created flag are kept so the view can show and count it
  (Circles).
- Events are kept for as long as the app runs.

**Usage view**
- The owner picks a period: last 7 days, last 30 days, or all time. "Last 7
  days" runs from 00:00 Indian Standard Time on the day six days before today
  up to the moment the view is opened; "last 30 days" does the same from 29
  days before today. "All time" has no start.
- Overall numbers for the period:
  - new members: current accounts that completed onboarding in the period
    (deleted accounts are not counted);
  - active members: distinct members with at least one event in the period;
  - new circles, and of those, circles created by someone other than the
    owner, both including circles later deleted;
  - joins, invites, cards listed, searches, searches that found nobody,
    WhatsApp taps, and distinct card holders contacted.
- Current totals, independent of the period: members, circles and cards.
- A per-circle table with one row per circle, identified by its name (its last
  name plus "(deleted)" for deleted ones) and its creation date, so circles
  with the same name can be told apart, showing for the period: joins, invites,
  cards listed, searches, searches that found nobody, and WhatsApp taps, plus
  the circle's current member count (blank for deleted circles). A row "No
  circle" shows events that carried no circle.
- In a circle's row, searches and cards listed count those made by that
  circle's members while they belonged to it; "searches that found nobody"
  counts those searches that found nobody across all of the searcher's
  circles, not only in that circle.
- An event that carries several circles counts once in each of those circles'
  rows but only once in the overall numbers.
- A "Searched cards" table for the period, across all circles: one row per
  bank and type that was searched, showing the number of searches and the
  number that found nobody, sorted by number of searches, highest first. It
  shows which cards members look for and how often those searches, including
  any variant filter, found nobody.
- The view shows counts only: never member names, WhatsApp numbers, emails or
  cards.
- Numbers are as of the moment the view is opened.

**Access**
- Only the owner can open the usage view or receive its data, including
  through direct data requests. Circle admins and other members cannot.
- The view's data contains aggregate counts only. No request returns
  individual event records or member identifiers to anyone, the owner
  included.

**Out of scope**
- Charts, exports and downloads.
- Per-member activity or any member-level drill-down.
- Measuring who brought in whom.
- Third-party analytics or trackers (decision 0008).
- Alerts or scheduled reports.
- More than one owner.
- A custom date range.

## Acceptance criteria

1. Only the account whose Google account ID is named as owner in the deployment
   configuration can open the usage view or receive its data, including
   through direct data requests; every other member is refused.
2. Each of the five events is recorded with its time and the fields listed in
   the table; a failure to record any event never blocks or undoes the
   member's action and leaves that event uncounted; creating a circle records
   no join event.
3. The owner can switch between last 7 days, last 30 days and all time; the
   7- and 30-day periods start at 00:00 Indian Standard Time six and 29 days
   before today and end when the view is opened, and every period-based number
   changes accordingly.
4. The overall numbers show new members (current accounts only), active
   members, new circles and those created by someone other than the owner
   (including later-deleted circles), joins, invites, cards listed, searches,
   searches that found nobody, WhatsApp taps and distinct card holders
   contacted for the period, plus current totals of members, circles and cards.
5. The per-circle table has a row for every circle, each showing its name (the
   last name plus "(deleted)" for deleted circles) and creation date, and a
   "No circle" row for events without a circle.
6. An event carrying several circles adds one to each of those rows and one to
   the overall number.
7. After a member deletes their account, the event counts (joins, invites,
   cards listed, searches and WhatsApp taps) are unchanged, no event carries
   their identifier, member totals drop by one, and distinct active-member and
   card-holder counts no longer include them.
8. The usage view never shows a member's name, WhatsApp number, email or
   cards, and no request returns individual event records or member
   identifiers, including to the owner.
9. The "Searched cards" table lists every bank and type searched in the period
   with its search count and found-nobody count, highest search count first,
   and never shows variant text.
10. After the owner deletes their account and signs up again with the same
    Google account, they have owner access; a different Google account gains
    it only when the configuration names its ID.
11. A member sees their own Google account ID on their profile, and no other
    member ever receives it.
12. A circle created by the configured owner is counted as owner-created, and
    changing the configured owner later does not reclassify it, including after
    the circle is deleted.
