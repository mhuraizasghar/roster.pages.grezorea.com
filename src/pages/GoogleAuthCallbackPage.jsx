import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
        const res = await api.post('/api/auth/google/token', {
          accessToken,
          portalRole,
          institutionName,
        });
        loginWithToken(res.token, res.user);
        showToast(`Signed in as ${res.user.displayName}`);
        sessionStorage.removeItem('googleAuthPortalRole');
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
