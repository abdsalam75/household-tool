# Child invitations

From child-profile administration, an active parent selects an active child
whose activation is incomplete. The parent may create or replace a 24-hour
invitation, copy its canonical `/invitations/child?token=...` URL, share that
same URL through the native share sheet, or revoke it. QR rendering is local.
The URL contains only an opaque token. Native link deployment is tracked in
issue #53, and opening or consuming the link is tracked in issue #14.

The three `*_child_invitation` RPCs authorize the caller against an active
parent membership and resolve the selected child inside that household. The
existing `parent_invitations` table now also holds child invitations with
`intended_role = 'child'` and `child_profile_id`. Only the create RPC returns
the raw 32-byte random token, encoded as URL-safe text. The database stores
its SHA-256 digest, creator, child and household binding, and 24-hour server
expiry. A partial unique index and child-row lock serialize replacement for
one profile. Status and revocation return no token. Revocation is available to
either active parent of that household.

The app keeps a token-bearing URL only in the parent's secure local store and
visible invitation screen. On another device, an active invitation has an
unavailable-link state; the parent can replace or revoke it. The later child
validation and consumption transaction must verify the digest, role, child
binding, active child membership, expiry, and unused/unrevoked state while
holding a row lock, then mark `used_at` atomically. This issue does not add
that transaction or PIN setup.
