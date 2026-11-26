import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, LayoutDashboard, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const profileRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    setProfileOpen(false);
    navigate('/');
  };

  const dashboardPath = user?.role === 'teacher' ? '/teacher' : '/student';
  const initials = String(user?.displayName || user?.email || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
  const filled = scrolled || open;

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-all duration-200 ${
        filled ? 'backdrop-blur-md' : ''
      }`}
      style={{
        backgroundColor: filled
          ? 'color-mix(in srgb, var(--eval-surface) 92%, transparent)'
          : 'transparent',
        borderColor: filled ? 'var(--eval-border)' : 'transparent',
        boxShadow: filled ? '0 1px 12px rgba(10, 9, 8, 0.05)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo + Wordmark */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
          <img
            src="/roster-logo.png"
            alt="Roster"
            className="h-7 w-auto object-contain dark:invert"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--eval-ink)' }}>
            Roster
          </span>
        </Link>

        {/* Center Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          <Link to="/#workflow" className="eval-btn-ghost text-xs">
            Platform
          </Link>
          <Link to="/#modes" className="eval-btn-ghost text-xs">
            Live Modes
          </Link>
          <Link to="/#security" className="eval-btn-ghost text-xs">
            Access &amp; Security
          </Link>
          <Link to={user?.role === 'student' ? '/student' : '/student/login#room-join'} className="eval-btn-ghost text-xs">
            Join Room
          </Link>
          {user && (
            <Link
              to={dashboardPath}
              className="eval-btn-ghost text-xs"
              style={
                location.pathname.startsWith(dashboardPath)
                  ? { color: 'var(--eval-accent)', fontWeight: 600 }
                  : undefined
              }
            >
              {user.role === 'teacher' ? 'Teacher Workspace' : 'Student Dashboard'}
            </Link>
          )}
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                className="w-10 h-10 rounded-full border overflow-hidden flex items-center justify-center text-sm font-semibold shrink-0"
                style={{
                  borderColor: 'var(--eval-border-strong)',
                  backgroundColor: 'var(--eval-accent-soft)',
                  color: 'var(--eval-accent)',
                }}
                aria-label="Open profile menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : initials}
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-64 rounded-lg border p-2 shadow-lg"
                  style={{
                    borderColor: 'var(--eval-border)',
                    backgroundColor: 'var(--eval-surface)',
                  }}
                >
                  <div className="px-3 py-2.5 border-b mb-1" style={{ borderColor: 'var(--eval-border)' }}>
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--eval-ink)' }}>
                      {user.displayName}
                    </p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--eval-muted)' }}>
                      {user.email}
                    </p>
                  </div>
                  <Link
                    to={dashboardPath}
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-md text-xs font-medium hover:opacity-80"
                    style={{ color: 'var(--eval-ink)' }}
                  >
                    <LayoutDashboard className="w-4 h-4" strokeWidth={1.75} />
                    {user.role === 'teacher' ? 'Teacher Workspace' : 'Student Dashboard'}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-xs font-medium hover:opacity-80"
                    style={{ color: 'var(--eval-ink)' }}
                  >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/student/login" className="eval-btn-ghost text-xs">
                Student Login
              </Link>
              <Link to="/teacher/login" className="eval-btn-secondary py-2 px-3.5 text-xs">
                Log in
              </Link>
              <Link to="/teacher/signup" className="eval-btn-primary py-2 px-3.5 text-xs">
                Sign up for free
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          className="md:hidden p-2 rounded-lg border"
          style={{ borderColor: 'var(--eval-border)', color: 'var(--eval-ink)' }}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
        >
          {open ? <X className="w-5 h-5" strokeWidth={1.75} /> : <Menu className="w-5 h-5" strokeWidth={1.75} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div
          className="md:hidden border-t px-4 py-4 space-y-3"
          style={{
            backgroundColor: 'var(--eval-surface)',
            borderColor: 'var(--eval-border)',
          }}
        >
          <div className="flex flex-col gap-1">
            <Link to="/#workflow" className="eval-btn-ghost justify-start" onClick={() => setOpen(false)}>
              Platform
            </Link>
            <Link to="/#modes" className="eval-btn-ghost justify-start" onClick={() => setOpen(false)}>
              Live Modes
            </Link>
            <Link to="/#security" className="eval-btn-ghost justify-start" onClick={() => setOpen(false)}>
              Access &amp; Security
            </Link>
            <Link
              to={user?.role === 'student' ? '/student' : '/student/login#room-join'}
              className="eval-btn-ghost justify-start"
              onClick={() => setOpen(false)}
            >
              Join Room
            </Link>
          </div>
          <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--eval-border)' }}>
            {user ? (
              <>
                <div className="text-xs px-1" style={{ color: 'var(--eval-muted)' }}>
                  Signed in as <strong style={{ color: 'var(--eval-ink)' }}>{user.email}</strong> ({user.role})
                </div>
                <Link to={dashboardPath} className="eval-btn-primary w-full" onClick={() => setOpen(false)}>
                  Open {user.role === 'teacher' ? 'Teacher Workspace' : 'Student Dashboard'}
                </Link>
                <button type="button" onClick={handleLogout} className="eval-btn-secondary w-full">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/student/login" className="eval-btn-secondary w-full" onClick={() => setOpen(false)}>
                  Student Login
                </Link>
                <Link to="/teacher/login" className="eval-btn-secondary w-full" onClick={() => setOpen(false)}>
                  Instructor Log in
                </Link>
                <Link to="/teacher/signup" className="eval-btn-primary w-full" onClick={() => setOpen(false)}>
                  Sign up for free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
