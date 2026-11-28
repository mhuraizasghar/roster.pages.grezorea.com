-- Add optional teaching context to groups without changing membership.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
