\set ON_ERROR_STOP on

BEGIN;

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

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000006'),
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000005');

INSERT INTO public.households (id, timezone, creator_account_id)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'Africa/Lagos',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    'b0000000-0000-0000-0000-000000000001',
    'Africa/Lagos',
    '20000000-0000-0000-0000-000000000005'
  );

INSERT INTO public.households (timezone, creator_account_id)
VALUES ('Africa/Lagos', '10000000-0000-0000-0000-000000000006');

INSERT INTO public.members (household_id, account_id, display_name, role)
SELECT id, NULL, 'Defaulted child', 'child'
FROM public.households
WHERE creator_account_id = '10000000-0000-0000-0000-000000000006';

SELECT pg_temp.assert_true(
  (
    SELECT household.id IS NOT NULL
      AND household.created_at IS NOT NULL
      AND household.updated_at IS NOT NULL
      AND member.id IS NOT NULL
      AND member.active
      AND member.created_at IS NOT NULL
      AND member.updated_at IS NOT NULL
    FROM public.households AS household
    JOIN public.members AS member ON member.household_id = household.id
    WHERE household.creator_account_id = '10000000-0000-0000-0000-000000000006'
  ),
  'database-generated IDs, timestamps, and active default'
);

DELETE FROM public.members
WHERE household_id = (
  SELECT id
  FROM public.households
  WHERE creator_account_id = '10000000-0000-0000-0000-000000000006'
);
DELETE FROM public.households
WHERE creator_account_id = '10000000-0000-0000-0000-000000000006';

SELECT pg_temp.assert_true(
  (
    SELECT id IS NOT NULL
      AND created_at IS NOT NULL
      AND updated_at IS NOT NULL
      AND updated_at >= created_at
    FROM public.households
    WHERE id = 'a0000000-0000-0000-0000-000000000001'
  ),
  'household timestamp ordering'
);

INSERT INTO public.members (id, household_id, account_id, display_name, role)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Parent A1',
    'parent'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Parent A2',
    'parent'
  ),
  (
    'a2000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'Child A',
    'child'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Inactive A',
    'child'
  ),
  (
    'a2000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'Unactivated A',
    'child'
  ),
  (
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Parent B1',
    'parent'
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Child B',
    'child'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    'Inactive B',
    'child'
  );

UPDATE public.members
SET active = false
WHERE id IN (
  'a2000000-0000-0000-0000-000000000002',
  'b2000000-0000-0000-0000-000000000002'
);

SELECT pg_temp.assert_true(
  (
    SELECT id IS NOT NULL
      AND active
      AND created_at IS NOT NULL
      AND updated_at IS NOT NULL
      AND updated_at >= created_at
    FROM public.members
    WHERE id = 'a2000000-0000-0000-0000-000000000001'
  ),
  'member active and timestamp defaults'
);

UPDATE public.households
SET timezone = 'Africa/Lagos', updated_at = '2000-01-01 00:00:00+00'
WHERE id = 'a0000000-0000-0000-0000-000000000001';

UPDATE public.members
SET display_name = 'Child A updated', updated_at = '2000-01-01 00:00:00+00'
WHERE id = 'a2000000-0000-0000-0000-000000000001';

SELECT pg_temp.assert_true(
  (SELECT updated_at >= created_at FROM public.households WHERE id = 'a0000000-0000-0000-0000-000000000001')
    AND
  (SELECT updated_at >= created_at FROM public.members WHERE id = 'a2000000-0000-0000-0000-000000000001'),
  'updated_at triggers preserve timestamp ordering'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.households (timezone, creator_account_id)
    VALUES ('+01:00', '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'fixed offset timezone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.households (timezone, creator_account_id)
    VALUES ('', '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'empty timezone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.households (timezone, creator_account_id)
    VALUES ('Not/A_Real_Zone', '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'unknown timezone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'Unknown role', 'manager');
    RAISE EXCEPTION 'unknown role was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'Null role', NULL);
    RAISE EXCEPTION 'null role was accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES (NULL, '10000000-0000-0000-0000-000000000006', 'Null household', 'child');
    RAISE EXCEPTION 'null household was accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '10000000-0000-0000-0000-000000000006', 'Missing household', 'child');
    RAISE EXCEPTION 'nonexistent household was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Missing account', 'child');
    RAISE EXCEPTION 'nonexistent Auth account was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', NULL, 'Parent without account', 'parent');
    RAISE EXCEPTION 'parent without account was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Duplicate membership', 'child');
    RAISE EXCEPTION 'duplicate account membership was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, account_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Third parent', 'parent');
    RAISE EXCEPTION 'third active parent was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

UPDATE public.members
SET active = false
WHERE id = 'a1000000-0000-0000-0000-000000000002';

INSERT INTO public.members (id, household_id, account_id, display_name, role)
VALUES (
  'a1000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'Replacement parent A3',
  'parent'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.members WHERE household_id = 'a0000000-0000-0000-0000-000000000001' AND role = 'parent' AND active),
  'inactive parent can be replaced'
);

COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.households), 'active parent sees own household');
SELECT pg_temp.assert_true((SELECT count(*) = 6 FROM public.members), 'active parent sees every member in own household');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.households WHERE id = 'b0000000-0000-0000-0000-000000000001'), 'parent cannot select other household by ID');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members WHERE id = 'b2000000-0000-0000-0000-000000000001'), 'parent cannot select other household member by ID');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.households), 'active child sees no household');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.members), 'active child sees only own member row');
SELECT pg_temp.assert_true(
  (
    SELECT id = 'a2000000-0000-0000-0000-000000000001'
      AND display_name = 'Child A updated'
      AND role = 'child'
      AND account_id = '10000000-0000-0000-0000-000000000004'
      AND active
    FROM public.members
  ),
  'child-visible row is the child account own active membership'
);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members WHERE id <> 'a2000000-0000-0000-0000-000000000001'), 'child cannot discover any other member fields');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.households), 'inactive-only account sees no household');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members), 'inactive-only account sees no member');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.households), 'creator ID alone grants no household access');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members), 'creator ID alone grants no member access');
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.households), 'anonymous sees no household');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.members), 'anonymous sees no member');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.households (timezone, creator_account_id)
    VALUES ('Africa/Lagos', '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'authenticated insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.households SET timezone = 'Africa/Lagos';
    RAISE EXCEPTION 'authenticated update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.households;
    RAISE EXCEPTION 'authenticated household delete was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'Authenticated child', 'child');
    RAISE EXCEPTION 'authenticated member insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.members SET display_name = 'Authenticated update';
    RAISE EXCEPTION 'authenticated member update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.members;
    RAISE EXCEPTION 'authenticated member delete was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.households (timezone, creator_account_id)
    VALUES ('Africa/Lagos', '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'anonymous household insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.households SET timezone = 'Africa/Lagos';
    RAISE EXCEPTION 'anonymous household update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.households;
    RAISE EXCEPTION 'anonymous household delete was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.members (household_id, display_name, role)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'Anonymous child', 'child');
    RAISE EXCEPTION 'anonymous member insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.members SET display_name = 'Anonymous update';
    RAISE EXCEPTION 'anonymous member update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.members;
    RAISE EXCEPTION 'anonymous member delete was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

SELECT 'household/member database verification passed' AS result;
