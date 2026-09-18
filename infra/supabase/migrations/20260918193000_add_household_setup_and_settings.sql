CREATE UNIQUE INDEX members_account_unique
ON public.members (account_id)
WHERE account_id IS NOT NULL;

CREATE FUNCTION app_private.parent_authentication_is_eligible()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND nullif(
      pg_catalog.btrim(
        coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
          ->> 'email'
      ),
      ''
    ) IS NOT NULL
    AND coalesce(
      (
        coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
          ->> 'is_anonymous'
      )::boolean,
      false
    ) IS NOT TRUE;
$$;

REVOKE ALL ON FUNCTION app_private.parent_authentication_is_eligible() FROM PUBLIC;

CREATE FUNCTION public.setup_household(requested_timezone text)
RETURNS TABLE (household_id uuid, timezone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  existing_membership public.members%ROWTYPE;
  created_household public.households%ROWTYPE;
  parent_name text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Household setup is unavailable.' USING ERRCODE = '42501';
  END IF;

  -- Serialize setup for one Auth account so a retry cannot create an orphaned
  -- second household before the membership uniqueness check becomes visible.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text, 0)
  );

  SELECT membership.*
  INTO existing_membership
  FROM public.members AS membership
  WHERE membership.account_id = actor_id;

  IF FOUND THEN
    IF existing_membership.role = 'parent' AND existing_membership.active THEN
      RETURN QUERY
      SELECT household.id, household.timezone
      FROM public.households AS household
      WHERE household.id = existing_membership.household_id;
      RETURN;
    END IF;

    RAISE EXCEPTION 'This account cannot create a household.'
      USING ERRCODE = '23505';
  END IF;

  IF NOT app_private.parent_authentication_is_eligible() THEN
    RAISE EXCEPTION 'This account cannot create a household.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT app_private.is_named_iana_timezone(requested_timezone) THEN
    RAISE EXCEPTION 'Enter a valid named IANA time zone, such as Africa/Lagos or Etc/UTC.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.households (timezone, creator_account_id)
  VALUES (requested_timezone, actor_id)
  RETURNING * INTO created_household;

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
  )
  VALUES (
    created_household.id,
    actor_id,
    parent_name,
    'parent',
    true
  );

  RETURN QUERY SELECT created_household.id, created_household.timezone;
END;
$$;

CREATE FUNCTION public.get_household_settings()
RETURNS TABLE (household_id uuid, timezone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT household.id, household.timezone
  FROM public.members AS membership
  JOIN public.households AS household ON household.id = membership.household_id
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active;
END;
$$;

CREATE FUNCTION public.update_household_timezone(requested_timezone text)
RETURNS TABLE (household_id uuid, timezone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_household_id uuid;
BEGIN
  SELECT membership.household_id
  INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active
  FOR UPDATE;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Household settings are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT app_private.is_named_iana_timezone(requested_timezone) THEN
    RAISE EXCEPTION 'Enter a valid named IANA time zone, such as Africa/Lagos or Etc/UTC.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.households AS household
  SET timezone = requested_timezone
  WHERE household.id = target_household_id
  RETURNING household.id, household.timezone;
END;
$$;

CREATE FUNCTION app_private.household_timezone_for_scheduling(
  target_household_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT household.timezone
  FROM public.households AS household
  WHERE household.id = target_household_id;
$$;

REVOKE ALL ON FUNCTION public.setup_household(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_household_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_household_timezone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.household_timezone_for_scheduling(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.setup_household(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_household_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_household_timezone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.household_timezone_for_scheduling(uuid) TO service_role;
