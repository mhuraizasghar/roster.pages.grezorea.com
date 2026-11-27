-- Replace the attempt-start RPC with fully qualified column references and
-- distinct local variable names (student_email previously collided with the
-- roster_entries column name in PL/pgSQL).
CREATE OR REPLACE FUNCTION public.roster_start_assignment_attempt(p_assignment_id UUID)
RETURNS public.attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_student_email TEXT;
  v_assignment public.assignments;
  v_existing public.attempts;
  v_created public.attempts;
  v_used_count INTEGER;
  v_max_attempts INTEGER;
  v_role TEXT;
BEGIN
  v_student_id := public.current_profile_id();
  v_student_email := public.current_profile_email();
  SELECT up.role INTO v_role
  FROM public.users_profile up
  WHERE up.auth_uid = auth.uid();

  IF v_student_id IS NULL OR v_student_email IS NULL OR v_role <> 'student' THEN
    RAISE EXCEPTION 'Verified student session required';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.assignments a
  WHERE a.id = p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roster_entries r
    WHERE r.teacher_id = v_assignment.teacher_id
      AND lower(r.student_email) = v_student_email
      AND (
        v_assignment.target_type = 'all_roster'
        OR (v_assignment.target_type = 'students'
          AND v_assignment.target_emails @> to_jsonb(ARRAY[v_student_email]))
        OR (v_assignment.target_type = 'groups'
          AND r.group_id IS NOT NULL
          AND v_assignment.target_group_ids @> to_jsonb(ARRAY[r.group_id::text]))
      )
  ) THEN
    RAISE EXCEPTION 'Assignment is not available to this student';
  END IF;

  SELECT a.* INTO v_existing
  FROM public.attempts a
  WHERE a.assignment_id = p_assignment_id
    AND a.student_id = v_student_id
    AND a.status = 'in_progress'
  LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  IF v_assignment.due_at IS NOT NULL AND now() > v_assignment.due_at THEN
    RAISE EXCEPTION 'Assignment due date has passed';
  END IF;

  v_max_attempts := coalesce((v_assignment.settings->>'maxAttempts')::INTEGER, 1);
  SELECT count(*) INTO v_used_count
  FROM public.attempts a
  WHERE a.assignment_id = p_assignment_id
    AND a.student_id = v_student_id
    AND a.status <> 'in_progress';
  IF v_max_attempts <> 0 AND v_used_count >= v_max_attempts THEN
    RAISE EXCEPTION 'Maximum attempts reached';
  END IF;

  BEGIN
    INSERT INTO public.attempts (
      student_id, student_email, teacher_id, quiz_version_id,
      assignment_id, status, question_order
    ) VALUES (
      v_student_id, v_student_email, v_assignment.teacher_id,
      v_assignment.quiz_version_id, v_assignment.id, 'in_progress', '[]'::jsonb
    ) RETURNING * INTO v_created;
  EXCEPTION WHEN unique_violation THEN
    SELECT a.* INTO v_created
    FROM public.attempts a
    WHERE a.assignment_id = p_assignment_id
      AND a.student_id = v_student_id
      AND a.status = 'in_progress'
    LIMIT 1;
  END;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.roster_start_assignment_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_start_assignment_attempt(UUID) TO authenticated;
