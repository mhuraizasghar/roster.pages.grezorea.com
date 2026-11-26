import React, { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function GoogleBrandIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export default function StudentLoginPage() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const emailInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const nextPath = searchParams.get('next');
  const safeNext = nextPath && nextPath.startsWith('/') ? nextPath : '/student';

  const { user, loginWithToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleApiError = (err) => {
    if (err instanceof ApiError && err.errorCode === 'WRONG_PORTAL') {
      setErrorInfo({
        message: err.message,
        redirectPath: err.redirectPath || '/teacher/login',
        redirectLabel: 'Go to Teacher Portal',
      });
    } else {
      setErrorInfo({ message: err.message || 'Could not sign in.' });
    }
  };

  const handleGoogleStudent = async () => {
    setErrorInfo(null);
    if (!isSupabaseConfigured || !supabase) {
      setErrorInfo({ message: 'Google sign-in is not configured.' });
      return;
    }

    setBusy(true);
    try {
      sessionStorage.setItem('googleAuthPortalRole', 'student');
      sessionStorage.setItem('googleAuthNext', safeNext);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setErrorInfo({ message: err.message || 'Could not start Google sign-in.' });
      setBusy(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Email sign-in is not configured.');
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
      showToast('One-time verification code sent to your email.', 'info');
    } catch (err) {
      setErrorInfo({ message: err.message || 'Could not send verification code.' });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Email sign-in is not configured.');
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: otpCode.trim(),
        type: 'email',
      });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error('Verification session could not be created.');

      const studentUser = {
        id: `s_${data.user.id.slice(0, 10)}`,
        email: String(data.user.email || cleanEmail).trim().toLowerCase(),
        role: 'student',
        displayName: displayName.trim() || String(data.user.email || cleanEmail).split('@')[0],
        institutionName: '',
        authProvider: 'email',
        emailVerified: Boolean(data.user.email_confirmed_at),
      };
      loginWithToken(data.session.access_token, studentUser);
      showToast(`Signed in as ${studentUser.displayName}`);
      navigate(safeNext);
    } catch (err) {
      setErrorInfo({ message: err.message || 'Could not verify the code.' });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16 space-y-4">
      <div className="eval-card p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
            Student Portal
          </div>
          <h1 className="text-2xl font-semibold">Student Sign In</h1>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            Access is granted by invitation through your instructor&apos;s roster. Sign in with the verified email your instructor added.
          </p>
        </div>


        {errorInfo && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border text-xs space-y-2"
            style={{
              backgroundColor: 'var(--status-fail-soft)',
              borderColor: 'var(--status-fail)',
              color: 'var(--eval-ink)',
            }}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>{errorInfo.message}</span>
            </div>
            {errorInfo.redirectPath && (
              <Link
                to={errorInfo.redirectPath}
                className="inline-flex items-center gap-1 font-semibold underline"
                style={{ color: 'var(--eval-accent)' }}
              >
                {errorInfo.redirectLabel} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* Primary Google Sign-In */}
        {!otpSent && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleStudent}
              className="eval-btn-secondary w-full py-2.5"
            >
              <GoogleBrandIcon />
              Continue with Google
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t" style={{ borderColor: 'var(--eval-border)' }} />
              <span className="px-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--eval-muted)' }}>
                or one-time code
              </span>
              <div className="flex-grow border-t" style={{ borderColor: 'var(--eval-border)' }} />
            </div>
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleRequestOtp} className="space-y-3.5">
            <div>
              <label htmlFor="stuEmail" className="block text-xs font-medium mb-1">
                Rostered Email Address
              </label>
              <input
                ref={emailInputRef}
                id="stuEmail"
                type="email"
                className="eval-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                required
              />
            </div>
            <button type="submit" disabled={busy} className="eval-btn-primary w-full">
              <Mail className="w-4 h-4" strokeWidth={1.75} />
              Send One-Time Code
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-3.5">
            <div
              className="p-3 rounded-lg border text-xs space-y-1"
              style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
            >
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                Verification code dispatched
              </div>
              <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>
                Enter the 6-digit code sent to <strong style={{ color: 'var(--eval-ink)' }}>{email}</strong>.
              </div>
            </div>

            <div>
              <label htmlFor="otpInput" className="block text-xs font-medium mb-1">
                6-Digit Verification Code
              </label>
              <input
                id="otpInput"
                className="eval-input font-mono tracking-widest text-center text-base"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                maxLength={6}
                required
              />
            </div>

            <div>
              <label htmlFor="stuDisplayName" className="block text-xs font-medium mb-1">
                Display Name <span style={{ color: 'var(--eval-muted)' }}>(optional on first login)</span>
              </label>
              <input
                id="stuDisplayName"
                className="eval-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <button type="submit" disabled={busy} className="eval-btn-primary w-full">
              <KeyRound className="w-4 h-4" strokeWidth={1.75} />
              Verify &amp; Continue
            </button>
            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtpCode(''); setErrorInfo(null); }}
              className="eval-btn-ghost w-full text-xs"
            >
              Use a different email
            </button>
          </form>
        )}


        <div className="pt-3 border-t text-center text-xs" style={{ borderColor: 'var(--eval-border)', color: 'var(--eval-muted)' }}>
          Are you an instructor?{' '}
          <Link to="/teacher/login" className="font-semibold underline" style={{ color: 'var(--eval-accent)' }}>
            Enter Teacher Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
