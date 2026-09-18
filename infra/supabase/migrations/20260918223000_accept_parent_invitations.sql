CREATE FUNCTION public.accept_parent_invitation(raw_token text)
RETURNS TABLE (
  invitation_status text,
  household_id uuid,
  timezone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  accepted_at timestamptz := pg_catalog.clock_timestamp();
  target_invitation public.parent_invitations%ROWTYPE;
  target_timezone text;
  parent_name text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Parent invitation acceptance is unavailable.'
      USING ERRCODE = '42501';
  END IF;

  IF raw_token IS NULL OR raw_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- An account and an invitation are each serialized so competing joins and
  -- retries cannot create a second membership or partially consume an invite.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text, 0)
  );

  SELECT invitation.*
  INTO target_invitation
  FROM public.parent_invitations AS invitation
  WHERE invitation.token_digest = extensions.digest(raw_token, 'sha256')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_invitation.intended_role <> 'parent' THEN
    RETURN QUERY SELECT 'wrong_role'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_invitation.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_invitation.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_invitation.expires_at <= accepted_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF NOT app_private.parent_authentication_is_eligible() THEN
    RETURN QUERY SELECT 'unauthorized'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.households
  WHERE id = target_invitation.household_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.members AS membership
    WHERE membership.account_id = actor_id
  ) THEN
    RETURN QUERY SELECT 'already_member'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF (
    SELECT count(*)
    FROM public.members AS membership
    WHERE membership.household_id = target_invitation.household_id
      AND membership.role = 'parent'
      AND membership.active
  ) >= 2 THEN
    RETURN QUERY SELECT 'parent_limit'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  parent_name := coalesce(
    nullif(
      pg_catalog.btrim(
        coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
          ->> 'email'
      ),
      ''
    ),
    'Parent'
  );

  INSERT INTO public.members (
    household_id,
    account_id,
    display_name,
    role,
    active
  ) VALUES (
    target_invitation.household_id,
    actor_id,
    parent_name,
    'parent',
    true
  );

  UPDATE public.parent_invitations AS invitation
  SET used_at = accepted_at
  WHERE invitation.id = target_invitation.id;

  SELECT household.timezone
  INTO target_timezone
  FROM public.households AS household
  WHERE household.id = target_invitation.household_id;

  RETURN QUERY SELECT
    'accepted'::text,
    target_invitation.household_id,
    target_timezone;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_parent_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_parent_invitation(text) TO authenticated;
