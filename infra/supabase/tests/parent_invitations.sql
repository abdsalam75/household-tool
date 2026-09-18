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

BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_parent_invitation();
    RAISE EXCEPTION 'anonymous invitation creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_parent_invitation();
    RAISE EXCEPTION 'child invitation creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_parent_invitation();
    RAISE EXCEPTION 'inactive member invitation creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_parent_invitation();
    RAISE EXCEPTION 'inactive parent invitation creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_parent_invitation();
    RAISE EXCEPTION 'two-parent household invitation creation succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
COMMIT;

CREATE TEMP TABLE issued_invitation AS
SELECT NULL::text AS link_token, NULL::timestamptz AS created_at, NULL::timestamptz AS expires_at
WITH NO DATA;
GRANT SELECT, INSERT ON issued_invitation TO authenticated;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
INSERT INTO issued_invitation
SELECT * FROM public.create_parent_invitation();
COMMIT;

SELECT pg_temp.assert_true(
  (
    SELECT link_token ~ '^[A-Za-z0-9_-]{43}$'
      AND expires_at = created_at + interval '24 hours'
    FROM issued_invitation
  ),
  'creation returns a high-entropy opaque token with exact server expiry'
);

SELECT pg_temp.assert_true(
  (
    SELECT invitation.intended_role = 'parent'
      AND invitation.created_by = '20000000-0000-0000-0000-000000000001'
      AND invitation.used_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expires_at = invitation.created_at + interval '24 hours'
      AND invitation.token_digest = extensions.digest(issued.link_token, 'sha256')
      AND encode(invitation.token_digest, 'hex') <> issued.link_token
    FROM public.parent_invitations AS invitation
    CROSS JOIN issued_invitation AS issued
    WHERE invitation.household_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'database stores role, creator, lifecycle, and digest but not raw token'
);

SELECT pg_temp.assert_true(
  pg_get_function_arguments('public.create_parent_invitation()'::regprocedure) = ''
    AND pg_get_function_arguments('public.revoke_parent_invitation()'::regprocedure) = '',
  'creation and revocation accept no forgeable household or invitation identifier'
);

INSERT INTO auth.users (id, email)
VALUES ('20000000-0000-0000-0000-000000000006', 'second-b-parent@example.test');
INSERT INTO public.members (household_id, account_id, display_name, role, active)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000006',
  'Second B parent',
  'parent',
  true
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000006';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.revoke_parent_invitation();
    RAISE EXCEPTION 'non-creator revoked invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'revoked' FROM public.revoke_parent_invitation()),
  'creator revokes unused invitation'
);
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'revoked' FROM public.revoke_parent_invitation()),
  'revocation retry is idempotent'
);
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'revoked' FROM public.get_parent_invitation_status()),
  'revoked invitation is never active'
);
COMMIT;

UPDATE public.members
SET active = false
WHERE account_id = '20000000-0000-0000-0000-000000000006';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  PERFORM * FROM public.create_parent_invitation();
END;
$$;
COMMIT;

UPDATE public.parent_invitations
SET used_at = pg_catalog.clock_timestamp()
WHERE household_id = 'b0000000-0000-0000-0000-000000000001'
  AND revoked_at IS NULL;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'consumed' FROM public.get_parent_invitation_status()),
  'consumed invitation is never active or reusable'
);
COMMIT;

DELETE FROM public.parent_invitations
WHERE household_id = 'b0000000-0000-0000-0000-000000000001';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  PERFORM * FROM public.create_parent_invitation();
END;
$$;
COMMIT;

UPDATE public.parent_invitations
SET created_at = aged.created_at,
    expires_at = aged.created_at + interval '24 hours'
FROM (
  SELECT pg_catalog.clock_timestamp() - interval '25 hours' AS created_at
) AS aged
WHERE household_id = 'b0000000-0000-0000-0000-000000000001'
  AND used_at IS NULL
  AND revoked_at IS NULL;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT invitation_status = 'expired' FROM public.get_parent_invitation_status()),
  'expired invitation is never active'
);
COMMIT;

SELECT 'parent invitation database verification passed' AS result;
