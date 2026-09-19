-- Child invitations share the existing digest and lifecycle store. Only the
-- creating RPC returns the raw token; status and revocation never do.
ALTER TABLE public.parent_invitations
  DROP CONSTRAINT parent_invitations_role_is_parent;
ALTER TABLE public.parent_invitations
  ADD COLUMN child_profile_id uuid REFERENCES public.members (id),
  ADD CONSTRAINT invitations_role_target_match CHECK (
    (intended_role = 'parent' AND child_profile_id IS NULL)
    OR (intended_role = 'child' AND child_profile_id IS NOT NULL)
  );

CREATE UNIQUE INDEX child_invitations_one_unused_per_profile
  ON public.parent_invitations (child_profile_id)
  WHERE intended_role = 'child' AND used_at IS NULL AND revoked_at IS NULL;

-- Listing includes only the safe eligibility flag, never an account ID.
DROP FUNCTION public.list_child_profiles();
CREATE FUNCTION public.list_child_profiles()
RETURNS TABLE (child_id uuid, display_name text, active boolean, activation_complete boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_household_id uuid;
BEGIN
  SELECT membership.household_id INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Child profiles are unavailable.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT child.id, child.display_name, child.active, child.account_id IS NOT NULL
  FROM public.members AS child
  WHERE child.household_id = target_household_id
    AND child.role = 'child'
  ORDER BY child.display_name, child.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_child_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_child_profiles() TO authenticated;

CREATE FUNCTION public.create_child_invitation(requested_child_id uuid)
RETURNS TABLE (link_token text, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  target_household_id uuid;
  target_child public.members%ROWTYPE;
  issued_at timestamptz;
  raw_token text;
BEGIN
  SELECT membership.household_id INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = actor_id
    AND membership.role = 'parent'
    AND membership.active
  FOR SHARE;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Child invitations are unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT child.* INTO target_child
  FROM public.members AS child
  WHERE child.id = requested_child_id
    AND child.household_id = target_household_id
    AND child.role = 'child'
  FOR UPDATE;

  IF target_child.id IS NULL THEN
    RAISE EXCEPTION 'Child invitations are unavailable.' USING ERRCODE = '42501';
  END IF;
  IF NOT target_child.active OR target_child.account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Child invitation is unavailable.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.parent_invitations AS invitation
  SET revoked_at = pg_catalog.clock_timestamp()
  WHERE invitation.child_profile_id = target_child.id
    AND invitation.household_id = target_household_id
    AND invitation.intended_role = 'child'
    AND invitation.used_at IS NULL
    AND invitation.revoked_at IS NULL;

  issued_at := pg_catalog.clock_timestamp();
  raw_token := rtrim(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '='
  );
  INSERT INTO public.parent_invitations (
    household_id, intended_role, child_profile_id, token_digest,
    created_by, created_at, expires_at
  ) VALUES (
    target_household_id, 'child', target_child.id,
    extensions.digest(raw_token, 'sha256'), actor_id,
    issued_at, issued_at + interval '24 hours'
  );

  RETURN QUERY SELECT raw_token, issued_at, issued_at + interval '24 hours';
END;
$$;

CREATE FUNCTION public.get_child_invitation_status(requested_child_id uuid)
RETURNS TABLE (invitation_status text, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_household_id uuid;
BEGIN
  SELECT membership.household_id INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active;

  IF target_household_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members AS child
    WHERE child.id = requested_child_id
      AND child.household_id = target_household_id
      AND child.role = 'child'
  ) THEN
    RAISE EXCEPTION 'Child invitations are unavailable.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT CASE
      WHEN invitation.used_at IS NOT NULL THEN 'consumed'
      WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
      WHEN invitation.expires_at <= pg_catalog.clock_timestamp() THEN 'expired'
      ELSE 'active'
    END,
    invitation.created_at,
    invitation.expires_at
  FROM public.parent_invitations AS invitation
  WHERE invitation.child_profile_id = requested_child_id
    AND invitation.household_id = target_household_id
    AND invitation.intended_role = 'child'
  ORDER BY invitation.created_at DESC, invitation.id DESC
  LIMIT 1;
END;
$$;

CREATE FUNCTION public.revoke_child_invitation(requested_child_id uuid)
RETURNS TABLE (invitation_status text, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_household_id uuid;
  target_invitation public.parent_invitations%ROWTYPE;
BEGIN
  SELECT membership.household_id INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active
  FOR SHARE;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Child invitations are unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.members AS child
  WHERE child.id = requested_child_id
    AND child.household_id = target_household_id
    AND child.role = 'child'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Child invitations are unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT invitation.* INTO target_invitation
  FROM public.parent_invitations AS invitation
  WHERE invitation.child_profile_id = requested_child_id
    AND invitation.household_id = target_household_id
    AND invitation.intended_role = 'child'
  ORDER BY invitation.created_at DESC, invitation.id DESC
  LIMIT 1
  FOR UPDATE;

  IF target_invitation.id IS NULL THEN RETURN; END IF;
  IF target_invitation.used_at IS NULL AND target_invitation.revoked_at IS NULL THEN
    UPDATE public.parent_invitations AS invitation
    SET revoked_at = pg_catalog.clock_timestamp()
    WHERE invitation.id = target_invitation.id
    RETURNING invitation.* INTO target_invitation;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN target_invitation.used_at IS NOT NULL THEN 'consumed'
      ELSE 'revoked' END,
    target_invitation.created_at,
    target_invitation.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_child_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_child_invitation_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_child_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_child_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_child_invitation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_child_invitation(uuid) TO authenticated;
