---
slug: cards
title: Cards
status: confirmed
saved: 2026-09-26T16:34:05+00:00
---

# Cards

## Why

A shopper can only find a card holder if members have said which cards they
hold. Indian bank offers are usually bank-level ("HDFC Bank credit cards"),
sometimes limited to one card variant, and often include debit cards
(decision 0005). A card entry therefore records exactly what offer matching
needs (bank, credit or debit, and optionally the variant). The app never asks
for a card number, CVV, expiry or OTP, blocks entries that look like one, and
tells members never to enter them (decision 0002).

## Behaviour

**What a card is**
- A card is:
  - a bank, chosen from the fixed list of banks that issue cards in India
    (see "Bank list" below);
  - a type: credit or debit;
  - an optional variant name in free text (for example "Millennia" or
    "Regalia Gold").
- A card belongs to exactly one member. Card network (Visa, Mastercard,
  RuPay, Amex), limits, expiry and card images are not recorded.

**Bank list**
- The list starts with these 57 banks, shown in alphabetical order (a leading
  "The" is ignored when sorting): Airtel Payments Bank, American Express, AU
  Small Finance Bank, Axis Bank, Bandhan Bank, Bank of Baroda, Bank of India,
  Bank of Maharashtra, Canara Bank, Capital Small Finance Bank, Central Bank of
  India, City Union Bank, The Cosmos Co-operative Bank, CSB Bank, DBS Bank,
  DCB Bank, Deutsche Bank, Dhanlaxmi Bank, Equitas Small Finance Bank, ESAF
  Small Finance Bank, Federal Bank, Fino Payments Bank, HDFC Bank, HSBC, ICICI
  Bank, IDBI Bank, IDFC FIRST Bank, India Post Payments Bank, Indian Bank,
  Indian Overseas Bank, IndusInd Bank, Jammu & Kashmir Bank, Jana Small
  Finance Bank, Jio Payments Bank, Karnataka Bank, Karur Vysya Bank, Kotak
  Mahindra Bank, NSDL Payments Bank, Punjab & Sind Bank, Punjab National Bank,
  RBL Bank, The Saraswat Co-operative Bank, SBM Bank India, Shivalik Small
  Finance Bank, slice Small Finance Bank, South Indian Bank, Standard
  Chartered, State Bank of India (SBI), Suryoday Small Finance Bank, SVC
  Co-operative Bank, Tamilnad Mercantile Bank, UCO Bank, Ujjivan Small Finance
  Bank, Union Bank of India, Unity Small Finance Bank, Utkarsh Small Finance
  Bank, YES Bank.
- Cards from a bank's card company count as that bank: SBI Card as State Bank
  of India (SBI) and BOBCARD as Bank of Baroda.
- Only the owner changes the list, by releasing a new version of the app;
  there is no in-app editing. Banks can be added and a bank's display name can
  be corrected, but a bank is never removed, so saved cards and searches keep
  working. A corrected name shows everywhere that bank appears.
- The add-card screen has a "Bank not listed? Ask us to add it" button. It
  opens the member's email app with a message to the owner's contact address,
  the subject and a line for the bank's name already filled in. The address is
  also shown as text, for members without an email app. Nothing typed there is
  saved in the app.

**Brand-card shortcuts**
- Many people know a card by an app's brand rather than the bank that issues
  it. The bank picker therefore also offers brand-card shortcuts, each naming
  the issuing bank, for example "OneCard (Federal Bank)". Picking one fills in
  that bank, the card type and the brand as the variant; the member can change
  any of them before saving, and the card is saved as an ordinary card of that
  bank, so search finds it by bank.
- A brand issued by several banks has one shortcut per bank.
- The first set is: OneCard (Federal Bank), OneCard (Bank of Baroda), OneCard
  (CSB Bank), OneCard (SBM Bank India), OneCard (South Indian Bank), OneCard
  (Indian Bank), Scapia (Federal Bank), Jupiter Edge (CSB Bank), Jupiter Edge
  (Federal Bank), Jupiter debit card (Federal Bank), slice (slice Small
  Finance Bank), Kiwi (YES Bank), Kiwi (Punjab National Bank), Kiwi KOSMO (AU
  Small Finance Bank), Tata Neu (HDFC Bank), Tata Neu (SBI), Amazon Pay (ICICI
  Bank), Flipkart (SBI), Flipkart (Axis Bank), Swiggy (HDFC Bank), Airtel (Axis
  Bank), PhonePe (HDFC Bank), POP (YES Bank), BharatPe (Unity Small Finance
  Bank), superCard (Axis Bank), superCard (Kotak Mahindra Bank) and superCard
  (Utkarsh Small Finance Bank). All are credit cards except the Jupiter debit
  card.
- Like banks, shortcuts change only when the owner releases a new version:
  they can be added, renamed or retired from the picker. A shortcut never
  changes a saved card.

**Add a card**
- A member adds a card by picking the bank, picking credit or debit, and
  optionally typing a variant name.
- The variant is trimmed and may be at most 40 characters. A variant with three
  or more digits in a row, ignoring spaces, dashes and slashes between them, is
  rejected with a message saying never to enter card numbers, CVVs, expiry
  dates or OTPs.
- Some real card names contain a number. A short allow-list of such product
  numbers is accepted when the number stands on its own as a whole word, with
  no other digit touching it or joined to it by a space, dash or slash. The
  list starts with "811" (Kotak 811), so "Kotak 811" and "811 Dream
  Different" are accepted, while "8110", "811 123" and "811-4567" are still
  rejected. The exception never applies when the variant also contains a
  card-details word (CVV, CVC, OTP, PIN, expiry or exp, as a whole word in any
  letter case), so "CVV 811" is rejected. The rule is applied to the rest of the variant as before. The list
  changes only when the owner releases a new version.
- The add and edit screens always show a reminder never to enter card
  numbers, CVV, expiry or OTPs.
- A member cannot hold two identical cards. Cards are identical when bank,
  type and variant match, comparing variants case-insensitively after
  trimming, with an empty variant treated as one value. The same bank and type
  with a different variant is allowed.
- A member can hold at most 20 cards.
- Adding a card records one "card listed" usage event carrying the member and
  the circles they belong to at that moment, or no circle if they belong to
  none (decision 0008). Later joining or leaving a circle does not change past
  events.

**View, edit and remove**
- A member always sees a list of their own cards, whether or not they belong
  to any circle.
- A member can edit any field of their own card under the same rules as adding
  one.
- A member can remove their own card; it disappears at once from every place
  it was visible.
- A member can view, edit or remove only their own cards.

**Visibility**
- Other members see a member's cards only when they share at least one circle
  with that member, as defined by the Accounts capability's enforcement rules
  and decision 0006. The card holder always sees their own cards.
- Added, edited and removed cards are reflected at once wherever other members
  see them, including search results; how search matches cards belongs to the
  Find & contact capability.

**Zero cards**
- Cards are optional. A member with no cards can still use every other part
  of the app, including searching for card holders.
- After onboarding, the member is invited to add their cards and can skip
  this step. A member who arrived through an invite link is returned to that
  invite first (Accounts capability) and is invited to add cards right after.

**Out of scope**
- Card network, a card-product catalog, offers and offer matching.
- Choosing which circles see which card (decision 0006).
- An "other bank" option or free-text bank names.
- Removing banks from the list.

## Acceptance criteria

1. Every bank in the initial list can be selected, and a member can add a card
   with a listed bank, a type of credit or debit, and no variant; it then
   appears in their own card list, even if they belong to no circle.
2. A bank that is not on the list cannot be saved, including through direct
   data requests.
3. A variant longer than 40 characters after trimming is rejected, and a
   variant with three or more digits in a row (ignoring spaces, dashes and
   slashes between them) is rejected with the never-enter-card-details
   message.
4. Adding a card identical to one the member already holds is rejected; adding
   the same bank and type with a different variant succeeds.
5. A 21st card cannot be added.
6. Once added, a card appears in matching search results for members who share
   a circle with its holder.
7. Editing a card applies the same rules as adding one; after saving, members
   who share a circle see the updated card, it appears in searches that match
   its new values and it no longer appears in searches that matched only its
   old values.
8. After a card is removed, it no longer appears in its holder's list, in any
   circle member's view or in any search result.
9. No member can edit or remove another member's card, including through
   direct data requests.
10. A member with no cards can finish onboarding, skip adding cards and still
    search for card holders.
11. A member who arrived through an invite link sees that invite before being
    invited to add cards.
12. Adding a card records one "card listed" usage event carrying the member and
    the circles they belong to at that moment, or no circle.
13. The add and edit screens show the never-enter-card-details reminder, and
    the add screen's "Bank not listed? Ask us to add it" button opens an email
    to the owner's contact address with the request filled in.
14. Correcting a bank's display name changes it on every existing card of that
    bank without affecting search matches.
15. Picking a brand-card shortcut fills in its issuing bank, card type and
    brand as the variant, and the saved card is an ordinary card of that bank.
16. A variant containing an allow-listed product number, such as "Kotak 811",
    is accepted, while the same number joined to other digits, such as
    "811 123", or next to a card-details word, such as "CVV 811", is rejected
    with the never-enter-card-details message.
