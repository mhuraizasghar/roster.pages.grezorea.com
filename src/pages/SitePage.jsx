import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  RefreshCw,
} from 'lucide-react';
import { SITE_PAGES } from '../data/sitePages';
import { api } from '../lib/api';

const SUPPORT_FAQS = [
  {
    q: 'Why does Student Sign In say my email has not been added by a teacher yet?',
    a: 'Roster does not offer open student sign-up. An instructor must add your exact email address to their roster first. Ask your instructor to verify the spelling of your email in their Student Roster tab.',
  },
  {
    q: 'I have both a Teacher and a Student role at different institutions. Can I switch roles?',
    a: 'Roles are fixed per account for security isolation. Use separate email addresses for your Instructor account and your Student account.',
  },
  {
    q: 'What happens if I edit a quiz after assigning it or starting a live room?',
    a: 'Publishing an assignment or launching a live room freezes an immutable QuizVersion snapshot. Draft edits in your Quiz Library never alter active exams or historical scores.',
  },
  {
    q: 'A student lost Wi-Fi mid-quiz. Do they have to restart?',
    a: 'No. Assignment responses save to the server as each question is answered. When the student signs back in, they resume their in-progress attempt with remaining time intact.',
  },
  {
    q: 'How are Short Answer responses graded?',
    a: 'Instructors configure accepted phrases plus optional rules for case sensitivity, ignoring whitespace, and minor spelling typos. Any item can also be overridden manually in Reports.',
  },
];

const SITEMAP_GROUPS = [
  {
    title: 'Core Platform',
    links: [
      { label: 'Home', to: '/' },
      { label: 'Platform Overview & Features', to: '/features' },
      { label: 'Live Classrooms', to: '/live-rooms' },
      { label: 'Self-Paced Assignments', to: '/assignments' },
      { label: 'Question Formats & Grading', to: '/question-formats' },
      { label: 'Snapshot & Roster Architecture', to: '/architecture' },
    ],
  },
  {
    title: 'Portals',
    links: [
      { label: 'Sign up for free (Instructor)', to: '/teacher/signup' },
      { label: 'Instructor Log in', to: '/teacher/login' },
      { label: 'Instructor Password Recovery', to: '/teacher/reset' },
      { label: 'Student Login', to: '/student/login' },
      { label: 'Join Live Classroom', to: '/student/login#room-join' },
    ],
  },
  {
    title: 'Resources & Operations',
    links: [
      { label: 'Instructor Guide & CSV Template', to: '/guide/instructors' },
      { label: 'Student Guide', to: '/guide/students' },
      { label: 'Support & FAQs', to: '/support' },
      { label: 'Release Notes', to: '/changelog' },
      { label: 'System Status', to: '/status' },
    ],
  },
  {
    title: 'Security & Legal',
    links: [
      { label: 'Security & Answer Protection', to: '/security' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Data Retention Policy', to: '/data-retention' },
    ],
  },
];

export default function SitePage({ pageKey }) {
  const page = SITE_PAGES[pageKey];
  const [openFaq, setOpenFaq] = useState(0);
  const [statusData, setStatusData] = useState({
    loading: true,
    apiOk: false,
    mailerConfigured: false,
    fromEmail: '',
    checkedAt: null,
  });

  const checkSystemStatus = async () => {
    setStatusData((prev) => ({ ...prev, loading: true }));
    try {
      const [health, mailerRes] = await Promise.all([
        api.get('/api/health'),
        api.get('/api/mailer/status').catch(() => null),
      ]);
      setStatusData({
        loading: false,
        apiOk: Boolean(health?.ok),
        mailerConfigured: Boolean(mailerRes?.mailer?.configured ?? health?.mailerConfigured),
        fromEmail: mailerRes?.mailer?.fromEmail || '',
        checkedAt: health?.timestamp || new Date().toISOString(),
      });
    } catch {
      setStatusData({
        loading: false,
        apiOk: false,
        mailerConfigured: false,
        fromEmail: '',
        checkedAt: new Date().toISOString(),
      });
    }
  };

  useEffect(() => {
    if (page?.special === 'system-status') {
      checkSystemStatus();
    }
  }, [page?.special]);

  const downloadCsvTemplate = () => {
    const csv = [
      'email,name,group',
      'student.one@university.edu,Student One,CS-101 Section A',
      'student.two@college.edu,Student Two,CS-101 Section A',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eval-roster-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!page) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-10">
      {/* Breadcrumb & Header */}
      <div className="space-y-4 pb-8 border-b" style={{ borderColor: 'var(--eval-border)' }}>
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs hover:underline" style={{ color: 'var(--eval-muted)' }}>
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> Back to Home
        </Link>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
              {page.eyebrow}
            </span>
            {page.updated && (
              <span className="text-xs font-mono" style={{ color: 'var(--eval-muted)' }}>
                Updated {page.updated}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            {page.title}
          </h1>
          <p className="text-base leading-relaxed max-w-3xl" style={{ color: 'var(--eval-muted)' }}>
            {page.lead}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {page.primaryCta && (
            <Link to={page.primaryCta.to} className="eval-btn-primary text-xs">
              {page.primaryCta.label}
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          )}
          {page.secondaryCta && (
            <Link to={page.secondaryCta.to} className="eval-btn-secondary text-xs">
              {page.secondaryCta.label}
            </Link>
          )}
        </div>
      </div>

      {/* Instructor CSV Template Special Widget */}
      {page.special === 'instructor-guide' && (
        <div className="eval-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">CSV Roster Import Template</h2>
            <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
              Download a starter CSV with <code className="font-mono">email,name,group</code> headers ready for bulk upload.
            </p>
          </div>
          <button type="button" onClick={downloadCsvTemplate} className="eval-btn-secondary text-xs shrink-0">
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Download CSV Template
          </button>
        </div>
      )}

      {/* System Status Special Widget */}
      {page.special === 'system-status' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Service Health Checks</h2>
            <button type="button" onClick={checkSystemStatus} className="eval-btn-secondary py-1.5 px-3 text-xs">
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} /> Refresh
            </button>
          </div>
          <div className="eval-card divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {[
              {
                name: 'REST API & Session Auth',
                desc: 'Authentication, rosters, library, assignments, and reporting endpoints',
                ok: statusData.apiOk,
              },
              {
                name: 'WebSocket Live Classroom Hub',
                desc: 'Real-time question pacing, response distributions, and challenge timers',
                ok: statusData.apiOk,
              },
              {
                name: 'Transactional Email Delivery',
                desc: statusData.fromEmail
                  ? `Verification, OTP codes, recovery links, and results via ${statusData.fromEmail}`
                  : 'Verification, one-time login codes, password recovery, and grade alerts',
                ok: statusData.mailerConfigured,
              },
            ].map((svc) => (
              <div key={svc.name} className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold">{svc.name}</div>
                  <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>{svc.desc}</div>
                </div>
                <span className={statusData.loading ? 'eval-badge eval-badge-neutral' : svc.ok ? 'eval-badge eval-badge-pass' : 'eval-badge eval-badge-warn'}>
                  {statusData.loading ? 'Checking...' : svc.ok ? 'Operational' : 'Standby'}
                </span>
              </div>
            ))}
          </div>
          {statusData.checkedAt && (
            <div className="text-[11px] font-mono" style={{ color: 'var(--eval-muted)' }}>
              Last checked: {new Date(statusData.checkedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Support FAQ Accordion */}
      {page.special === 'support-faq' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
          <div className="eval-card divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {SUPPORT_FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-semibold">{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--eval-muted)' }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HTML Sitemap Special Directory */}
      {page.special === 'html-sitemap' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SITEMAP_GROUPS.map((grp) => (
            <div key={grp.title} className="eval-card p-6 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
                {grp.title}
              </h2>
              <ul className="space-y-2">
                {grp.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm font-medium hover:underline inline-flex items-center gap-1.5">
                      <span>{l.label}</span>
                      <ArrowRight className="w-3 h-3 opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="sm:col-span-2 eval-card p-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs" style={{ color: 'var(--eval-muted)' }}>
              Machine-readable XML sitemap for search indexing:
            </span>
            <a href="/sitemap.xml" className="eval-btn-secondary py-1.5 px-3 text-xs font-mono">
              /sitemap.xml
            </a>
          </div>
        </div>
      )}

      {/* Standard Editorial Sections */}
      {page.sections?.length > 0 && (
        <div className="space-y-6">
          {page.sections.map((sec) => (
            <section key={sec.heading} className="eval-card p-6 sm:p-8 space-y-3">
              <h2 className="text-lg font-semibold">{sec.heading}</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                {sec.body}
              </p>
              {sec.bullets?.length > 0 && (
                <ul className="space-y-2 pt-2 text-xs sm:text-sm" style={{ color: 'var(--eval-ink)' }}>
                  {sec.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} style={{ color: 'var(--eval-accent)' }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
