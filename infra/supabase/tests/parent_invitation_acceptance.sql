\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion failed: %', label;
  END IF;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'accept-inviter@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'accepted-parent@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'rejected-parent@example.test'),
  ('40000000-0000-0000-0000-000000000004', NULL),
  ('40000000-0000-0000-0000-000000000005', 'existing-member@example.test'),
  ('40000000-0000-0000-0000-000000000006', 'full-inviter@example.test'),
  ('40000000-0000-0000-0000-000000000007', 'full-parent@example.test'),
  ('40000000-0000-0000-0000-000000000008', 'limit-recipient@example.test');

INSERT INTO public.households (id, timezone, creator_account_id)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Africa/Lagos', '40000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'Etc/UTC', '40000000-0000-0000-0000-000000000005'),
  ('d0000000-0000-0000-0000-000000000003', 'America/New_York', '40000000-0000-0000-0000-000000000006');

INSERT INTO public.members (household_id, account_id, display_name, role, active)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Inviter', 'parent', true),
  ('d0000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005', 'Existing', 'parent', true),
  ('d0000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000006', 'Full inviter', 'parent', true),
  ('d0000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000007', 'Full parent', 'parent', true);

INSERT INTO public.parent_invitations (
  household_id, intended_role, token_digest, created_by, created_at, expires_at,
  used_at, revoked_at
)
SELECT
  fixture.household_id,
  'parent',
  extensions.digest(repeat(fixture.token_character, 43), 'sha256'),
  fixture.created_by,
  fixture.created_at,
  fixture.created_at + interval '24 hours',
  fixture.used_at,
  fixture.revoked_at
FROM (
  VALUES
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'a', clock_timestamp(), NULL::timestamptz, NULL::timestamptz),
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'b', clock_timestamp() - interval '25 hours', NULL::timestamptz, NULL::timestamptz),
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'c', clock_timestamp(), NULL::timestamptz, clock_timestamp()),
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'd', clock_timestamp(), clock_timestamp(), NULL::timestamptz),
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'e', clock_timestamp(), NULL::timestamptz, NULL::timestamptz),
    ('d0000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'f', clock_timestamp(), NULL::timestamptz, NULL::timestamptz),
    ('d0000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000006'::uuid, 'g', clock_timestamp(), NULL::timestamptz, NULL::timestamptz)
) AS fixture(household_id, created_by, token_character, created_at, used_at, revoked_at);

BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.accept_parent_invitation(repeat('a', 43));
    RAISE EXCEPTION 'anonymous invitation acceptance succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000002","email":"accepted-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (
    SELECT invitation_status = 'accepted'
      AND household_id = 'd0000000-0000-0000-0000-000000000001'
      AND timezone = 'Africa/Lagos'
    FROM public.accept_parent_invitation(repeat('a', 43))
  ),
  'valid acceptance returns the invited household flow data'
);
COMMIT;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(display_name = 'accepted-parent@example.test')
      AND bool_and(role = 'parent' AND active)
    FROM public.members
    WHERE account_id = '40000000-0000-0000-0000-000000000002'
  ) AND (
    SELECT used_at IS NOT NULL
    FROM public.parent_invitations
    WHERE token_digest = extensions.digest(repeat('a', 43), 'sha256')
  ),
  'acceptance atomically creates one active parent and consumes the invitation'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000002","email":"accepted-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'consumed' FROM public.accept_parent_invitation(repeat('a', 43))),
  'acceptance retry reports already consumed'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.households WHERE id = 'd0000000-0000-0000-0000-000000000001')
    AND
  (SELECT count(*) = 2 FROM public.members WHERE household_id = 'd0000000-0000-0000-0000-000000000001'),
  'accepted parent inherits household and member read permissions'
);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000003","email":"rejected-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT invitation_status = 'invalid' FROM public.accept_parent_invitation('malformed')), 'malformed token is invalid');
SELECT pg_temp.assert_true((SELECT invitation_status = 'invalid' FROM public.accept_parent_invitation(repeat('z', 43))), 'unknown digest is invalid');
SELECT pg_temp.assert_true((SELECT invitation_status = 'expired' FROM public.accept_parent_invitation(repeat('b', 43))), 'expired invitation is rejected');
SELECT pg_temp.assert_true((SELECT invitation_status = 'revoked' FROM public.accept_parent_invitation(repeat('c', 43))), 'revoked invitation is rejected');
SELECT pg_temp.assert_true((SELECT invitation_status = 'consumed' FROM public.accept_parent_invitation(repeat('d', 43))), 'consumed invitation is rejected');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT invitation_status = 'unauthorized' FROM public.accept_parent_invitation(repeat('e', 43))), 'ineligible account is rejected');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000005","email":"existing-member@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT invitation_status = 'already_member' FROM public.accept_parent_invitation(repeat('f', 43))), 'existing member cannot join a second household');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000008';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000008","email":"limit-recipient@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT invitation_status = 'parent_limit' FROM public.accept_parent_invitation(repeat('g', 43))), 'two-parent household rejects another parent');
COMMIT;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE account_id IN (
      '40000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000004',
      '40000000-0000-0000-0000-000000000008'
    )
  ) AND (
    SELECT count(*) = 3
    FROM public.parent_invitations
    WHERE token_digest IN (
      extensions.digest(repeat('e', 43), 'sha256'),
      extensions.digest(repeat('f', 43), 'sha256'),
      extensions.digest(repeat('g', 43), 'sha256')
    )
      AND used_at IS NULL
  ),
  'all rejected authorization and limit outcomes leave invitations and memberships unchanged'
);

BEGIN;
INSERT INTO public.members (id, household_id, display_name, role, active)
VALUES ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Wrong-role target', 'child', true);
INSERT INTO public.parent_invitations (
  household_id, intended_role, child_profile_id, token_digest, created_by, created_at, expires_at
)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'child',
  'd1000000-0000-0000-0000-000000000001',
  extensions.digest(repeat('h', 43), 'sha256'),
  '40000000-0000-0000-0000-000000000001',
  statement_timestamp(),
  statement_timestamp() + interval '24 hours'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000003","email":"rejected-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT invitation_status = 'wrong_role' FROM public.accept_parent_invitation(repeat('h', 43))), 'wrong-role invitation is rejected');
ROLLBACK;

SELECT 'parent invitation acceptance database verification passed' AS result;
