---
slug: accounts
title: Accounts
status: confirmed
saved: 2026-09-26T12:57:10+00:00
---

# Accounts

## Why

Every other capability needs a known person behind it: a name circle members
recognise and a WhatsApp number the contact button can open. Because members
share personal data (name, number, which cards they hold) inside their circles,
the product meets the DPDP Act's consent and erasure standards from day one
(decision 0001), whether or not those provisions are yet in force: informed,
affirmative consent before data is used, and a way to erase it. Sign-in must
cost nothing to run, so it uses Google and an unverified, self-entered WhatsApp
number.

## Behaviour

**Identity**
- A person is identified by their Google account's stable account ID, not by
  their email address. If their Google email changes, they keep the same
  account.

**Sign in**
- A visitor signs in with their Google account. Google is the only sign-in
  method.
- Signing in does not by itself create a member account. Until the privacy
  notice is accepted, the app holds only the Google sign-in identity (account
  ID, name, email) needed to keep the person signed in.
- Onboarding offers "cancel and remove my sign-in", which erases that sign-in
  identity immediately and signs the person out. A sign-in identity that never
  completes onboarding is erased after 30 days without activity.
- A member stays signed in on that device until they sign out, delete their
  account, or the session expires or becomes invalid (for example, Google
  access is revoked). They then see the sign-in screen and sign in with Google
  again; no data is lost.
- A signed-out visitor who opens a circle invite link has that invite
  remembered through Google sign-in and onboarding, and is returned to it once
  onboarding is complete. An already onboarded member who opens an invite link
  goes straight to it. What the invite shows, including for a reset link or a
  deleted circle, belongs to the Circles capability.

**Onboarding (a single step, required before anything else)**
- The person provides:
  - a display name, prefilled from their Google profile and editable, 1 to 50
    characters after trimming spaces;
  - a WhatsApp number with its country code, entered by the member and not
    verified. The country code starts as +91 (India) and can be changed to any
    other country. The number is stored in international E.164 form: "+",
    country code and number, digits only, with spaces, dashes and brackets
    removed. The WhatsApp link uses those same digits;
  - a confirmation that they are 18 or older (self-declared).
- The person is shown the privacy notice and gives consent by an explicit
  action, such as ticking an unticked "I agree" box and continuing; reading or
  scrolling alone is not consent. The notice states:
  - what is stored and why:
    - display name and WhatsApp number, so circle members can recognise and
      contact them;
    - email and Google account ID, to sign them in; never shown to other
      members;
    - listed cards, so circle members can find a card holder;
    - circle memberships, to decide who can see whom;
    - usage events (joins, invites, cards listed, searches, WhatsApp taps)
      linked to them and their circle, so the owner can see per circle whether
      the app is used; the link to them is removed on deletion;
  - who sees what: members of the circles they are in see their display name,
    WhatsApp number and cards; only the owner sees usage data; nobody else
    sees any of it;
  - that the app never asks for card numbers, CVV, expiry or OTPs, and that
    they must never share them;
  - how to withdraw consent (delete the account), how to see and correct their
    data (the profile), and a contact address for questions and grievances;
  - that deleted data may survive in the hosting provider's automatic backups
    until those backups expire.
- The app keeps the exact text of every notice version and records, for each
  member, which version they accepted and when.
- If a later notice version changes what data is collected, why, or who sees
  it, an existing member must accept it before they continue using the app;
  until they do, no new data use applies to them. Wording-only changes need no
  re-acceptance.
- The member account is created only when onboarding is submitted with all of
  the above.

**Enforcement**
- These rules are enforced by the system itself, not only by what screens
  show:
  - a person without a completed account cannot join circles, list cards or
    search, and is never returned in any member, circle or search data;
  - a member's display name, WhatsApp number and cards are returned only to
    members who share at least one circle with them, and only while they do;
  - a member's email and Google account ID are never returned to another
    member.

**Profile**
- A member can view their display name, WhatsApp number and Google email.
- They can edit the display name and WhatsApp number under the same rules as
  onboarding. An invalid value is rejected with a message and the previous
  value is kept.
- A saved change is what circle members see, and what every WhatsApp link
  uses, from then on.

**Sign out**
- Signing out ends the session on that device only.

**Delete account**
- Any member can delete their account, including the admin or sole member of
  a circle; deletion is never blocked. The Circles capability defines what
  happens to a circle when its admin leaves, and deletion applies that outcome
  to every circle the member is in.
- Deletion needs an explicit confirmation step that says it is permanent.
- Deletion is all-or-nothing: either everything below happens, or nothing is
  removed and the member sees an error and can retry.
- Deletion removes:
  - the profile, WhatsApp number, email, Google account ID and consent record;
  - every listed card and every circle membership;
  - the link between the member and their usage events; the events remain
    without any member identifier and are used only to produce counts (Usage
    metrics capability).
- Every session on every device ends. A request that still carries an old
  session is refused and cannot recreate any data.
- Removed data disappears from the live app immediately; copies in the hosting
  provider's automatic backups expire under that provider's retention period.
- Signing in again later with the same Google account is treated as a new
  person with no prior data.

**Out of scope**
- Phone-number verification (OTP), email/password and other sign-in providers.
- Profile photos.
- Parental-consent flows; people under 18 cannot join.
- Designating the owner who sees usage counts (Usage metrics capability).

## Acceptance criteria

1. Completing onboarding creates exactly one account; later sign-ins with the
   same Google account, even after its email changes, open that same account.
2. Signing in without completing onboarding creates no member account; that
   person cannot join a circle, list a card or search, and never appears in any
   member, circle or search data, including through direct data requests.
3. Onboarding cannot be submitted without a 1 to 50 character display name, a
   WhatsApp number that normalises to a valid E.164 number (the country code
   defaults to +91 and a non-Indian number is accepted), the 18-or-older
   confirmation and explicit consent.
4. The exact text of every privacy-notice version is kept, and every member's
   accepted version and acceptance time are stored.
5. "Cancel and remove my sign-in" erases the sign-in identity and signs the
   person out; an unfinished sign-in identity with no activity for 30 days is
   erased.
6. A signed-out visitor who opens an invite link, signs in and completes
   onboarding lands back on that invite; an onboarded member who opens an
   invite link goes straight to it.
7. When a session expires or becomes invalid, the member sees the sign-in
   screen and, after signing in again, finds their data unchanged.
8. Editing the display name or WhatsApp number applies the onboarding rules;
   after a valid change, other members see the new name and the WhatsApp link
   opens a chat with the new number.
9. No screen or data response available to another member contains a member's
   email or Google account ID, and a member's name, number and cards are
   returned only to members who share a circle with them.
10. Signing out on one device does not sign the member out on another device.
11. Deletion requires an explicit confirmation, and the sole admin of a circle
    can delete their account.
12. After deletion, the member's name, number and cards appear nowhere, their
    usage events carry no member identifier, all their sessions have ended,
    and a request using an old session cannot recreate any data.
13. If deletion fails partway, no data is removed and the member can retry.
14. Signing in again with a deleted member's Google account starts onboarding
    as a new person with no cards and no circle memberships.
15. After a notice version that changes data use is published, an existing
    member must accept it before continuing to use the app.
