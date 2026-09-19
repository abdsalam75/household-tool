\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', label; END IF;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('61000000-0000-0000-0000-000000000001', 'parent-a@example.test'),
  ('61000000-0000-0000-0000-000000000002', 'parent-a2@example.test'),
  ('61000000-0000-0000-0000-000000000003', 'parent-b@example.test'),
  ('61000000-0000-0000-0000-000000000004', 'child@example.test'),
  ('61000000-0000-0000-0000-000000000005', 'inactive@example.test'),
  ('61000000-0000-0000-0000-000000000006', 'outsider@example.test'),
  ('61000000-0000-0000-0000-000000000007', 'activated@example.test');

INSERT INTO public.households (id, timezone, creator_account_id) VALUES
  ('62000000-0000-0000-0000-000000000001', 'Africa/Lagos', '61000000-0000-0000-0000-000000000001'),
  ('62000000-0000-0000-0000-000000000002', 'Etc/UTC', '61000000-0000-0000-0000-000000000003');

INSERT INTO public.members (id, household_id, account_id, display_name, role, active) VALUES
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Parent A', 'parent', true),
  ('63000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'Parent A2', 'parent', true),
  ('63000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', 'Parent B', 'parent', true),
  ('63000000-0000-0000-0000-000000000004', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000004', 'Child caller', 'child', true),
  ('63000000-0000-0000-0000-000000000005', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000005', 'Inactive parent', 'parent', false),
  ('64000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', NULL, 'Ada', 'child', true),
  ('64000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', NULL, 'Ben', 'child', true),
  ('64000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001', NULL, 'Old child', 'child', false),
  ('64000000-0000-0000-0000-000000000004', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000007', 'Activated child', 'child', true),
  ('64000000-0000-0000-0000-000000000005', '62000000-0000-0000-0000-000000000002', NULL, 'B child', 'child', true);

CREATE FUNCTION pg_temp.session_count()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN RETURN 0; END IF;
  EXECUTE 'SELECT count(*) FROM auth.sessions' INTO total;
  RETURN total;
END;
$$;
CREATE TEMP TABLE invitation_baseline AS
SELECT (SELECT count(*) FROM auth.users) AS users,
  (SELECT count(*) FROM public.members) AS members,
  pg_temp.session_count() AS sessions;

SELECT pg_temp.assert_true(
  pg_get_function_arguments('public.create_child_invitation(uuid)'::regprocedure) = 'requested_child_id uuid'
    AND pg_get_function_arguments('public.revoke_child_invitation(uuid)'::regprocedure) = 'requested_child_id uuid'
    AND NOT has_table_privilege('authenticated', 'public.parent_invitations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.parent_invitations', 'INSERT'),
  'API accepts a child selection only; no direct invitation access'
);

CREATE FUNCTION pg_temp.assert_denied(target uuid, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_child_invitation(target);
    RAISE EXCEPTION 'create allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.get_child_invitation_status(target);
    RAISE EXCEPTION 'status allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.revoke_child_invitation(target);
    RAISE EXCEPTION 'revoke allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'anonymous');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'child');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'inactive parent');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000006';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'outsider');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'other household');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.list_child_profiles()), 'parent B sees only own child');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.parent_invitations WHERE intended_role = 'child'), 'denied callers made no invitations');

CREATE TEMP TABLE issued_child_links (
  child_id uuid, link_token text, created_at timestamptz, expires_at timestamptz
);
GRANT SELECT, INSERT ON issued_child_links TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 5 FROM public.list_child_profiles())
    AND (SELECT activation_complete FROM public.list_child_profiles() WHERE display_name = 'Activated child')
    AND (SELECT NOT activation_complete FROM public.list_child_profiles() WHERE display_name = 'Ada'),
  'safe profile listing exposes activation eligibility without credentials'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'deactivated child invited';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'activated child invited';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
INSERT INTO issued_child_links SELECT '64000000-0000-0000-0000-000000000001', * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000001');
INSERT INTO issued_child_links SELECT '64000000-0000-0000-0000-000000000002', * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000002');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000003';
INSERT INTO issued_child_links SELECT '64000000-0000-0000-0000-000000000005', * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000005');
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM issued_child_links WHERE link_token ~ '^[A-Za-z0-9_-]{43}$' AND expires_at = created_at + interval '24 hours')
    AND (SELECT count(*) = 3 FROM public.parent_invitations WHERE intended_role = 'child' AND used_at IS NULL AND revoked_at IS NULL),
  'three independent child links have 256-bit tokens and exact server-time expiry'
);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'anonymous with existing link');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'child with existing link');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'inactive parent with existing link');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000006';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'outsider with existing link');
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_denied('64000000-0000-0000-0000-000000000001', 'cross-household existing link');
DO $$
DECLARE cross_message text; missing_message text;
BEGIN
  BEGIN
    PERFORM * FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS cross_message = MESSAGE_TEXT;
  END;
  BEGIN
    PERFORM * FROM public.get_child_invitation_status('ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS missing_message = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.assert_true(cross_message = missing_message, 'cross-household status reveals no existence');
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM public.parent_invitations WHERE intended_role = 'child' AND revoked_at IS NULL),
  'denied callers cannot create or revoke existing links'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM public.parent_invitations AS invitation
    JOIN issued_child_links AS issued ON issued.child_id = invitation.child_profile_id
      AND issued.created_at = invitation.created_at
    WHERE invitation.household_id = CASE WHEN issued.child_id = '64000000-0000-0000-0000-000000000005'
      THEN '62000000-0000-0000-0000-000000000002'::uuid ELSE '62000000-0000-0000-0000-000000000001'::uuid END
      AND invitation.intended_role = 'child'
      AND invitation.created_by = CASE WHEN issued.child_id = '64000000-0000-0000-0000-000000000005'
        THEN '61000000-0000-0000-0000-000000000003'::uuid ELSE '61000000-0000-0000-0000-000000000001'::uuid END
      AND invitation.token_digest = extensions.digest(issued.link_token, 'sha256')
      AND encode(invitation.token_digest, 'hex') <> issued.link_token
      AND invitation.used_at IS NULL AND invitation.revoked_at IS NULL),
  'server binds each child and household and stores digest, not raw token'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000002';
INSERT INTO issued_child_links SELECT '64000000-0000-0000-0000-000000000001', * FROM public.create_child_invitation('64000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true((SELECT invitation_status = 'active' FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000001')), 'other active parent sees current status');
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.parent_invitations WHERE child_profile_id = '64000000-0000-0000-0000-000000000001' AND revoked_at IS NOT NULL)
    AND (SELECT count(*) = 1 FROM public.parent_invitations WHERE child_profile_id = '64000000-0000-0000-0000-000000000001' AND revoked_at IS NULL)
    AND (SELECT count(*) = 1 FROM public.parent_invitations WHERE child_profile_id = '64000000-0000-0000-0000-000000000002' AND revoked_at IS NULL)
    AND (SELECT count(*) = 1 FROM public.parent_invitations WHERE child_profile_id = '64000000-0000-0000-0000-000000000005' AND revoked_at IS NULL),
  'replacement revokes only the earlier unused link for one child'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT invitation_status = 'revoked' FROM public.revoke_child_invitation('64000000-0000-0000-0000-000000000001')), 'other active parent revokes link');
SELECT pg_temp.assert_true((SELECT invitation_status = 'revoked' FROM public.revoke_child_invitation('64000000-0000-0000-0000-000000000001')), 'revoke retry is idempotent');
SELECT pg_temp.assert_true((SELECT invitation_status = 'revoked' FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000001')), 'revoked link is not active');
SELECT pg_temp.assert_true((SELECT invitation_status = 'active' FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000002')), 'other child unaffected');
RESET ROLE;

UPDATE public.parent_invitations
SET used_at = pg_catalog.clock_timestamp()
WHERE child_profile_id = '64000000-0000-0000-0000-000000000002' AND revoked_at IS NULL;
UPDATE public.parent_invitations
SET created_at = aged.created_at,
    expires_at = aged.created_at + interval '24 hours'
FROM (SELECT pg_catalog.clock_timestamp() - interval '25 hours' AS created_at) AS aged
WHERE child_profile_id = '64000000-0000-0000-0000-000000000005';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT invitation_status = 'consumed' FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000002')), 'consumed link is not active');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '61000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true((SELECT invitation_status = 'expired' FROM public.get_child_invitation_status('64000000-0000-0000-0000-000000000005')), 'expired link is not active');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM public.parent_invitations WHERE intended_role = 'child'), 'rejections, status, and revoke made no extra links');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM auth.users) = (SELECT users FROM invitation_baseline)
    AND (SELECT count(*) FROM public.members) = (SELECT members FROM invitation_baseline)
    AND pg_temp.session_count() = (SELECT sessions FROM invitation_baseline),
  'child invitation flow creates no credentials, memberships, or sessions'
);
ROLLBACK;
