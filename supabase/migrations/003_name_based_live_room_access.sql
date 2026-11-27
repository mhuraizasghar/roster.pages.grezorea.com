-- Room codes are the invitation for live classrooms. Students may join by
-- display name without signing in or being pre-added to an email roster.
ALTER TABLE public.roster_live_rooms
  ALTER COLUMN open_join SET DEFAULT true;

UPDATE public.roster_live_rooms
SET open_join = true
WHERE status IN ('lobby', 'active') AND open_join = false;
