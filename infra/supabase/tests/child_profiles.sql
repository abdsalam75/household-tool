\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion failed: %', label;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.session_count()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN RETURN 0; END IF;
  EXECUTE 'SELECT count(*) FROM auth.sessions' INTO total;
  RETURN total;
END;
$$;

CREATE TEMP TABLE child_profile_baseline AS
SELECT
  (SELECT count(*) FROM auth.users) AS users,
  pg_temp.session_count() AS sessions,
  (SELECT count(*) FROM public.parent_invitations) AS invitations;

INSERT INTO auth.users (id, email) VALUES
  ('50000000-0000-0000-0000-000000000001', 'parent-a@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'child-a@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'inactive-parent@example.test'),
  ('50000000-0000-0000-0000-000000000004', 'parent-b@example.test'),
  ('50000000-0000-0000-0000-000000000005', 'outsider@example.test');

INSERT INTO public.households (id, timezone, creator_account_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Africa/Lagos', '50000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'Etc/UTC', '50000000-0000-0000-0000-000000000004');

INSERT INTO public.members (id, household_id, account_id, display_name, role, active) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Parent A', 'parent', true),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'Inactive parent', 'parent', false),
  ('e1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Child A', 'child', true),
  ('e1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', 'Parent B', 'parent', true);

CREATE FUNCTION pg_temp.assert_rejected(label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM * FROM public.list_child_profiles();
    RAISE EXCEPTION 'list allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.create_child_profile('Denied child');
    RAISE EXCEPTION 'create allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.deactivate_child_profile('e1000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'deactivate allowed: %', label;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_rejected('anonymous');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_rejected('child');
SET LOCAL request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_rejected('inactive parent');
SET LOCAL request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_rejected('non-member');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '50000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.list_child_profiles()), 'parent B starts empty');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members WHERE role = 'child'), 'RLS hides other households');
DO $$
DECLARE
  cross_message text;
  missing_message text;
BEGIN
  BEGIN
    PERFORM * FROM public.deactivate_child_profile('e1000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'cross-household deactivation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS cross_message = MESSAGE_TEXT;
  END;
  BEGIN
    PERFORM * FROM public.deactivate_child_profile('ffffffff-ffff-ffff-ffff-ffffffffffff');
    RAISE EXCEPTION 'missing profile deactivation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS missing_message = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.assert_true(cross_message = missing_message, 'cross-household target is indistinguishable from missing');
END;
$$;
SELECT pg_temp.assert_true(
  (SELECT display_name = 'Ada' AND active FROM public.create_child_profile(' Ada ')),
  'another household may use same name'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.list_child_profiles()), 'parent sees own child only');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.list_child_profiles() WHERE display_name = 'Child A' AND active), 'parent listing includes status');
SELECT pg_temp.assert_true(
  (SELECT display_name = 'Ada Lovelace' AND active FROM public.create_child_profile('  Ada   Lovelace  ')),
  'new child is active with normalized stored name'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.members WHERE household_id = 'e0000000-0000-0000-0000-000000000001' AND display_name = 'Ada Lovelace' AND role = 'child' AND account_id IS NULL),
  'exactly one unlinked child record created'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_child_profile(E'  aDA\t  lovelace  ');
    RAISE EXCEPTION 'duplicate child accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.create_child_profile(E'  \t  ');
    RAISE EXCEPTION 'blank child accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.list_child_profiles()),
  'failed creates did not add records'
);
SELECT pg_temp.assert_true(
  (SELECT NOT active FROM public.deactivate_child_profile('e1000000-0000-0000-0000-000000000003')),
  'selected child deactivates'
);
SELECT pg_temp.assert_true(
  (SELECT NOT active FROM public.deactivate_child_profile('e1000000-0000-0000-0000-000000000003')),
  'deactivation retry is safe'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.list_child_profiles() WHERE display_name = 'Child A' AND NOT active)
    AND (SELECT count(*) = 1 FROM public.list_child_profiles() WHERE display_name = 'Ada Lovelace' AND active),
  'only selected child changes and stays listed'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_child_profile(' CHILD   A ');
    RAISE EXCEPTION 'deactivated name reused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.deactivate_child_profile('e1000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'parent row deactivated through child operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM auth.users) = (SELECT users + 5 FROM child_profile_baseline)
    AND pg_temp.session_count() = (SELECT sessions FROM child_profile_baseline)
    AND (SELECT count(*) FROM public.parent_invitations) = (SELECT invitations FROM child_profile_baseline),
  'profile administration creates no credentials, sessions, or invitations'
);

ROLLBACK;
