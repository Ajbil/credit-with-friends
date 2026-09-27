# Data model

Naming follows `constitution/pnp-database-standards.md`: PascalCase singular
tables, camelCase columns, `<entity>Id` foreign keys, `...AtUtc` UTC
timestamps, `is/has` booleans, UUIDv7 primary keys named `id` (PostgreSQL 18
`uuidv7()`). Deviations for personal-data deletion and usage events are in
`90-constitution-deviations.md`.

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `PendingSignIn` | googleAccountId (unique), googleName, googleEmail, lastActivityAtUtc | Google identity before consent. Erased on "cancel", on onboarding completion, or after 30 days without activity. Not a member. |
| `Member` | googleAccountId (unique), googleEmail, displayName, whatsappE164, isAdultConfirmed, createdAtUtc, updatedAtUtc | Created only when onboarding is submitted. Hard-deleted on account deletion. |
| `Session` | memberId or pendingSignInId, tokenHash (unique), createdAtUtc, lastSeenAtUtc, expiresAtUtc, userAgentLabel | One row per signed-in device. The cookie holds a random token; only its hash is stored. |
| `PrivacyNoticeVersion` | version (unique), text, isMaterialChange, publishedAtUtc | Exact text of every version is kept forever (no personal data). |
| `Consent` | memberId, privacyNoticeVersionId, acceptedAtUtc | Deleted with the member. |
| `Bank` | id (stable slug, e.g. `hdfc-bank`), displayName, sortName | Seeded lookup table. Rows are added or renamed by migration, never deleted. |
| `Card` | memberId, bankId, type (`credit`/`debit`), variant, variantKey | `variantKey` = trimmed, lower-cased variant ("" when none). Unique (memberId, bankId, type, variantKey). Max 20 per member. |
| `Circle` | name, inviteCode (unique), adminMemberId (nullable), isOwnerCreated, createdAtUtc, deletedAtUtc | Deleted circles keep name, creation time, deletion time and owner-created flag; invite code is cleared so the link dies. |
| `CircleMembership` | circleId, memberId, joinedAtUtc | Unique (circleId, memberId). Max 100 per circle, 20 per member. Hard-deleted on leave, removal or account deletion. |
| `CircleRemovalBlock` | circleId, memberId, createdAtUtc | Deleted by "Clear all removals" or with the member. |
| `UsageEvent` | type, occurredAtUtc, memberId (nullable), holderMemberId (nullable), bankId, cardType, peopleFound | `type` in join, invite, card_listed, search, whatsapp_tap. Member links are set to null on account deletion. |
| `UsageEventCircle` | usageEventId, circleId | The circles an event carries (zero or more); rows survive circle deletion. |

## Invariants enforced in the database

- Unique constraints above; foreign keys with `ON DELETE CASCADE` from
  `Member` to `Session`, `Consent`, `Card`, `CircleMembership`,
  `CircleRemovalBlock`; `ON DELETE SET NULL` from `Member` to
  `UsageEvent.memberId`, `UsageEvent.holderMemberId` and `Circle.adminMemberId`.
- Limits that must hold under concurrency (100 members per circle, 20 circles
  per member, 20 cards per member) are checked inside a transaction that locks
  the circle row and the member row (`SELECT ... FOR UPDATE`) before inserting.
- Invite codes are 22-character base64url strings from 16 random bytes
  (128 bits) generated with Node's `crypto.randomBytes`.

## Derived values

- Visibility: member B can see member A's name, WhatsApp number and cards iff
  a `CircleMembership` row exists for both in at least one non-deleted circle.
- Search matching is done on `bankId`, `type` and `variantKey` substring; bank
  display-name corrections never affect matching.
- Usage-view periods are computed in Asia/Kolkata and compared against
  `occurredAtUtc` in UTC.
