-- Supabase-only live-room storage. Public question text is separated from
-- answer keys so room-code access never exposes correct answers.
CREATE TABLE IF NOT EXISTS public.roster_live_rooms (
  code TEXT PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('teacher_paced','student_paced','challenge','quick_question')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','ended')),
  current_index INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  revealed_current BOOLEAN NOT NULL DEFAULT false,
  open_join BOOLEAN NOT NULL DEFAULT false,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roster_live_room_keys (
  code TEXT PRIMARY KEY REFERENCES public.roster_live_rooms(code) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.roster_live_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES public.roster_live_rooms(code) ON DELETE CASCADE,
  student_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
  student_email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_code, student_id)
);

CREATE TABLE IF NOT EXISTS public.roster_live_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roster_live_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_live_room_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_live_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_live_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roster_live_room_read" ON public.roster_live_rooms FOR SELECT USING (
  teacher_id = public.current_profile_id() OR open_join OR EXISTS (
    SELECT 1 FROM public.roster_entries r
    WHERE r.teacher_id = roster_live_rooms.teacher_id
      AND lower(r.student_email) = public.current_profile_email()
  )
);
CREATE POLICY "roster_live_room_teacher_write" ON public.roster_live_rooms FOR ALL
  USING (teacher_id = public.current_profile_id())
  WITH CHECK (teacher_id = public.current_profile_id());
CREATE POLICY "roster_live_keys_teacher_only" ON public.roster_live_room_keys FOR ALL
  USING (teacher_id = public.current_profile_id())
  WITH CHECK (teacher_id = public.current_profile_id());
CREATE POLICY "roster_live_participant_teacher_update" ON public.roster_live_participants FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.roster_live_rooms r WHERE r.code = room_code AND r.teacher_id = public.current_profile_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.roster_live_rooms r WHERE r.code = room_code AND r.teacher_id = public.current_profile_id()));
CREATE POLICY "roster_live_reports_teacher_only" ON public.roster_live_reports FOR ALL
  USING (teacher_id = public.current_profile_id())
  WITH CHECK (teacher_id = public.current_profile_id());
CREATE POLICY "roster_live_participant_read" ON public.roster_live_participants FOR SELECT USING (
  student_id = public.current_profile_id() OR EXISTS (
    SELECT 1 FROM public.roster_live_rooms r
    WHERE r.code = roster_live_participants.room_code AND r.teacher_id = public.current_profile_id()
  )
);

CREATE OR REPLACE FUNCTION public.roster_get_my_live_participant(p_code TEXT, p_participant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE participant public.roster_live_participants; room_open BOOLEAN;
BEGIN
  SELECT * INTO participant FROM public.roster_live_participants
  WHERE id = p_participant AND room_code = upper(trim(p_code));
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

CREATE OR REPLACE FUNCTION public.roster_join_live_room(p_code TEXT, p_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.roster_live_rooms; profile UUID; email_value TEXT; participant public.roster_live_participants;
BEGIN
  SELECT * INTO r FROM public.roster_live_rooms WHERE code = upper(trim(p_code));
  IF NOT FOUND OR r.status = 'ended' THEN RAISE EXCEPTION 'Room not found or ended'; END IF;
  profile := public.current_profile_id();
  email_value := public.current_profile_email();
  IF NOT r.open_join AND (email_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roster_entries e WHERE e.teacher_id = r.teacher_id AND lower(e.student_email) = email_value
  )) THEN RAISE EXCEPTION 'Sign in with the email on your instructor roster to join this room'; END IF;
  IF profile IS NOT NULL THEN
    SELECT * INTO participant FROM public.roster_live_participants WHERE room_code = r.code AND student_id = profile;
  END IF;
  IF participant.id IS NULL THEN
    INSERT INTO public.roster_live_participants(room_code, student_id, student_email, display_name)
    VALUES (r.code, profile, coalesce(email_value, ''), left(trim(p_name), 80)) RETURNING * INTO participant;
    UPDATE public.roster_live_rooms SET participant_count = participant_count + 1, updated_at = now() WHERE code = r.code;
  END IF;
  RETURN jsonb_build_object('participantId', participant.id, 'studentName', participant.display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.roster_submit_live_answer(p_code TEXT, p_participant UUID, p_question INTEGER, p_response JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.roster_live_rooms; participant public.roster_live_participants; key_questions JSONB; new_responses JSONB;
BEGIN
  SELECT * INTO r FROM public.roster_live_rooms WHERE code = upper(trim(p_code));
  IF NOT FOUND OR r.status <> 'active' THEN RAISE EXCEPTION 'Room is not active'; END IF;
  SELECT * INTO participant FROM public.roster_live_participants WHERE id = p_participant AND room_code = r.code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not registered in this room'; END IF;
  IF participant.student_id IS NOT NULL AND participant.student_id <> public.current_profile_id() THEN RAISE EXCEPTION 'Participant identity does not match'; END IF;
  IF participant.student_id IS NULL AND NOT r.open_join THEN RAISE EXCEPTION 'Room does not allow name-only join'; END IF;
  SELECT questions INTO key_questions FROM public.roster_live_room_keys WHERE code = r.code;
  IF p_question < 0 OR p_question >= jsonb_array_length(key_questions) OR p_response IS NULL THEN RAISE EXCEPTION 'Invalid answer'; END IF;
  new_responses := participant.responses;
  IF new_responses ? p_question::TEXT THEN RETURN jsonb_build_object('locked', true); END IF;
  new_responses := jsonb_set(new_responses, ARRAY[p_question::TEXT], p_response, true);
  UPDATE public.roster_live_participants SET responses = new_responses WHERE id = participant.id;
  RETURN jsonb_build_object('locked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.roster_join_live_room(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roster_get_my_live_participant(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roster_submit_live_answer(TEXT, UUID, INTEGER, JSONB) TO anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_live_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_live_participants;
