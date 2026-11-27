import { supabase, isSupabaseConfigured } from './supabase';

const GOOGLE_AUTH_KEYS = ['googleAuthPortalRole', 'googleAuthNext', 'googleAuthInstitutionName', 'googleAuthStudentName'];

export async function beginGoogleSignIn({ portalRole, next, institutionName = '', studentName = '' }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Sign-in is temporarily unavailable. Please try again later.');
  }
  if (!['teacher', 'student'].includes(portalRole)) throw new Error('Choose a valid sign-in portal.');

  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : (portalRole === 'student' ? '/student' : '/teacher');

  sessionStorage.setItem('googleAuthPortalRole', portalRole);
  sessionStorage.setItem('googleAuthNext', safeNext);
  sessionStorage.setItem('googleAuthInstitutionName', String(institutionName || '').trim().slice(0, 120));
  sessionStorage.setItem('googleAuthStudentName', String(studentName || '').trim().slice(0, 80));

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
      scopes: 'openid email profile',
    },
  });

  if (error) {
    GOOGLE_AUTH_KEYS.forEach((key) => sessionStorage.removeItem(key));
    throw error;
  }
}
