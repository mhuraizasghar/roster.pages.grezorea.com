import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();
  const handled = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const completeLogin = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError('Google sign-in is not configured.');
        return;
      }

      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fragmentAccessToken = fragment.get('access_token');

      let accessToken = fragmentAccessToken || '';
      if (!accessToken) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.access_token) {
          setError(sessionError?.message || 'Google sign-in could not be completed.');
          return;
        }
        accessToken = data.session.access_token;
      }

      if (!accessToken) {
        setError('Google sign-in could not be completed.');
        return;
      }

      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      const portalRole = sessionStorage.getItem('googleAuthPortalRole') === 'student' ? 'student' : 'teacher';
      const next = sessionStorage.getItem('googleAuthNext') || (portalRole === 'student' ? '/student' : '/teacher');
      const institutionName = sessionStorage.getItem('googleAuthInstitutionName') || '';

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
          institutionName,
          authProvider: 'google',
          emailVerified: true,
        };

        loginWithToken(accessToken, signedInUser);
        showToast(`Signed in as ${signedInUser.displayName}`);
        sessionStorage.removeItem('googleAuthNext');
        sessionStorage.removeItem('googleAuthInstitutionName');
        navigate(next.startsWith('/') ? next : `/${portalRole}`, { replace: true });
      } catch (err) {
        setError(err.message || 'Google sign-in could not be completed.');
      }
    };

    completeLogin();
  }, [loginWithToken, navigate, showToast, searchParams]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="eval-card p-6 space-y-3">
        <h1 className="text-lg font-semibold">Completing Google sign-in</h1>
        {error ? (
          <>
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" className="eval-btn-secondary text-xs" onClick={() => navigate(-1)}>
              Go back
            </button>
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>Please wait...</p>
        )}
      </div>
    </div>
  );
}
