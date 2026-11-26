import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, KeyRound, Mail, AlertCircle } from 'lucide-react';
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

export default function TeacherAuthPage({ initialMode = 'login' }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const verifyParam = searchParams.get('verify');
  const resetParam = searchParams.get('token');

  const modeFromPath = location.pathname.includes('signup')
    ? 'signup'
    : location.pathname.includes('reset') || resetParam
      ? 'reset'
      : initialMode;

  const [mode, setMode] = useState(modeFromPath);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [verifyToken, setVerifyToken] = useState(verifyParam || '');
  const [resetToken, setResetToken] = useState(resetParam || '');
  const [newPassword, setNewPassword] = useState('');
  const [pendingVerify, setPendingVerify] = useState(Boolean(verifyParam));
  const [pendingResetConfirm, setPendingResetConfirm] = useState(Boolean(resetParam));
  const [needsVerificationEmail, setNeedsVerificationEmail] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const { loginWithToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Auto-confirm email verification when landing from email confirmation link (?verify=...)
  useEffect(() => {
    if (!verifyParam) return;
    let active = true;
    (async () => {
      setBusy(true);
      try {
        const res = await api.post('/api/auth/teacher/verify-email', { token: verifyParam });
        if (!active) return;
        loginWithToken(res.token, res.user);
        showToast('Email verified. Welcome to Roster.');
        navigate('/teacher', { replace: true });
      } catch (err) {
        if (!active) return;
        setPendingVerify(true);
        setVerifyToken(verifyParam);
        setErrorInfo({ message: err.message || 'Verification link is invalid or expired.' });
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [verifyParam, loginWithToken, navigate, showToast]);

  const handleApiError = (err) => {
    if (err instanceof ApiError && err.errorCode === 'WRONG_PORTAL') {
      setErrorInfo({
        message: err.message,
        redirectPath: err.redirectPath || '/student/login',
        redirectLabel: 'Go to Student Portal',
      });
    } else {
      if (err instanceof ApiError && err.errorCode === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerificationEmail(true);
      }
      setErrorInfo({ message: err.message || 'Authentication failed.' });
    }
  };

  const handleGoogleTeacher = async () => {
    setErrorInfo(null);
    if (!isSupabaseConfigured || !supabase) {
      setErrorInfo({ message: 'Google sign-in is not configured.' });
      return;
    }

    setBusy(true);
    try {
      sessionStorage.setItem('googleAuthPortalRole', 'teacher');
      sessionStorage.setItem('googleAuthInstitutionName', institutionName.trim());
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

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setNeedsVerificationEmail(false);
    setBusy(true);
    try {
      const res = await api.post('/api/auth/teacher/login', { email, password });
      loginWithToken(res.token, res.user);
      showToast(`Signed in as ${res.user.displayName}`);
      navigate('/teacher');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      const res = await api.post('/api/auth/teacher/signup', {
        email,
        password,
        displayName,
        institutionName,
      });
      if (res.devVerificationToken) setVerifyToken(res.devVerificationToken);
      setPendingVerify(true);
      showToast(res.emailSent ? `Confirmation email sent to ${email}.` : 'Account created. Confirm verification to continue.', 'info');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      const res = await api.post('/api/auth/teacher/verify-email', { token: verifyToken });
      loginWithToken(res.token, res.user);
      showToast('Email verified.');
      navigate('/teacher');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await api.post('/api/auth/teacher/resend-verification', { email });
      if (res.devVerificationToken) setVerifyToken(res.devVerificationToken);
      setPendingVerify(true);
      setErrorInfo(null);
      showToast(res.message || 'Verification email sent.', 'info');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      const res = await api.post('/api/auth/teacher/reset-password/request', { email });
      if (res.devResetToken) setResetToken(res.devResetToken);
      setPendingResetConfirm(true);
      showToast(res.emailSent ? 'Password recovery email sent.' : 'Password reset instructions issued.', 'info');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResetConfirm = async (e) => {
    e.preventDefault();
    setErrorInfo(null);
    setBusy(true);
    try {
      await api.post('/api/auth/teacher/reset-password/confirm', { token: resetToken, newPassword });
      showToast('Password updated. You can now sign in.');
      setPendingResetConfirm(false);
      setMode('login');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="eval-card p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
            Instructor Portal
          </div>
          <h1 className="text-2xl font-semibold">
            {mode === 'signup'
              ? 'Create Teacher Account'
              : mode === 'reset'
                ? 'Reset Password'
                : 'Teacher Sign In'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
            Author assessments, manage verified student rosters, and direct live sessions.
          </p>
        </div>

        {/* Mode Switcher */}
        <div
          className="grid grid-cols-2 p-1 rounded-lg border text-xs font-medium"
          style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
        >
          <button
            type="button"
            onClick={() => { setMode('login'); setPendingVerify(false); setErrorInfo(null); }}
            className="py-2 rounded-md transition-colors"
            style={mode === 'login' ? { backgroundColor: 'var(--eval-surface)', color: 'var(--eval-ink)', boxShadow: 'var(--eval-shadow-sm)' } : { color: 'var(--eval-muted)' }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setPendingVerify(false); setErrorInfo(null); }}
            className="py-2 rounded-md transition-colors"
            style={mode === 'signup' ? { backgroundColor: 'var(--eval-surface)', color: 'var(--eval-ink)', boxShadow: 'var(--eval-shadow-sm)' } : { color: 'var(--eval-muted)' }}
          >
            Sign Up
          </button>
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
            {needsVerificationEmail && (
              <button
                type="button"
                disabled={busy}
                onClick={handleResendVerification}
                className="inline-flex items-center gap-1 font-semibold underline"
                style={{ color: 'var(--eval-accent)' }}
              >
                Resend confirmation email
              </button>
            )}
          </div>
        )}

        {/* Primary Google Sign-In */}
        {!pendingVerify && mode !== 'reset' && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleTeacher}
              className="eval-btn-secondary w-full py-2.5"
            >
              <GoogleBrandIcon />
              Continue with Google
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t" style={{ borderColor: 'var(--eval-border)' }} />
              <span className="px-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--eval-muted)' }}>
                or with email
              </span>
              <div className="flex-grow border-t" style={{ borderColor: 'var(--eval-border)' }} />
            </div>
          </div>
        )}

        {/* Verification Form */}
        {pendingVerify ? (
          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div
              className="p-3 rounded-lg border text-xs space-y-1"
              style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
            >
              <div className="font-semibold flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                Confirm your email address
              </div>
              <p style={{ color: 'var(--eval-muted)' }}>
                Click the verification link sent to <strong>{email || 'your email'}</strong> or paste the verification token below.
              </p>
            </div>
            <div>
              <label htmlFor="verifyToken" className="block text-xs font-medium mb-1">
                Verification Token
              </label>
              <input
                id="verifyToken"
                className="eval-input font-mono"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={busy} className="eval-btn-primary w-full">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              Verify &amp; Enter Workspace
            </button>
            {email && (
              <button type="button" disabled={busy} onClick={handleResendVerification} className="eval-btn-ghost w-full text-xs">
                Resend confirmation email
              </button>
            )}
          </form>
        ) : mode === 'reset' ? (
          pendingResetConfirm ? (
            <form onSubmit={handleResetConfirm} className="space-y-4">
              <div>
                <label htmlFor="resetToken" className="block text-xs font-medium mb-1">Recovery Token</label>
                <input
                  id="resetToken"
                  className="eval-input font-mono"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="newPw" className="block text-xs font-medium mb-1">New Password (8+ characters)</label>
                <input
                  id="newPw"
                  type="password"
                  className="eval-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <button type="submit" disabled={busy} className="eval-btn-primary w-full">
                Update Password
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <div>
                <label htmlFor="resetEmail" className="block text-xs font-medium mb-1">Instructor Email</label>
                <input
                  id="resetEmail"
                  type="email"
                  className="eval-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="instructor@institution.edu"
                  required
                />
              </div>
              <button type="submit" disabled={busy} className="eval-btn-primary w-full">
                <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                Send Recovery Email
              </button>
              <button type="button" onClick={() => setMode('login')} className="eval-btn-ghost w-full text-xs">
                Back to Sign In
              </button>
            </form>
          )
        ) : mode === 'signup' ? (
          <form onSubmit={handleSignupSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="tName" className="block text-xs font-medium mb-1">Display Name</label>
              <input
                id="tName"
                className="eval-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full name or title"
                required
              />
            </div>
            <div>
              <label htmlFor="tInst" className="block text-xs font-medium mb-1">
                Institution Name <span style={{ color: 'var(--eval-muted)' }}>(optional)</span>
              </label>
              <input
                id="tInst"
                className="eval-input"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="University or organization"
              />
            </div>
            <div>
              <label htmlFor="tEmail" className="block text-xs font-medium mb-1">Work Email Address</label>
              <input
                id="tEmail"
                type="email"
                className="eval-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="instructor@institution.edu"
                required
              />
            </div>
            <div>
              <label htmlFor="tPw" className="block text-xs font-medium mb-1">Password (min 8 characters)</label>
              <input
                id="tPw"
                type="password"
                className="eval-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" disabled={busy} className="eval-btn-primary w-full">
              Create Teacher Account
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="lEmail" className="block text-xs font-medium mb-1">Email Address</label>
              <input
                id="lEmail"
                type="email"
                className="eval-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="instructor@institution.edu"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="lPw" className="block text-xs font-medium">Password</label>
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="text-[11px] hover:underline"
                  style={{ color: 'var(--eval-accent)' }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="lPw"
                type="password"
                className="eval-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" disabled={busy} className="eval-btn-primary w-full">
              Sign In
            </button>
          </form>
        )}

        <div className="pt-4 border-t text-center text-xs" style={{ borderColor: 'var(--eval-border)', color: 'var(--eval-muted)' }}>
          Signing in as a student?{' '}
          <Link to="/student/login" className="font-semibold underline" style={{ color: 'var(--eval-accent)' }}>
            Enter Student Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
