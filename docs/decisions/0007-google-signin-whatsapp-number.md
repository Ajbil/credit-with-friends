---
status: accepted
confirmed_by: "Arihant"
date: 2026-09-26
stories: []
---

# Google sign-in with self-entered WhatsApp number

## Context
The WhatsApp contact link needs each member's phone number. Phone-OTP sign-in
verifies the number but costs money per SMS and needs provider/DLT setup, which
conflicts with free tiers. Email magic links add friction.

## Decision
Members sign in with Google and enter their WhatsApp number themselves; the
number is not verified.

## Consequences
- No SMS cost or DLT compliance work.
- A wrong or mistyped number is possible; invite-only circles make that
  tolerable.
- Members without a Google account cannot join in the MVP.
