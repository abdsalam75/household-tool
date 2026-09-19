-- Keep names unique across active and deactivated children. Parent names do not
-- participate, and the household key allows the same name in another home.
CREATE UNIQUE INDEX members_child_name_unique
ON public.members (
  household_id,
  lower(btrim(regexp_replace(display_name, '[[:space:]]+', ' ', 'g')))
)
WHERE role = 'child';

CREATE FUNCTION public.list_child_profiles()
RETURNS TABLE (child_id uuid, display_name text, active boolean)
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
  SELECT child.id, child.display_name, child.active
  FROM public.members AS child
  WHERE child.household_id = target_household_id
    AND child.role = 'child'
  ORDER BY child.display_name, child.id;
END;
$$;

CREATE FUNCTION public.create_child_profile(requested_display_name text)
RETURNS TABLE (child_id uuid, display_name text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_household_id uuid;
  cleaned_name text := btrim(regexp_replace(requested_display_name, '[[:space:]]+', ' ', 'g'));
BEGIN
  SELECT membership.household_id INTO target_household_id
  FROM public.members AS membership
  WHERE membership.account_id = auth.uid()
    AND membership.role = 'parent'
    AND membership.active
  FOR SHARE;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Child profiles are unavailable.' USING ERRCODE = '42501';
  END IF;

  IF cleaned_name IS NULL OR cleaned_name = '' THEN
    RAISE EXCEPTION 'Enter a child name.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.members (household_id, account_id, display_name, role, active)
  VALUES (target_household_id, NULL, cleaned_name, 'child', true)
  RETURNING id, public.members.display_name, public.members.active;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A child with this name already exists.'
    USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.deactivate_child_profile(requested_child_id uuid)
RETURNS TABLE (child_id uuid, display_name text, active boolean)
LANGUAGE plpgsql
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
    AND membership.active
  FOR SHARE;

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Child profiles are unavailable.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.members AS child
  SET active = false
  WHERE child.id = requested_child_id
    AND child.household_id = target_household_id
    AND child.role = 'child'
    AND child.active
  RETURNING child.id, child.display_name, child.active;

  IF FOUND THEN RETURN; END IF;

  -- A retry is safe and does not update the timestamp or another member.
  RETURN QUERY
  SELECT child.id, child.display_name, child.active
  FROM public.members AS child
  WHERE child.id = requested_child_id
    AND child.household_id = target_household_id
    AND child.role = 'child';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Child profiles are unavailable.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_child_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_child_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_child_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_child_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_child_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_child_profile(uuid) TO authenticated;
