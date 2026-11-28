-- Keep a student's earlier answers and score after they leave, but give a
-- later deliberate join a fresh participant row rather than resuming answers.
ALTER TABLE public.roster_live_participants
  DROP CONSTRAINT IF EXISTS roster_live_participants_room_code_student_id_key;

CREATE INDEX IF NOT EXISTS idx_roster_live_participants_active_student
  ON public.roster_live_participants (room_code, student_id)
  WHERE left_at IS NULL AND student_id IS NOT NULL;

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
