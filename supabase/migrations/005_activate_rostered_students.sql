-- Mark a student invitation active after that student verifies their own
-- email and signs in. The function can only activate the caller's email.
CREATE OR REPLACE FUNCTION public.roster_activate_student_links()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile UUID; email_value TEXT; changed_count INTEGER;
BEGIN
  profile := public.current_profile_id();
  email_value := public.current_profile_email();
  IF profile IS NULL OR email_value IS NULL THEN RAISE EXCEPTION 'Verified student session required'; END IF;
  UPDATE public.roster_entries
  SET status = 'active', student_user_id = profile, updated_at = now()
  WHERE lower(student_email) = email_value
    AND (student_user_id IS NULL OR student_user_id = profile)
    AND (status <> 'active' OR student_user_id IS DISTINCT FROM profile);
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.roster_activate_student_links() TO authenticated;
