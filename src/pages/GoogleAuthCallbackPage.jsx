import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
      navigate(`${loginPath}?google_error=${encodeURIComponent(String(message || 'Google sign-in failed.').slice(0, 240))}`, { replace: true });
    };

    const completeLogin = async () => {
      const providerError = searchParams.get('error_description') || searchParams.get('error');
      if (providerError) {
        returnToPortal(providerError);
        return;
      }
      if (!isSupabaseConfigured || !supabase) {
        returnToPortal('Supabase is not configured for this deployment. Ask the administrator to check its public URL and anon key.');
        return;
      }

      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fragmentAccessToken = fragment.get('access_token');

      let accessToken = fragmentAccessToken || '';
      if (!accessToken) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.access_token) {
          returnToPortal(sessionError?.message || 'Google sign-in could not be completed. Please try again.');
          return;
        }
        accessToken = data.session.access_token;
      }

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
        const { data, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !data?.user?.email) {
          throw new Error(userError?.message || 'Google sign-in could not be verified.');
        }

        const email = String(data.user.email).trim().toLowerCase();
        const emailVerified = Boolean(data.user.email_confirmed_at || data.user.user_metadata?.email_verified);
        if (!emailVerified) {
          throw new Error('Google account email must be verified.');
        }

        const signedInUser = {
          id: `google_${data.user.id.slice(0, 12)}`,
          email,
          role: portalRole,
          displayName: String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || email.split('@')[0]).trim().slice(0, 80),
          avatarUrl: String(data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture || '').trim(),
          institutionName,
          authProvider: 'google',
          emailVerified: true,
        };

        // The Supabase access token rotates. Exchange it for Roster's signed,
        // longer lived session so /api/auth/me can restore identity on reload.
        const session = await api.post('/api/auth/google/token', {
          accessToken,
          portalRole,
          institutionName,
        });
        loginWithToken(session.token, { ...signedInUser, ...session.user, avatarUrl: signedInUser.avatarUrl });
        if (studentName) {
          try { localStorage.setItem('roster.live.studentName', studentName); } catch {}
        }
        showToast(`Signed in as ${signedInUser.displayName}`);
        sessionStorage.removeItem('googleAuthPortalRole');
        sessionStorage.removeItem('googleAuthNext');
        sessionStorage.removeItem('googleAuthInstitutionName');
        sessionStorage.removeItem('googleAuthStudentName');
        navigate(next.startsWith('/') && !next.startsWith('//') ? next : `/${portalRole}`, { replace: true });
      } catch (err) {
        const message = err.message === 'Failed to fetch'
          ? 'Roster could not reach its sign-in service. Check the Vercel auth function and Supabase server settings, then try again.'
          : (err.message || 'Google sign-in could not be completed.');
        returnToPortal(message);
      }
    };

    completeLogin().catch((err) => {
      const message = err?.message === 'Failed to fetch'
        ? 'Roster could not reach its sign-in service. Check the Vercel auth function and Supabase server settings, then try again.'
        : (err?.message || 'Google sign-in could not be completed.');
      returnToPortal(message);
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
