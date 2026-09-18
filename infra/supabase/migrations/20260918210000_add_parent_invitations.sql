CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.parent_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id),
  intended_role text NOT NULL DEFAULT 'parent'
    CONSTRAINT parent_invitations_role_is_parent CHECK (intended_role = 'parent'),
  token_digest bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT parent_invitations_expire_after_24_hours
    CHECK (expires_at = created_at + interval '24 hours'),
  CONSTRAINT parent_invitations_used_after_creation
    CHECK (used_at IS NULL OR used_at >= created_at),
  CONSTRAINT parent_invitations_revoked_after_creation
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

ALTER TABLE public.parent_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_invitations FROM anon, authenticated;

CREATE FUNCTION public.create_parent_invitation()
RETURNS TABLE (link_token text, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  target_household_id uuid;
  issued_at timestamptz;
  raw_token text;
BEGIN
  SELECT membership.household_id
  INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = actor_id
    AND membership.role = 'parent'
    AND membership.active;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Parent invitations are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.households
  WHERE id = target_household_id
  FOR UPDATE;

  IF (
    SELECT count(*)
    FROM public.members AS membership
    WHERE membership.household_id = target_household_id
      AND membership.role = 'parent'
      AND membership.active
  ) >= 2 THEN
    RAISE EXCEPTION 'This household already has two active parents.'
      USING ERRCODE = '23514',
        CONSTRAINT = 'parent_invitations_two_parent_limit';
  END IF;

  -- There can be only one current invitation from a creator. A fresh request
  -- revokes the prior unused invitation atomically before returning a new URL.
  UPDATE public.parent_invitations AS invitation
  SET revoked_at = coalesce(invitation.revoked_at, pg_catalog.clock_timestamp())
  WHERE invitation.household_id = target_household_id
    AND invitation.created_by = actor_id
    AND invitation.used_at IS NULL
    AND invitation.revoked_at IS NULL;

  issued_at := pg_catalog.clock_timestamp();
  raw_token := rtrim(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
    '='
  );

  INSERT INTO public.parent_invitations (
    household_id,
    intended_role,
    token_digest,
    created_by,
    created_at,
    expires_at
  ) VALUES (
    target_household_id,
    'parent',
    extensions.digest(raw_token, 'sha256'),
    actor_id,
    issued_at,
    issued_at + interval '24 hours'
  );

  RETURN QUERY
  SELECT raw_token, issued_at, issued_at + interval '24 hours';
END;
$$;

CREATE FUNCTION public.get_parent_invitation_status()
RETURNS TABLE (
  invitation_status text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  target_household_id uuid;
BEGIN
  SELECT membership.household_id
  INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = actor_id
    AND membership.role = 'parent'
    AND membership.active;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Parent invitations are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN invitation.used_at IS NOT NULL THEN 'consumed'
      WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
      WHEN invitation.expires_at <= pg_catalog.clock_timestamp() THEN 'expired'
      ELSE 'active'
    END,
    invitation.created_at,
    invitation.expires_at
  FROM public.parent_invitations AS invitation
  WHERE invitation.household_id = target_household_id
    AND invitation.created_by = actor_id
  ORDER BY invitation.created_at DESC
  LIMIT 1;
END;
$$;

CREATE FUNCTION public.revoke_parent_invitation()
RETURNS TABLE (
  invitation_status text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  target_household_id uuid;
  target_invitation public.parent_invitations%ROWTYPE;
BEGIN
  SELECT membership.household_id
  INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = actor_id
    AND membership.role = 'parent'
    AND membership.active;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Parent invitations are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  SELECT invitation.*
  INTO target_invitation
  FROM public.parent_invitations AS invitation
  WHERE invitation.household_id = target_household_id
    AND invitation.created_by = actor_id
    AND invitation.used_at IS NULL
  ORDER BY invitation.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF target_invitation.id IS NULL THEN
    RAISE EXCEPTION 'No unused parent invitation is available to revoke.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.parent_invitations AS invitation
  SET revoked_at = coalesce(invitation.revoked_at, pg_catalog.clock_timestamp())
  WHERE invitation.id = target_invitation.id
  RETURNING invitation.* INTO target_invitation;

  RETURN QUERY SELECT
    'revoked'::text,
    target_invitation.created_at,
    target_invitation.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_parent_invitation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_parent_invitation_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_parent_invitation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_parent_invitation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_invitation_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_parent_invitation() TO authenticated;
