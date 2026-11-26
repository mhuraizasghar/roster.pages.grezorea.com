-- =============================================================================
-- EVAL Platform — Supabase PostgreSQL Schema, RLS Policies & Server RPCs
-- Target: db.zimpzoakuxacjwikfnyk.supabase.co
-- Logically separated into:
--   1. Identity & Roster Management
--   2. Quiz Library Storage (Subjects, Nested Folders, Quizzes, Immutable Versions)
--   3. Operational Storage (Assignments, Live Rooms, Attempts, Answers, Rate Limits)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. IDENTITY & ROSTER MANAGEMENT
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  display_name TEXT NOT NULL,
  institution_name TEXT DEFAULT '',
  auth_provider TEXT NOT NULL DEFAULT 'email',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_profile_email ON public.users_profile (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_profile_role ON public.users_profile (role);

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, name)
);

CREATE TABLE IF NOT EXISTS public.roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  student_user_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roster_teacher_email_unique UNIQUE (teacher_id, student_email)
);

CREATE INDEX IF NOT EXISTS idx_roster_email ON public.roster_entries (lower(student_email));
CREATE INDEX IF NOT EXISTS idx_roster_teacher ON public.roster_entries (teacher_id);

-- -----------------------------------------------------------------------------
-- 2. QUIZ LIBRARY STORAGE (Private to owning teacher; mutable drafts)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_subject BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_owner_parent ON public.folders (owner_id, parent_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  current_version_id UUID,
  draft_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{"passMark":50,"shuffleOptions":false}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON public.quizzes (owner_id) WHERE deleted_at IS NULL;

-- Immutable Quiz Snapshots (created when launching a live room or assigning)
CREATE TABLE IF NOT EXISTS public.quiz_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_version_id UUID NOT NULL REFERENCES public.quiz_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'tf', 'short_answer', 'challenge')),
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer JSONB NOT NULL,
  accepted_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  match_options JSONB NOT NULL DEFAULT '{"caseSensitive":false,"ignoreSpaces":true,"allowMinorSpelling":true}'::jsonb,
  points INTEGER NOT NULL DEFAULT 1,
  time_limit_sec INTEGER DEFAULT 20,
  explanation TEXT DEFAULT '',
  image_url TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_questions_version ON public.questions (quiz_version_id, position);

-- -----------------------------------------------------------------------------
-- 3. OPERATIONAL STORAGE (Assignments, Live Rooms, Attempts, Answers)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  quiz_version_id UUID NOT NULL REFERENCES public.quiz_versions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('students', 'groups', 'all_roster')),
  target_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{"timeLimitMin":0,"maxAttempts":1,"showAnswersAfterSubmit":true,"shuffleQuestions":false,"allowSaveProgress":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_overrides (
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  extended_due_at TIMESTAMPTZ,
  extra_attempts INTEGER NOT NULL DEFAULT 0,
  reopened BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (assignment_id, student_email)
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  quiz_version_id UUID REFERENCES public.quiz_versions(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('teacher_paced', 'student_paced', 'challenge', 'quick_question')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'ended')),
  current_question_idx INTEGER NOT NULL DEFAULT 0,
  revealed_current BOOLEAN NOT NULL DEFAULT false,
  open_join BOOLEAN NOT NULL DEFAULT false,
  question_started_at TIMESTAMPTZ,
  quick_question_payload JSONB,
  settings JSONB NOT NULL DEFAULT '{"showFeedbackImmediately":false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rooms_teacher_status ON public.rooms (teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms (upper(code));

CREATE TABLE IF NOT EXISTS public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  total_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  teacher_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  quiz_version_id UUID REFERENCES public.quiz_versions(id) ON DELETE RESTRICT,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'late')),
  question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  percent NUMERIC(5, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_attempts_student ON public.attempts (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_assignment ON public.attempts (assignment_id);
CREATE INDEX IF NOT EXISTS idx_attempts_room ON public.attempts (room_id);

CREATE TABLE IF NOT EXISTS public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  response JSONB,
  is_correct BOOLEAN,
  awarded_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  graded_by TEXT NOT NULL DEFAULT 'auto' CHECK (graded_by IN ('auto', 'teacher')),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) & ANSWER PROTECTION
-- -----------------------------------------------------------------------------

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- Helper: current authenticated user profile id & role
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.users_profile WHERE auth_uid = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_email() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT lower(email) FROM public.users_profile WHERE auth_uid = auth.uid() LIMIT 1;
$$;

-- Profiles: users can view/update their own profile
CREATE POLICY "profiles_self_read" ON public.users_profile
  FOR SELECT USING (auth_uid = auth.uid());

-- Teachers manage their own library & rosters
CREATE POLICY "groups_teacher_all" ON public.groups
  FOR ALL USING (teacher_id = public.current_profile_id());

CREATE POLICY "roster_teacher_all" ON public.roster_entries
  FOR ALL USING (teacher_id = public.current_profile_id());

CREATE POLICY "roster_student_read_own" ON public.roster_entries
  FOR SELECT USING (lower(student_email) = public.current_profile_email());

CREATE POLICY "folders_teacher_all" ON public.folders
  FOR ALL USING (owner_id = public.current_profile_id());

CREATE POLICY "quizzes_teacher_all" ON public.quizzes
  FOR ALL USING (owner_id = public.current_profile_id());

CREATE POLICY "quiz_versions_teacher_all" ON public.quiz_versions
  FOR ALL USING (owner_id = public.current_profile_id());

-- Questions: ONLY teachers owning the quiz_version can directly select raw columns (including correct_answer).
-- Students MUST use public.get_student_questions(...) RPC which strips answers until permitted!
CREATE POLICY "questions_teacher_all" ON public.questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.quiz_versions qv
      WHERE qv.id = quiz_version_id AND qv.owner_id = public.current_profile_id()
    )
  );

CREATE POLICY "assignments_teacher_all" ON public.assignments
  FOR ALL USING (teacher_id = public.current_profile_id());

CREATE POLICY "assignments_student_rostered_read" ON public.assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roster_entries r
      WHERE r.teacher_id = assignments.teacher_id
        AND lower(r.student_email) = public.current_profile_email()
    )
  );

CREATE POLICY "rooms_teacher_all" ON public.rooms
  FOR ALL USING (teacher_id = public.current_profile_id());

CREATE POLICY "rooms_student_rostered_read" ON public.rooms
  FOR SELECT USING (
    open_join = true OR EXISTS (
      SELECT 1 FROM public.roster_entries r
      WHERE r.teacher_id = rooms.teacher_id
        AND lower(r.student_email) = public.current_profile_email()
    )
  );

CREATE POLICY "attempts_student_own" ON public.attempts
  FOR ALL USING (student_id = public.current_profile_id());

CREATE POLICY "attempts_teacher_read" ON public.attempts
  FOR SELECT USING (teacher_id = public.current_profile_id());

CREATE POLICY "answers_student_own" ON public.answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.attempts a
      WHERE a.id = attempt_id AND a.student_id = public.current_profile_id()
    )
  );

CREATE POLICY "answers_teacher_all" ON public.answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.attempts a
      WHERE a.id = attempt_id AND a.teacher_id = public.current_profile_id()
    )
  );

-- Safe Student Question RPC (never leaks correct_answer or accepted_answers prior to reveal/submit)
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
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    q.id,
    q.position,
    q.type,
    q.prompt,
    q.options,
    q.points,
    q.time_limit_sec,
    q.image_url,
    CASE WHEN p_reveal THEN q.correct_answer ELSE NULL END AS correct_answer,
    CASE WHEN p_reveal THEN q.explanation ELSE '' END AS explanation
  FROM public.questions q
  WHERE q.quiz_version_id = p_quiz_version_id
  ORDER BY q.position ASC;
$$;

-- Enable Supabase Realtime for live classroom tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;
