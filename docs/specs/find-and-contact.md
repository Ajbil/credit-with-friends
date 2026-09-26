---
slug: find-and-contact
title: Find and contact
status: confirmed
saved: 2026-09-26T18:38:52+00:00
---

# Find and contact

## Why

This is the job the app exists for: a shopper sees an offer on a bank card
they don't hold and needs to know, in under a minute, which trusted person
holds one, then message them without broadcasting to everyone (Brief target
outcome). The app only finds and connects; the card holder places the order
and is repaid by UPI outside the app (decisions 0002 and 0003).

## Behaviour

**Search**
- A member searches by:
  - bank, chosen from the same fixed list as cards (required);
  - type: credit, debit, or "credit or debit" (required);
  - variant, free text (optional). The entry is trimmed first; an entry that
    is empty after trimming counts as no variant.
- Results include only other members who share at least one circle with the
  searcher and hold a qualifying card. The searcher never appears in their own
  results.
- Without a variant, a card qualifies when its bank is the chosen bank and its
  type fits the chosen type. Results are one list, alphabetical by display
  name.
- With a variant, a card of the chosen bank and type qualifies when either:
  - its variant contains the entered text, ignoring case (a "matching
    variant"); or
  - it has no variant recorded, because the holder may still have the right
    card.
  Cards with a different, stated variant do not qualify. Results come in two
  labelled groups, each alphabetical by display name:
  1. "Matching variant": people with at least one matching-variant card;
  2. "Variant not stated": people whose only qualifying cards have no variant.
- Each result is one person, shown once, with their display name, all their
  qualifying cards (bank, type, variant) and the names of the circles the
  searcher shares with them.
- Results reflect cards and memberships at the moment of the search. A new
  search always shows the current state.
- When nobody matches, the app says "No one in your circles has this card
  yet." and nothing else.
- Each search records one "search" usage event carrying the searcher, the
  circles they belong to at that moment (none if they belong to none) and the
  number of distinct people found (decision 0008), so the owner can see how
  often searches come up empty. A person counts once however many circles or
  cards they share with the searcher.

**Browse a member's cards**
- From a circle's member list, a member can open any other member of that
  circle and see that person's cards, each with the same contact button.

**Contact**
- Next to each qualifying card, and each card in a browsed member's list, is a
  "Message on WhatsApp" button.
- Pressing it first checks, at that moment, that the card still exists and that
  the pressing member still shares a circle with its holder. If not, the app
  shows "This card is no longer available." and nothing is opened.
- Otherwise it opens WhatsApp's chat link for the holder's current WhatsApp
  number, with this message prefilled and editable before sending:
  "Hi <holder's display name>, do you have a moment? I need your <bank>
  <credit/debit> card<, variant if stated> for an offer."
- The app sends nothing itself; the member decides whether to send the
  message in WhatsApp. The app cannot tell whether the number is on WhatsApp;
  if it is not, or WhatsApp cannot open, WhatsApp's own screen explains it.
- Each successful press records one "WhatsApp tap" usage event carrying the
  member who pressed, the card holder and the circles they share at that
  moment (decision 0008), whether the press came from a search or a browsed
  member's list. Recording never delays or blocks opening WhatsApp; if it
  fails, the tap goes uncounted. The app cannot see whether the message was
  sent.
- Near the button, the app reminds the member that the card holder places the
  order themselves and that nobody should ever share card numbers, CVV, expiry
  or OTPs.

**Enforcement**
- Search results, a browsed member's cards and the contact action each check
  shared membership at the time of the request. Data about a person the
  requester no longer shares a circle with is never returned, including
  through direct data requests.

**Out of scope**
- Offers, offer links, product details or prices in the app or the message
  (decision 0003).
- In-app requests, replies, request tracking or notifications (decision 0003).
- Payments or repayment tracking (decision 0002).
- Searching people outside the searcher's circles.
- Saved or recent searches.
- Checking whether a number is registered on WhatsApp.

## Acceptance criteria

1. Without a variant, a search returns exactly the other members who share a
   circle with the searcher and hold a card of the chosen bank and type; with a
   variant, it returns exactly those whose card of that bank and type has a
   matching variant or no variant. The searcher is never included.
2. "Credit or debit" returns holders of either type; "credit" or "debit"
   returns only that type.
3. With a variant entered, people with a card whose variant contains the text
   (ignoring case) appear under "Matching variant"; people whose only
   qualifying cards have no variant appear under "Variant not stated"; cards
   with a different stated variant never appear.
4. A variant entry of only spaces behaves exactly like no variant.
5. Each result shows the person once, with their display name, all their
   qualifying cards and the names of the circles shared with the searcher,
   sorted alphabetically within the single list or within each group.
6. Members who share no circle with the searcher never appear in results or in
   browsed member lists, including through direct data requests.
7. A search with no matches shows only the no-one-yet message.
8. Each search records one "search" usage event with the searcher, their
   circles (or none) and the number of distinct people found.
9. Pressing "Message on WhatsApp" for a card still visible opens WhatsApp's chat
   link for the holder's current number with the prefilled card-only message,
   which the member can edit before sending.
10. Pressing "Message on WhatsApp" after the card was removed, or after the two
    members stopped sharing any circle, shows "This card is no longer
    available." and opens nothing.
11. Each successful contact press, from search or from a browsed member's list,
    records one "WhatsApp tap" usage event with the member who pressed, the
    holder and their shared circles; a failure to record does not stop
    WhatsApp from opening.
12. From a circle's member list, a member can see another member's cards and
    contact them the same way.
13. The never-share-card-details reminder is shown next to the contact button.
