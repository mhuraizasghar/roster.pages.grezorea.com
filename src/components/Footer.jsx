import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const FOOTER_ROW_1 = [
  {
    heading: 'Platform',
    links: [
      { label: 'Overview', to: '/features' },
      { label: 'Live Classrooms', to: '/live-rooms' },
      { label: 'Assignments', to: '/assignments' },
      { label: 'Question Formats', to: '/question-formats' },
      { label: 'Snapshot Architecture', to: '/architecture' },
    ],
  },
  {
    heading: 'Portals',
    links: [
      { label: 'Sign up for free', to: '/teacher/signup' },
      { label: 'Instructor Log in', to: '/teacher/login' },
      { label: 'Password Recovery', to: '/teacher/reset' },
      { label: 'Student Login', to: '/student/login' },
      { label: 'Join Live Room', to: '/student/login#room-join' },
    ],
  },
  {
    heading: 'Workspaces',
    links: [
      { label: 'Teacher Workspace', to: '/teacher' },
      { label: 'Student Dashboard', to: '/student' },
    ],
  },
  {
    heading: 'Documentation',
    links: [
      { label: 'Instructor Guide', to: '/guide/instructors' },
      { label: 'Student Guide', to: '/guide/students' },
      { label: 'Release Notes', to: '/changelog' },
    ],
  },
  {
    heading: 'Trust & Safety',
    links: [
      { label: 'Security', to: '/security' },
      { label: 'Data Retention', to: '/data-retention' },
      { label: 'System Status', to: '/status' },
    ],
  },
];

const FOOTER_ROW_2 = [
  {
    heading: 'Directory',
    links: [
      { label: 'Home', to: '/' },
      { label: 'Sitemap', to: '/sitemap' },
      { label: 'XML Sitemap', href: '/sitemap.xml' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Support', to: '/support' },
      { label: 'Instructor Help', to: '/guide/instructors' },
      { label: 'Student Help', to: '/guide/students' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/mhuraizasghar/quiz' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    heading: 'Operations',
    links: [
      { label: 'Status', to: '/status' },
      { label: 'Architecture', to: '/architecture' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Data Retention', to: '/data-retention' },
    ],
  },
];

export default function Footer() {
  const { theme, setTheme } = useTheme();
  const [lang, setLang] = useState('English');

  const renderLink = (item) => {
    if (item.href) {
      return (
        <a
          key={item.label}
          href={item.href}
          target={item.href.startsWith('http') ? '_blank' : undefined}
          rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-xs transition-colors hover:underline"
          style={{ color: 'var(--eval-ink)' }}
        >
          {item.label}
        </a>
      );
    }
    return (
      <Link
        key={item.label}
        to={item.to}
        className="text-xs transition-colors hover:underline"
        style={{ color: 'var(--eval-ink)' }}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <footer
      className="mt-20 border-t transition-colors"
      style={{
        backgroundColor: 'var(--eval-bg)',
        borderColor: 'var(--eval-border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        {/* Top Section: Brand Mission Left + 2x5 Dedicated Columns Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-14">
          <div className="lg:col-span-3 space-y-3">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/roster-logo.png"
                alt="Roster"
                className="h-7 w-auto object-contain rounded-sm dark:invert"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--eval-ink)' }}>
                Roster
              </span>
            </Link>
            <p className="text-xs leading-relaxed max-w-xs" style={{ color: 'var(--eval-muted)' }}>
              Roster-gated academic assessments, live classrooms, and immutable exam snapshots built for instructors and institutions.
            </p>
          </div>

          <div className="lg:col-span-9 space-y-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
              {FOOTER_ROW_1.map((col) => (
                <div key={col.heading} className="space-y-2.5">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--eval-muted)' }}>
                    {col.heading}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {col.links.map(renderLink)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
              {FOOTER_ROW_2.map((col) => (
                <div key={col.heading} className="space-y-2.5">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--eval-muted)' }}>
                    {col.heading}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {col.links.map(renderLink)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Giant Editorial Wordmark Banner */}
        <div className="py-6 sm:py-10 overflow-hidden select-none">
          <div
            className="font-semibold tracking-[-0.04em] leading-none text-center sm:text-left"
            style={{
              fontSize: 'clamp(2.75rem, 9.5vw, 7.5rem)',
              color: 'var(--eval-ink)',
            }}
          >
            EVAL Assessment
          </div>
        </div>

        {/* Bottom Legal & Controls Bar */}
        <div
          className="pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-4 text-xs"
          style={{ borderColor: 'var(--eval-border)', color: 'var(--eval-muted)' }}
        >
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
            <span>&copy; 2018&ndash;2026 EVAL. All rights reserved.</span>

            {/* System / Light / Dark Theme Switcher */}
            <div
              className="inline-flex items-center p-0.5 rounded-lg border"
              style={{
                borderColor: 'var(--eval-border)',
                backgroundColor: 'var(--eval-surface)',
              }}
              role="group"
              aria-label="Theme preference"
            >
              {[
                { id: 'system', icon: Monitor, label: 'System theme' },
                { id: 'light', icon: Sun, label: 'Light theme' },
                { id: 'dark', icon: Moon, label: 'Dark theme' },
              ].map(({ id, icon: Icon, label }) => {
                const active = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    aria-label={label}
                    title={label}
                    className="p-1.5 rounded-md transition-colors"
                    style={
                      active
                        ? { backgroundColor: 'var(--eval-ink)', color: 'var(--eval-bg)' }
                        : { color: 'var(--eval-muted)' }
                    }
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Language Selector */}
            <label
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer"
              style={{
                borderColor: 'var(--eval-border)',
                backgroundColor: 'var(--eval-surface)',
                color: 'var(--eval-ink)',
              }}
            >
              <Globe className="w-3.5 h-3.5" style={{ color: 'var(--eval-muted)' }} />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label="Language"
                className="bg-transparent text-xs outline-none cursor-pointer"
              >
                <option value="English">English</option>
                <option value="Urdu">Urdu</option>
                <option value="Arabic">Arabic</option>
                <option value="Spanish">Spanish</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <Link to="/features" className="hover:underline" style={{ color: 'var(--eval-muted)' }}>
              Features
            </Link>
            <Link to="/support" className="hover:underline" style={{ color: 'var(--eval-muted)' }}>
              Support
            </Link>
            <Link to="/privacy" className="hover:underline" style={{ color: 'var(--eval-muted)' }}>
              Privacy
            </Link>
            <Link to="/terms" className="hover:underline" style={{ color: 'var(--eval-muted)' }}>
              Terms
            </Link>
            <Link to="/sitemap" className="hover:underline" style={{ color: 'var(--eval-muted)' }}>
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
