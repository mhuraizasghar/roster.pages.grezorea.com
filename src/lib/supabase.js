import { createClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
export const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  .trim()
  .replace(/^\[(.*)\]$/, '$1')
  .replace(/^['"]|['"]$/g, '');

const isConfigured =
  Boolean(url) &&
  Boolean(anonKey) &&
  !anonKey.includes('[YOUR-SUPABASE-ANON-KEY]') &&
  anonKey.length > 20;

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
    })
  : null;
export const isSupabaseConfigured = isConfigured;
