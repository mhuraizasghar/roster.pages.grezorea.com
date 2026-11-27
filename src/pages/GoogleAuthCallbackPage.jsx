import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { supabase, anonKey, isSupabaseConfigured } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const returnToPortal = (message) => {
      const portalRole = sessionStorage.getItem('googleAuthPortalRole') === 'student' ? 'student' : 'teacher';
      ['googleAuthPortalRole', 'googleAuthNext', 'googleAuthInstitutionName', 'googleAuthStudentName'].forEach((key) => sessionStorage.removeItem(key));
      const loginPath = portalRole === 'student' ? '/student/login' : '/teacher/login';
      const rawMessage = String(message || 'Google sign-in failed.');
      const safeMessage = /failed to fetch|not configured|could not reach|schema|polic|server settings|auth function|supabase|sign-in service/i.test(rawMessage)
        ? 'Sign-in is temporarily unavailable. Please try again in a moment. If the problem continues, contact your instructor.'
        : rawMessage;
      navigate(`${loginPath}?google_error=${encodeURIComponent(safeMessage.slice(0, 240))}`, { replace: true });
    };

    const completeLogin = async () => {
      const providerError = searchParams.get('error_description') || searchParams.get('error');
      if (providerError) {
        returnToPortal(providerError);
        return;
      }
      if (!isSupabaseConfigured || !supabase) {
        returnToPortal('Sign-in is temporarily unavailable. Please try again later.');
        return;
      }

      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fragmentAccessToken = fragment.get('access_token');

      let savedSession = null;
      try {
        const { data } = await supabase.auth.getSession();
        savedSession = data?.session || null;
      } catch {
        // The callback fragment can still carry a valid Supabase access token;
        // the server exchange below verifies it before creating a Roster session.
      }
      const accessToken = fragmentAccessToken || savedSession?.access_token || '';

      if (!accessToken) {
        returnToPortal('Google did not return a sign-in session. Please try again.');
        return;
      }

      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      const portalRole = sessionStorage.getItem('googleAuthPortalRole') === 'student' ? 'student' : 'teacher';
      const next = sessionStorage.getItem('googleAuthNext') || (portalRole === 'student' ? '/student' : '/teacher');
      const institutionName = sessionStorage.getItem('googleAuthInstitutionName') || '';
      const studentName = sessionStorage.getItem('googleAuthStudentName') || '';

      try {
        // Validate the Supabase token and create the Roster session in one
        // same-origin server request; do not depend on a browser fetch to Supabase.
        const session = await api.post('/api/auth/google/token', {
          accessToken,
          anonKey,
          portalRole,
          institutionName,
        });
        if (!session?.token || !session?.user?.email) throw new Error('Sign-in could not be completed. Please try again.');
        loginWithToken(session.token, session.user);
        if (studentName) {
          try { localStorage.setItem('roster.live.studentName', studentName); } catch {}
        }
        showToast(`Signed in as ${session.user.displayName}`);
        sessionStorage.removeItem('googleAuthPortalRole');
        sessionStorage.removeItem('googleAuthNext');
        sessionStorage.removeItem('googleAuthInstitutionName');
        sessionStorage.removeItem('googleAuthStudentName');
        navigate(next.startsWith('/') && !next.startsWith('//') ? next : `/${portalRole}`, { replace: true });
      } catch (err) {
        console.error('Google sign-in exchange failed:', err?.message || 'Unknown error');
        returnToPortal(err.message || 'Google sign-in could not be completed.');
      }
    };

    completeLogin().catch((err) => {
      console.error('Google sign-in callback failed:', err?.message || 'Unknown error');
      returnToPortal(err?.message || 'Google sign-in could not be completed.');
    });
  }, [loginWithToken, navigate, showToast, searchParams]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="eval-card p-6 space-y-3">
        <h1 className="text-lg font-semibold">Completing Google sign-in</h1>
        <p className="inline-flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--eval-muted)' }}>
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Verifying your Google account...
        </p>
      </div>
    </div>
  );
}
