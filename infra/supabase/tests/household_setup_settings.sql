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
  ('30000000-0000-0000-0000-000000000001', 'setup-parent@example.test'),
  ('30000000-0000-0000-0000-000000000002', 'invalid-zone@example.test'),
  ('30000000-0000-0000-0000-000000000003', NULL),
  ('30000000-0000-0000-0000-000000000004', 'nonmember@example.test'),
  ('30000000-0000-0000-0000-000000000005', 'concurrent@example.test');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001","email":"setup-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (
    SELECT household_id IS NOT NULL AND timezone = 'Africa/Lagos'
    FROM public.setup_household('Africa/Lagos')
  ),
  'setup returns a generated household and submitted zone'
);
COMMIT;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.households
    WHERE creator_account_id = '30000000-0000-0000-0000-000000000001'
  ) AND (
    SELECT count(*) = 1
      AND bool_and(role = 'parent' AND active)
    FROM public.members
    WHERE account_id = '30000000-0000-0000-0000-000000000001'
  ),
  'setup atomically persists one household and active parent membership'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001","email":"setup-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (SELECT timezone = 'Africa/Lagos' FROM public.setup_household('Etc/UTC')),
  'retry returns the existing setup rather than creating another household'
);
SELECT pg_temp.assert_true(
  (SELECT timezone = 'Africa/Lagos' FROM public.get_household_settings()),
  'active parent reads persisted settings without supplying a household ID'
);
COMMIT;

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.households WHERE creator_account_id = '30000000-0000-0000-0000-000000000001')
    AND
  (SELECT count(*) = 1 FROM public.members WHERE account_id = '30000000-0000-0000-0000-000000000001'),
  'retry creates no duplicate household or membership'
);

SELECT pg_temp.assert_true(
  app_private.household_timezone_for_scheduling(
    (SELECT id FROM public.households WHERE creator_account_id = '30000000-0000-0000-0000-000000000001')
  ) = 'Africa/Lagos',
  'scheduling reads the persisted zone immediately after setup'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002","email":"invalid-zone@example.test","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.setup_household('+01:00');
    RAISE EXCEPTION 'fixed offset was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.setup_household('Unknown/Nowhere');
    RAISE EXCEPTION 'unknown zone was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.setup_household('');
    RAISE EXCEPTION 'empty zone was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
COMMIT;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.households
    WHERE creator_account_id = '30000000-0000-0000-0000-000000000002'
  ),
  'failed setup leaves no partial household'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.get_household_settings()),
  'authenticated non-member reads no settings'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.setup_household('Africa/Lagos');
    RAISE EXCEPTION 'non-parent authentication created a household';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.update_household_timezone('Etc/UTC');
    RAISE EXCEPTION 'non-member updated settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","email":"child@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.get_household_settings()), 'child reads no settings');
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.setup_household('Africa/Lagos');
    RAISE EXCEPTION 'child created a household';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.update_household_timezone('Etc/UTC');
    RAISE EXCEPTION 'child updated settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","email":"inactive@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.get_household_settings()), 'inactive member reads no settings');
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.setup_household('Africa/Lagos');
    RAISE EXCEPTION 'inactive member created a household';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.update_household_timezone('Etc/UTC');
    RAISE EXCEPTION 'inactive member updated settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.get_household_settings()),
  'anonymous reads no settings'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.setup_household('Africa/Lagos');
    RAISE EXCEPTION 'anonymous setup was executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.update_household_timezone('Etc/UTC');
    RAISE EXCEPTION 'anonymous settings update was executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001","email":"setup-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  (SELECT timezone = 'America/New_York' FROM public.update_household_timezone('America/New_York')),
  'active parent updates derived household to a DST-observing zone'
);
SELECT pg_temp.assert_true(
  (SELECT timezone = 'America/New_York' FROM public.get_household_settings()),
  'next settings read returns the persisted update'
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.update_household_timezone('+05:30');
    RAISE EXCEPTION 'fixed offset update was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
SELECT pg_temp.assert_true(
  (SELECT timezone = 'America/New_York' FROM public.get_household_settings()),
  'failed update preserves the prior zone'
);
COMMIT;

SELECT pg_temp.assert_true(
  app_private.household_timezone_for_scheduling(
    (SELECT id FROM public.households WHERE creator_account_id = '30000000-0000-0000-0000-000000000001')
  ) = 'America/New_York',
  'scheduling reads the current persisted DST-observing zone after update'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000001","email":"other-parent@example.test","role":"authenticated"}';
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.get_household_settings()
    WHERE household_id = (
      SELECT id FROM public.households
      WHERE creator_account_id = '30000000-0000-0000-0000-000000000001'
    )
  ),
  'parent cannot target or read another household settings result'
);
COMMIT;

SELECT 'household setup/settings database verification passed' AS result;
