-- Assignment visibility is scoped to the selected roster audience. Student
-- assignment/question access is derived from the verified profile email and
-- roster group membership rather than client supplied identifiers.
ALTER TABLE public.quiz_versions ADD COLUMN IF NOT EXISTS question_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_one_active_assignment
  ON public.attempts (student_id, assignment_id)
  WHERE assignment_id IS NOT NULL AND status = 'in_progress';

DROP POLICY IF EXISTS "attempts_student_own" ON public.attempts;
CREATE POLICY "attempts_student_read_own" ON public.attempts
  FOR SELECT USING (student_id = public.current_profile_id());

DROP POLICY IF EXISTS "answers_student_own" ON public.answers;
CREATE POLICY "answers_student_read_own" ON public.answers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.attempts a
    WHERE a.id = answers.attempt_id AND a.student_id = public.current_profile_id()
  ));

DROP POLICY IF EXISTS "assignments_student_rostered_read" ON public.assignments;
CREATE POLICY "assignments_student_targeted_read" ON public.assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roster_entries r
      WHERE r.teacher_id = assignments.teacher_id
        AND lower(r.student_email) = public.current_profile_email()
        AND (
          assignments.target_type = 'all_roster'
          OR (assignments.target_type = 'students' AND assignments.target_emails @> to_jsonb(ARRAY[public.current_profile_email()]))
          OR (assignments.target_type = 'groups' AND r.group_id IS NOT NULL AND assignments.target_group_ids @> to_jsonb(ARRAY[r.group_id::text]))
        )
    )
  );

DROP POLICY IF EXISTS "quiz_versions_student_assigned_read" ON public.quiz_versions;
CREATE POLICY "quiz_versions_student_assigned_read" ON public.quiz_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.quiz_version_id = quiz_versions.id
        AND EXISTS (
          SELECT 1 FROM public.roster_entries r
          WHERE r.teacher_id = a.teacher_id
            AND lower(r.student_email) = public.current_profile_email()
            AND (
              a.target_type = 'all_roster'
              OR (a.target_type = 'students' AND a.target_emails @> to_jsonb(ARRAY[public.current_profile_email()]))
              OR (a.target_type = 'groups' AND r.group_id IS NOT NULL AND a.target_group_ids @> to_jsonb(ARRAY[r.group_id::text]))
            )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_student_questions(p_quiz_version_id UUID, p_reveal BOOLEAN DEFAULT false)
RETURNS TABLE (
  id UUID,
  "position" INTEGER,
  type TEXT,
  prompt TEXT,
  options JSONB,
  points INTEGER,
  time_limit_sec INTEGER,
  image_url TEXT,
  correct_answer JSONB,
  explanation TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.position, q.type, q.prompt, q.options, q.points,
    q.time_limit_sec, q.image_url,
    CASE WHEN p_reveal AND EXISTS (
      SELECT 1 FROM public.attempts att
      JOIN public.assignments a ON a.id = att.assignment_id
      WHERE att.student_id = public.current_profile_id()
        AND att.quiz_version_id = p_quiz_version_id
        AND att.status IN ('submitted', 'late')
        AND coalesce((a.settings->>'showAnswersAfterSubmit')::boolean, false)
    ) THEN q.correct_answer ELSE NULL END,
    CASE WHEN p_reveal AND EXISTS (
      SELECT 1 FROM public.attempts att
      JOIN public.assignments a ON a.id = att.assignment_id
      WHERE att.student_id = public.current_profile_id()
        AND att.quiz_version_id = p_quiz_version_id
        AND att.status IN ('submitted', 'late')
        AND coalesce((a.settings->>'showAnswersAfterSubmit')::boolean, false)
    ) THEN q.explanation ELSE '' END
  FROM public.questions q
  WHERE q.quiz_version_id = p_quiz_version_id
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.quiz_version_id = q.quiz_version_id
        AND EXISTS (
          SELECT 1 FROM public.roster_entries r
          WHERE r.teacher_id = a.teacher_id AND lower(r.student_email) = public.current_profile_email()
            AND (a.target_type = 'all_roster'
              OR (a.target_type = 'students' AND a.target_emails @> to_jsonb(ARRAY[public.current_profile_email()]))
              OR (a.target_type = 'groups' AND r.group_id IS NOT NULL AND a.target_group_ids @> to_jsonb(ARRAY[r.group_id::text])))
        )
    )
  ORDER BY q.position;
$$;

REVOKE ALL ON FUNCTION public.get_student_questions(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_questions(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.roster_submit_assignment_attempt(p_attempt_id UUID, p_answers JSONB)
RETURNS TABLE (score NUMERIC, max_score NUMERIC, percent NUMERIC, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE att public.attempts; question public.questions; response_value JSONB;
  total NUMERIC := 0; earned NUMERIC := 0; correct BOOLEAN; answer_text TEXT; accepted JSONB; role_value TEXT;
BEGIN
  SELECT role INTO role_value FROM public.users_profile WHERE auth_uid = auth.uid();
  IF role_value <> 'student' THEN RAISE EXCEPTION 'Student session required'; END IF;
  SELECT * INTO att FROM public.attempts
  WHERE id = p_attempt_id AND student_id = public.current_profile_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found for this student'; END IF;
  IF att.status <> 'in_progress' THEN RAISE EXCEPTION 'This attempt was already submitted'; END IF;
  IF jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Invalid answer payload'; END IF;

  FOR question IN SELECT q.* FROM public.questions q
    WHERE q.quiz_version_id = att.quiz_version_id ORDER BY q.position
  LOOP
    total := total + question.points;
    response_value := p_answers -> question.id::TEXT;
    correct := false;
    IF response_value IS NOT NULL THEN
      IF question.type IN ('mcq', 'tf', 'challenge') THEN
        correct := response_value = question.correct_answer;
      ELSIF question.type = 'short_answer' THEN
        answer_text := lower(btrim(response_value #>> '{}'));
        accepted := coalesce(question.accepted_answers, '[]'::jsonb);
        correct := EXISTS (SELECT 1 FROM jsonb_array_elements_text(accepted) AS accepted_item(value) WHERE lower(btrim(accepted_item.value)) = answer_text)
          OR lower(btrim(question.correct_answer #>> '{}')) = answer_text;
      END IF;
      IF question.type IN ('mcq', 'challenge') AND jsonb_typeof(question.correct_answer) = 'array' THEN
        correct := jsonb_typeof(response_value) = 'array'
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(question.correct_answer) AS correct_item(value) WHERE NOT (response_value @> to_jsonb(correct_item.value)))
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(response_value) AS response_item(value) WHERE NOT (question.correct_answer @> to_jsonb(response_item.value)));
      END IF;
    END IF;
    IF correct THEN earned := earned + question.points; END IF;
    INSERT INTO public.answers(attempt_id, question_id, response, is_correct, awarded_points, answered_at)
      VALUES (att.id, question.id, response_value, correct, CASE WHEN correct THEN question.points ELSE 0 END, now())
      ON CONFLICT (attempt_id, question_id) DO UPDATE SET response = EXCLUDED.response,
        is_correct = EXCLUDED.is_correct, awarded_points = EXCLUDED.awarded_points, answered_at = now();
  END LOOP;

  UPDATE public.attempts SET score = earned, max_score = total,
    percent = CASE WHEN total > 0 THEN round((earned / total) * 100, 2) ELSE 0 END,
    status = CASE WHEN EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = att.assignment_id AND a.due_at IS NOT NULL AND now() > a.due_at) THEN 'late' ELSE 'submitted' END,
    submitted_at = now()
  WHERE id = att.id;
  RETURN QUERY SELECT a.score, a.max_score, a.percent, a.status FROM public.attempts a WHERE a.id = att.id;
END;
$$;

REVOKE ALL ON FUNCTION public.roster_submit_assignment_attempt(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_submit_assignment_attempt(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.roster_save_assignment_answer(p_attempt_id UUID, p_question_id UUID, p_response JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE att public.attempts; role_value TEXT;
BEGIN
  SELECT role INTO role_value FROM public.users_profile WHERE auth_uid = auth.uid();
  IF role_value <> 'student' THEN RAISE EXCEPTION 'Student session required'; END IF;
  IF octet_length(coalesce(p_response::text, '')) > 4000 THEN RAISE EXCEPTION 'Answer is too long'; END IF;
  SELECT * INTO att FROM public.attempts
  WHERE id = p_attempt_id AND student_id = public.current_profile_id() AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active attempt not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = p_question_id AND q.quiz_version_id = att.quiz_version_id) THEN
    RAISE EXCEPTION 'Question does not belong to this attempt';
  END IF;
  INSERT INTO public.answers(attempt_id, question_id, response, answered_at)
  VALUES (att.id, p_question_id, p_response, now())
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET response = EXCLUDED.response, answered_at = now();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.roster_save_assignment_answer(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_save_assignment_answer(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.roster_start_assignment_attempt(p_assignment_id UUID)
RETURNS public.attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student_id UUID; v_student_email TEXT; v_assignment public.assignments; v_existing public.attempts; v_created public.attempts; v_used_count INTEGER; v_max_attempts INTEGER; v_role TEXT;
BEGIN
  v_student_id := public.current_profile_id();
  v_student_email := public.current_profile_email();
  SELECT up.role INTO v_role FROM public.users_profile up WHERE up.auth_uid = auth.uid();
  IF v_student_id IS NULL OR v_student_email IS NULL OR v_role <> 'student' THEN RAISE EXCEPTION 'Verified student session required'; END IF;
  SELECT a.* INTO v_assignment FROM public.assignments a WHERE a.id = p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.roster_entries r WHERE r.teacher_id = v_assignment.teacher_id
      AND lower(r.student_email) = v_student_email
      AND (v_assignment.target_type = 'all_roster'
        OR (v_assignment.target_type = 'students' AND v_assignment.target_emails @> to_jsonb(ARRAY[v_student_email]))
        OR (v_assignment.target_type = 'groups' AND r.group_id IS NOT NULL AND v_assignment.target_group_ids @> to_jsonb(ARRAY[r.group_id::text])))
  ) THEN RAISE EXCEPTION 'Assignment is not available to this student'; END IF;
  SELECT a.* INTO v_existing FROM public.attempts a WHERE a.assignment_id = p_assignment_id AND a.student_id = v_student_id AND a.status = 'in_progress' LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;
  IF v_assignment.due_at IS NOT NULL AND now() > v_assignment.due_at THEN RAISE EXCEPTION 'Assignment due date has passed'; END IF;
  v_max_attempts := coalesce((v_assignment.settings->>'maxAttempts')::INTEGER, 1);
  SELECT count(*) INTO v_used_count FROM public.attempts a WHERE a.assignment_id = p_assignment_id AND a.student_id = v_student_id AND a.status <> 'in_progress';
  IF v_max_attempts <> 0 AND v_used_count >= v_max_attempts THEN RAISE EXCEPTION 'Maximum attempts reached'; END IF;
  BEGIN
    INSERT INTO public.attempts(student_id, student_email, teacher_id, quiz_version_id, assignment_id, status, question_order)
    VALUES (v_student_id, v_student_email, v_assignment.teacher_id, v_assignment.quiz_version_id, v_assignment.id, 'in_progress', '[]'::jsonb)
    RETURNING * INTO v_created;
  EXCEPTION WHEN unique_violation THEN
    SELECT a.* INTO v_created FROM public.attempts a WHERE a.assignment_id = p_assignment_id AND a.student_id = v_student_id AND a.status = 'in_progress' LIMIT 1;
  END;
  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.roster_start_assignment_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_start_assignment_attempt(UUID) TO authenticated;
