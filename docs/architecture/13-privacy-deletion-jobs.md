# Privacy enforcement, account deletion and jobs

## Visibility enforcement

- A single `circles` service-bus query, "member ids sharing a circle with X",
  backs every read that returns another member's name, WhatsApp number or
  cards: circle member lists, browsing a member's cards, search results and the
  contact action.
- The contact action re-checks the card and the shared circle at press time
  and returns "This card is no longer available." otherwise.
- Email and Google account ID are never included in any DTO returned for
  another member; the member's own profile DTO includes them.
- The owner usage view returns aggregate counts only; no endpoint returns
  individual usage events or member identifiers.

## Account deletion

One database transaction, all or nothing:

1. Lock the member row.
2. For every circle the member belongs to, apply the Circles "admin leaves"
   rule: if they are admin, pass the role to the remaining member with the
   earliest `joinedAtUtc` (ties by lowest membership id); if no members remain,
   soft-delete the circle (set `deletedAtUtc`, clear `inviteCode`).
3. Set `UsageEvent.memberId` and `UsageEvent.holderMemberId` to null where
   they reference the member.
4. Delete the `Member` row; foreign-key cascades delete sessions, consents,
   cards, memberships and removal blocks.

If any step fails the transaction rolls back and the member sees an error and
can retry. Render's backups keep deleted data until they expire (3-day
point-in-time restore, and 7 days for any manual copy; there are no automatic
daily backups, see decision 0017), as the privacy notice states.

## Usage events

- Written by each module through the `usage` module's service-bus command
  after the member's action commits, in a separate write that swallows and
  logs its own failure, so recording never blocks, delays or undoes an action.
- A `search` event stores bank id and card type, never the variant text.
- `isOwnerCreated` is set on `Circle` at creation by comparing the creator's
  Google account ID with `OWNER_GOOGLE_ACCOUNT_ID`.

## Daily cleanup job

- Runs inside the API with `@nestjs/schedule` once a day at 03:00 Asia/Kolkata.
- Deletes `PendingSignIn` rows (and their sessions) whose `lastActivityAtUtc`
  is older than 30 days, and `Session` rows past `expiresAtUtc`.
- Idempotent; logs start, counts and finish without personal data; an error is
  logged and retried the next day.
