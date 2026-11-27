-- Preserve submissions and reports after a student leaves, while removing
-- that participant from the live attendance count.
ALTER TABLE public.roster_live_participants
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_roster_live_participants_active_room
  ON public.roster_live_participants (room_code, joined_at)
  WHERE left_at IS NULL;

ALTER TABLE public.roster_live_rooms
  ALTER COLUMN open_join SET DEFAULT true;

UPDATE public.roster_live_rooms
SET open_join = true
WHERE status IN ('lobby', 'active') AND open_join = false;

CREATE OR REPLACE FUNCTION public.roster_get_my_live_participant(p_code TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE participant public.roster_live_participants; room_open BOOLEAN;
BEGIN
  SELECT * INTO participant FROM public.roster_live_participants
  WHERE id = p_participant AND room_code = upper(trim(p_code)) AND left_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF participant.student_id IS NOT NULL AND participant.student_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'Participant identity does not match';
  END IF;
  IF participant.student_id IS NULL THEN
    SELECT open_join INTO room_open FROM public.roster_live_rooms WHERE code = participant.room_code;
    IF NOT coalesce(room_open, false) THEN RAISE EXCEPTION 'Room does not allow name-only join'; END IF;
  END IF;
  RETURN to_jsonb(participant);
END;
$$;

DROP FUNCTION IF EXISTS public.roster_join_live_room(TEXT, TEXT);
CREATE FUNCTION public.roster_join_live_room(p_code TEXT, p_name TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.roster_live_rooms; profile UUID; email_value TEXT; participant public.roster_live_participants; was_left BOOLEAN;
BEGIN
  IF nullif(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Enter your name to join'; END IF;
  SELECT * INTO r FROM public.roster_live_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR r.status = 'ended' THEN RAISE EXCEPTION 'Room not found or ended'; END IF;
  profile := public.current_profile_id();
  email_value := public.current_profile_email();
  IF NOT r.open_join AND (email_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roster_entries e WHERE e.teacher_id = r.teacher_id AND lower(e.student_email) = email_value
  )) THEN RAISE EXCEPTION 'Sign in with the email on your instructor roster to join this room'; END IF;

  IF profile IS NOT NULL THEN
    SELECT * INTO participant FROM public.roster_live_participants WHERE room_code = r.code AND student_id = profile FOR UPDATE;
  ELSE
    SELECT * INTO participant FROM public.roster_live_participants
    WHERE room_code = r.code AND id = p_participant AND student_id IS NULL FOR UPDATE;
  END IF;

  IF participant.id IS NULL THEN
    INSERT INTO public.roster_live_participants(room_code, student_id, student_email, display_name)
    VALUES (r.code, profile, coalesce(email_value, ''), left(trim(p_name), 80)) RETURNING * INTO participant;
    UPDATE public.roster_live_rooms SET participant_count = participant_count + 1, updated_at = now() WHERE code = r.code;
  ELSE
    was_left := participant.left_at IS NOT NULL;
    UPDATE public.roster_live_participants
    SET display_name = left(trim(p_name), 80), student_email = coalesce(email_value, student_email), left_at = NULL
    WHERE id = participant.id RETURNING * INTO participant;
    IF was_left THEN
      UPDATE public.roster_live_rooms SET participant_count = participant_count + 1, updated_at = now() WHERE code = r.code;
    END IF;
  END IF;
  RETURN jsonb_build_object('participantId', participant.id, 'studentName', participant.display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.roster_leave_live_room(p_code TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.roster_live_rooms; participant public.roster_live_participants;
BEGIN
  SELECT * INTO r FROM public.roster_live_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  SELECT * INTO participant FROM public.roster_live_participants
  WHERE id = p_participant AND room_code = r.code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not registered in this room'; END IF;
  IF participant.student_id IS NOT NULL AND participant.student_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'Participant identity does not match';
  END IF;
  IF participant.left_at IS NULL THEN
    UPDATE public.roster_live_participants SET left_at = now() WHERE id = participant.id;
    UPDATE public.roster_live_rooms
    SET participant_count = (SELECT count(*) FROM public.roster_live_participants WHERE room_code = r.code AND left_at IS NULL), updated_at = now()
    WHERE code = r.code;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.roster_submit_live_answer(p_code TEXT, p_participant UUID, p_question INTEGER, p_response JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.roster_live_rooms; participant public.roster_live_participants; key_questions JSONB; new_responses JSONB; expected_question INTEGER;
BEGIN
  SELECT * INTO r FROM public.roster_live_rooms WHERE code = upper(trim(p_code));
  IF NOT FOUND OR r.status <> 'active' THEN RAISE EXCEPTION 'Room is not active'; END IF;
  SELECT * INTO participant FROM public.roster_live_participants
  WHERE id = p_participant AND room_code = r.code AND left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not registered in this room'; END IF;
  IF participant.student_id IS NOT NULL AND participant.student_id <> public.current_profile_id() THEN RAISE EXCEPTION 'Participant identity does not match'; END IF;
  IF participant.student_id IS NULL AND NOT r.open_join THEN RAISE EXCEPTION 'Room does not allow name-only join'; END IF;
  SELECT questions INTO key_questions FROM public.roster_live_room_keys WHERE code = r.code;
  IF p_question < 0 OR p_question >= jsonb_array_length(key_questions) OR p_response IS NULL THEN RAISE EXCEPTION 'Invalid answer'; END IF;
  new_responses := participant.responses;
  IF new_responses ? p_question::TEXT THEN RETURN jsonb_build_object('locked', true); END IF;
  IF r.mode = 'student_paced' THEN
    expected_question := 0;
    WHILE new_responses ? expected_question::TEXT LOOP expected_question := expected_question + 1; END LOOP;
  ELSE
    expected_question := r.current_index;
  END IF;
  IF p_question <> expected_question THEN RAISE EXCEPTION 'Answer the current question'; END IF;
  new_responses := jsonb_set(new_responses, ARRAY[p_question::TEXT], p_response, true);
  UPDATE public.roster_live_participants SET responses = new_responses WHERE id = participant.id;
  RETURN jsonb_build_object('locked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.roster_join_live_room(TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roster_leave_live_room(TEXT, UUID) TO anon, authenticated;
