CREATE FUNCTION app_private.is_named_iana_timezone(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT candidate IS NOT NULL
    AND candidate <> ''
    AND candidate !~ '^[+-][0-9]{2}(:?[0-9]{2})?$'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names() AS zone
      WHERE zone.name = candidate
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_named_iana_timezone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_named_iana_timezone(text) TO service_role;

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone text NOT NULL
    CONSTRAINT households_timezone_is_named_iana
    CHECK (app_private.is_named_iana_timezone(timezone)),
  creator_account_id uuid NOT NULL
    REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT households_updated_at_not_before_created_at
    CHECK (updated_at >= created_at)
);

CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL
    REFERENCES public.households (id),
  account_id uuid
    REFERENCES auth.users (id),
  display_name text NOT NULL
    CONSTRAINT members_display_name_not_empty CHECK (btrim(display_name) <> ''),
  role text NOT NULL
    CONSTRAINT members_role_is_known CHECK (role IN ('parent', 'child')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT members_parent_has_account
    CHECK (role <> 'parent' OR account_id IS NOT NULL),
  CONSTRAINT members_updated_at_not_before_created_at
    CHECK (updated_at >= created_at),
  CONSTRAINT members_household_account_unique
    UNIQUE (household_id, account_id)
);

CREATE FUNCTION app_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := greatest(pg_catalog.clock_timestamp(), NEW.created_at);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_updated_at() FROM PUBLIC;

CREATE TRIGGER households_set_updated_at
BEFORE UPDATE ON public.households
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER members_set_updated_at
BEFORE UPDATE ON public.members
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE FUNCTION app_private.enforce_active_parent_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active_parent_count integer;
BEGIN
  IF NEW.role IS DISTINCT FROM 'parent' OR NEW.active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Locking the household makes competing parent inserts or activations for
  -- the same household serialize before the count is checked.
  PERFORM 1
  FROM public.households
  WHERE id = NEW.household_id
  FOR UPDATE;

  SELECT count(*)
  INTO active_parent_count
  FROM public.members AS existing_member
  WHERE existing_member.household_id = NEW.household_id
    AND existing_member.role = 'parent'
    AND existing_member.active
    AND existing_member.id <> NEW.id;

  IF active_parent_count >= 2 THEN
    RAISE EXCEPTION 'a household cannot have more than two active parents'
      USING ERRCODE = '23514',
        CONSTRAINT = 'members_max_two_active_parents';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_parent_limit() FROM PUBLIC;

CREATE TRIGGER members_enforce_active_parent_limit
BEFORE INSERT OR UPDATE OF household_id, role, active ON public.members
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_parent_limit();

CREATE FUNCTION app_private.is_active_parent(target_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members AS membership
    WHERE membership.household_id = target_household_id
      AND membership.account_id = auth.uid()
      AND membership.role = 'parent'
      AND membership.active
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_active_parent(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_active_parent(uuid) TO authenticated;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY households_active_parent_select
ON public.households
FOR SELECT
TO authenticated
USING (app_private.is_active_parent(id));

CREATE POLICY members_active_parent_select
ON public.members
FOR SELECT
TO authenticated
USING (app_private.is_active_parent(household_id));

CREATE POLICY members_active_child_select_self
ON public.members
FOR SELECT
TO authenticated
USING (
  account_id = (SELECT auth.uid())
  AND role = 'child'
  AND active
);

REVOKE ALL ON public.households, public.members FROM anon, authenticated;
GRANT SELECT ON public.households, public.members TO anon, authenticated;
