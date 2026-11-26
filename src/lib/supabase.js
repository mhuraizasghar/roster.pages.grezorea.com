import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured =
  Boolean(url) &&
  Boolean(anonKey) &&
  !String(anonKey).includes('[YOUR-SUPABASE-ANON-KEY]');

export const supabase = isConfigured ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = isConfigured;
