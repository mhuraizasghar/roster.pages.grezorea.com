-- Keep a student's earlier answers and score after they leave, but give a
-- later deliberate join a fresh participant row rather than resuming answers.
-- Include the leave column here as well so this migration can be run safely
-- even when the database has not yet received migration 004.
ALTER TABLE public.roster_live_participants
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_roster_live_participants_active_room
  ON public.roster_live_participants (room_code, joined_at)
  WHERE left_at IS NULL;

ALTER TABLE public.roster_live_participants
  DROP CONSTRAINT IF EXISTS roster_live_participants_room_code_student_id_key;

CREATE INDEX IF NOT EXISTS idx_roster_live_participants_active_student
  ON public.roster_live_participants (room_code, student_id)
  WHERE left_at IS NULL AND student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.roster_get_my_live_participant(p_code TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE participant_row public.roster_live_participants; room_open BOOLEAN;
BEGIN
  SELECT * INTO participant_row FROM public.roster_live_participants
  WHERE id = p_participant AND room_code = upper(trim(p_code)) AND left_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF participant_row.student_id IS NOT NULL AND participant_row.student_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'Participant identity does not match';
  END IF;
  IF participant_row.student_id IS NULL THEN
    SELECT r.open_join INTO room_open FROM public.roster_live_rooms r WHERE r.code = participant_row.room_code;
    IF NOT coalesce(room_open, false) THEN RAISE EXCEPTION 'Room does not allow name-only join'; END IF;
  END IF;
  RETURN to_jsonb(participant_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.roster_leave_live_room(p_code TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_row public.roster_live_rooms; participant_row public.roster_live_participants;
BEGIN
  SELECT * INTO room_row FROM public.roster_live_rooms
  WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  SELECT * INTO participant_row FROM public.roster_live_participants p
  WHERE p.id = p_participant AND p.room_code = room_row.code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not registered in this room'; END IF;
  IF participant_row.student_id IS NOT NULL AND participant_row.student_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'Participant identity does not match';
  END IF;
  IF participant_row.left_at IS NULL THEN
    UPDATE public.roster_live_participants SET left_at = now() WHERE id = participant_row.id;
    UPDATE public.roster_live_rooms
    SET participant_count = (
      SELECT count(*) FROM public.roster_live_participants p
      WHERE p.room_code = room_row.code AND p.left_at IS NULL
    ), updated_at = now()
    WHERE code = room_row.code;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.roster_submit_live_answer(p_code TEXT, p_participant UUID, p_question INTEGER, p_response JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  room_row public.roster_live_rooms;
  participant_row public.roster_live_participants;
  key_questions JSONB;
  new_responses JSONB;
  expected_question INTEGER;
BEGIN
  SELECT * INTO room_row FROM public.roster_live_rooms WHERE code = upper(trim(p_code));
  IF NOT FOUND OR room_row.status <> 'active' THEN RAISE EXCEPTION 'Room is not active'; END IF;
  SELECT * INTO participant_row FROM public.roster_live_participants p
  WHERE p.id = p_participant AND p.room_code = room_row.code AND p.left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not registered in this room'; END IF;
  IF participant_row.student_id IS NOT NULL AND participant_row.student_id <> public.current_profile_id() THEN RAISE EXCEPTION 'Participant identity does not match'; END IF;
  IF participant_row.student_id IS NULL AND NOT room_row.open_join THEN RAISE EXCEPTION 'Room does not allow name-only join'; END IF;
  SELECT k.questions INTO key_questions FROM public.roster_live_room_keys k WHERE k.code = room_row.code;
  IF p_question < 0 OR p_question >= jsonb_array_length(key_questions) OR p_response IS NULL THEN RAISE EXCEPTION 'Invalid answer'; END IF;
  new_responses := participant_row.responses;
  IF new_responses ? p_question::TEXT THEN RETURN jsonb_build_object('locked', true); END IF;
  IF room_row.mode = 'student_paced' THEN
    expected_question := 0;
    WHILE new_responses ? expected_question::TEXT LOOP expected_question := expected_question + 1; END LOOP;
  ELSE
    expected_question := room_row.current_index;
  END IF;
  IF p_question <> expected_question THEN RAISE EXCEPTION 'Answer the current question'; END IF;
  new_responses := jsonb_set(new_responses, ARRAY[p_question::TEXT], p_response, true);
  UPDATE public.roster_live_participants SET responses = new_responses WHERE id = participant_row.id;
  RETURN jsonb_build_object('locked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.roster_get_my_live_participant(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roster_leave_live_room(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roster_submit_live_answer(TEXT, UUID, INTEGER, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.roster_join_live_room(p_code TEXT, p_name TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  room_row public.roster_live_rooms;
  profile_id UUID;
  email_value TEXT;
  participant_row public.roster_live_participants;
BEGIN
  IF nullif(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Enter your name to join'; END IF;
  SELECT * INTO room_row FROM public.roster_live_rooms
  WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR room_row.status = 'ended' THEN RAISE EXCEPTION 'Room not found or ended'; END IF;

  profile_id := public.current_profile_id();
  email_value := public.current_profile_email();
  IF NOT room_row.open_join AND (email_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roster_entries r
    WHERE r.teacher_id = room_row.teacher_id AND lower(r.student_email) = email_value
  )) THEN
    RAISE EXCEPTION 'Sign in with the email on your instructor roster to join this room';
  END IF;

  IF profile_id IS NOT NULL THEN
    SELECT * INTO participant_row FROM public.roster_live_participants p
    WHERE p.room_code = room_row.code AND p.student_id = profile_id AND p.left_at IS NULL
    ORDER BY p.joined_at DESC LIMIT 1 FOR UPDATE;
  ELSIF p_participant IS NOT NULL THEN
    SELECT * INTO participant_row FROM public.roster_live_participants p
    WHERE p.room_code = room_row.code AND p.id = p_participant
      AND p.student_id IS NULL AND p.left_at IS NULL FOR UPDATE;
  END IF;

  IF participant_row.id IS NULL THEN
    INSERT INTO public.roster_live_participants(room_code, student_id, student_email, display_name)
    VALUES (room_row.code, profile_id, coalesce(email_value, ''), left(trim(p_name), 80))
    RETURNING * INTO participant_row;
    UPDATE public.roster_live_rooms
    SET participant_count = participant_count + 1, updated_at = now()
    WHERE code = room_row.code;
  ELSE
    UPDATE public.roster_live_participants
    SET display_name = left(trim(p_name), 80),
        student_email = coalesce(email_value, student_email)
    WHERE id = participant_row.id
    RETURNING * INTO participant_row;
  END IF;

  RETURN jsonb_build_object('participantId', participant_row.id, 'studentName', participant_row.display_name);
END;
$$;

REVOKE ALL ON FUNCTION public.roster_join_live_room(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_join_live_room(TEXT, TEXT, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
