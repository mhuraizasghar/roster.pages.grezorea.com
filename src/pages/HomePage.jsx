import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  FolderTree,
  Lock,
  Play,
  Radio,
  Shield,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Configure your walkthrough video link (MP4/WebM or YouTube/Vimeo embed URL) and poster thumbnail PNG:
const WALKTHROUGH_VIDEO_URL = import.meta.env.VITE_WALKTHROUGH_VIDEO_URL || '';
const WALKTHROUGH_POSTER_URL = import.meta.env.VITE_WALKTHROUGH_POSTER_URL || '/roster-poster.png';

function toEmbedUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

export default function HomePage() {
  const { user } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [posterMissing, setPosterMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const navigate = useNavigate();

  const embedUrl = toEmbedUrl(WALKTHROUGH_VIDEO_URL);
  const hasVideo = Boolean(WALKTHROUGH_VIDEO_URL);

  const handleQuickJoin = (e) => {
    e.preventDefault();
    const clean = roomCode.trim().toUpperCase();
    if (!clean) return;
    navigate(`/room/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="pb-12">
      {/* 1. Clean Full-Width Editorial Hero (No boxed right div) */}
      <section className="pt-14 sm:pt-24 pb-16 sm:pb-20 border-b" style={{ borderColor: 'var(--eval-border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <h1
            className="text-4xl sm:text-6xl lg:text-[4.15rem] font-semibold tracking-tight leading-[1.06] max-w-4xl mx-auto"
            style={{ color: 'var(--eval-ink)' }}
          >
            Live classrooms and structured exams, connected by one roster.
          </h1>

          <p className="text-base sm:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            Instructors curate subject libraries, run real-time live rooms, and schedule self-paced assessments. Verified students connect across institutions without public catalogs or shared passwords.
          </p>

          {/* Primary Actions */}
          <div className="grid w-full max-w-[760px] grid-cols-1 sm:grid-cols-3 items-center justify-center gap-3 pt-1 mx-auto">
            {user ? (
              <Link
                to={user.role === 'teacher' ? '/teacher' : '/student'}
                className="eval-btn-primary w-full max-w-[320px] justify-self-center sm:col-span-3 px-4 text-sm"
              >
                Open {user.role === 'teacher' ? 'Teacher Workspace' : 'Student Dashboard'}
                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
              </Link>
            ) : (
              <>
                <Link to="/teacher/signup" className="eval-btn-primary w-full px-4 text-sm">
                  Sign up for free
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </Link>
                <Link to="/teacher/login" className="eval-btn-secondary w-full px-4 text-sm">
                  Instructor Log in
                </Link>
                <Link to="/student/login" className="eval-btn-secondary w-full px-4 text-sm">
                  Student Login
                </Link>
              </>
            )}
          </div>

          {/* Inline Minimal Room Join Bar */}
          <form
            id="join"
            onSubmit={handleQuickJoin}
            className="max-w-md mx-auto pt-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Have a live room code? Enter code"
              maxLength={12}
              aria-label="Live room code"
              className="eval-input font-mono uppercase tracking-wider text-xs py-2.5 text-center sm:text-left"
            />
            <button type="submit" className="eval-btn-secondary py-2.5 px-4 text-xs shrink-0">
              Join Room
            </button>
          </form>

          {/* Key Platform Pillars */}
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 pt-2 text-xs" style={{ color: 'var(--eval-muted)' }}>
            {[
              'Verified Google & OTP login',
              'Multi-institution email rosters',
              'Immutable exam snapshots',
              'Real-time WebSocket rooms',
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" strokeWidth={2} style={{ color: 'var(--eval-accent)' }} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Standalone 16:9 Platform Walkthrough Video Frame + Heading Below */}
      <section id="walkthrough" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 space-y-6">
        <div
          className="rounded-xl border overflow-hidden shadow-lg"
          style={{
            backgroundColor: '#0a0908',
            borderColor: 'var(--eval-border-strong)',
          }}
        >
          {/* 16:9 Video Viewport (supports poster PNG thumbnail + MP4 or YouTube/Vimeo link) */}
          <div
            className="relative aspect-video w-full flex items-center justify-center overflow-hidden"
            style={{
              background: 'radial-gradient(circle at 50% 42%, rgba(73, 17, 28, 0.36), #0a0908 72%)',
            }}
          >
            {hasVideo && playing ? (
              embedUrl ? (
                <iframe
                  src={`${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
                  title="Roster Platform Walkthrough"
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  playsInline
                  poster={!posterMissing ? WALKTHROUGH_POSTER_URL : undefined}
                >
                  <source src={WALKTHROUGH_VIDEO_URL} />
                </video>
              )
            ) : (
              <>
                {!posterMissing && WALKTHROUGH_POSTER_URL && (
                  <img
                    src={WALKTHROUGH_POSTER_URL}
                    alt="Roster platform walkthrough thumbnail"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setPosterMissing(true)}
                  />
                )}
                {hasVideo && !embedUrl && posterMissing && (
                  <video
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                    preload="metadata"
                    muted
                  >
                    <source src={WALKTHROUGH_VIDEO_URL} />
                  </video>
                )}
                <button
                  type="button"
                  onClick={() => hasVideo && setPlaying(true)}
                  className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center border transition-transform hover:scale-105"
                  style={{
                    backgroundColor: '#49111c',
                    borderColor: 'rgba(169, 146, 125, 0.45)',
                    color: '#f2f4f3',
                    cursor: hasVideo ? 'pointer' : 'default',
                  }}
                  aria-label="Play platform walkthrough video"
                >
                  <Play className="w-6 h-6 ml-0.5" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Heading and Paragraph Below Frame */}
        <div className="max-w-3xl space-y-2 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
            Product Walkthrough
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Inside the Roster workspace
          </h2>
          <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            Follow the complete instructor and student workflow—from importing verified email rosters and organizing nested quiz libraries to directing real-time classrooms and reviewing item-level analytics.
          </p>
        </div>
      </section>

      {/* 3. Role-Separated Workflow (Instructors vs Students) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28">
        <div className="max-w-2xl mb-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
            Two Distinct Portals
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold mt-1">
            Purpose-built experiences for teaching and assessment
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Instructor Card */}
          <div className="eval-card p-6 sm:p-8 flex flex-col justify-between gap-6 border-t-4" style={{ borderTopColor: 'var(--eval-accent)' }}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
                  For Instructors
                </span>
                <BookOpen className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
              </div>
              <h3 className="text-xl font-semibold">Author, roster, and deliver from one workspace</h3>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                Build reusable subject folders, import class rosters via CSV, publish timed self-paced assignments, and direct live classrooms with full control over reveal timing.
              </p>
              <ul className="space-y-2 pt-2 text-xs" style={{ color: 'var(--eval-ink)' }}>
                {[
                  'Open sign-up with verified email or Google sign-in',
                  'Nested subject folders with search and soft-delete Trash',
                  'Per-student deadline extensions and attempt overrides',
                  'Item-level accuracy breakdown and formula-safe CSV export',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} style={{ color: 'var(--eval-accent)' }} />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-4 border-t flex flex-wrap gap-3" style={{ borderColor: 'var(--eval-border)' }}>
              <Link to="/teacher/signup" className="eval-btn-primary text-xs">
                Sign up for free <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
              <Link to="/guide/instructors" className="eval-btn-secondary text-xs">
                Instructor Guide
              </Link>
            </div>
          </div>

          {/* Student Card */}
          <div className="eval-card p-6 sm:p-8 flex flex-col justify-between gap-6 border-t-4" style={{ borderTopColor: 'var(--stone-brown)' }}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-muted)' }}>
                  For Students
                </span>
                <Users className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-muted)' }} />
              </div>
              <h3 className="text-xl font-semibold">Invitation-only access across every class</h3>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                No browsing for instructors or juggling enrollment keys. Sign in with your verified Google account or a 6-digit email code to see every live room and assignment shared with you.
              </p>
              <ul className="space-y-2 pt-2 text-xs" style={{ color: 'var(--eval-ink)' }}>
                {[
                  'Responsive phone-first UI for joining live classrooms',
                  'Cross-teacher dashboard uniting assignments and grades',
                  'Automatic server-side progress saving across reconnects',
                  'Clean post-submission breakdown when released by instructor',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} style={{ color: 'var(--stone-brown)' }} />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-4 border-t flex flex-wrap gap-3" style={{ borderColor: 'var(--eval-border)' }}>
              <Link to="/student/login" className="eval-btn-primary text-xs">
                Student Login <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
              <Link to="/guide/students" className="eval-btn-secondary text-xs">
                Student Guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Architecture & Delivery Modes */}
      <section id="workflow" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28">
        <div className="max-w-2xl mb-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
            Core Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold mt-1">
            Engineered for academic integrity and zero friction
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              step: '01',
              icon: Users,
              title: 'Email Roster Control',
              desc: 'Add students individually or via CSV import. Verified student accounts connect across institutions automatically.',
            },
            {
              step: '02',
              icon: FolderTree,
              title: 'File-System Library',
              desc: 'Organize subjects and nested folders with search, sorting, duplication, and soft-delete Trash recovery.',
            },
            {
              step: '03',
              icon: Lock,
              title: 'Immutable Snapshots',
              desc: 'Assigning or opening a room freezes a versioned snapshot so later library edits never alter active grades.',
            },
            {
              step: '04',
              icon: BarChart3,
              title: 'Analytics & Overrides',
              desc: 'Inspect per-question accuracy, review most-missed prompts, apply manual overrides, and export CSV reports.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="eval-card eval-card-hover p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--eval-border)' }}>
                    <span className="font-mono text-xs font-semibold tracking-wider" style={{ color: 'var(--eval-accent)' }}>
                      {item.step}
                    </span>
                    <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-muted)' }} />
                  </div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Live Room Modes & Question Formats */}
      <section id="modes" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24">
        <div className="eval-card p-6 sm:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
                Classroom Cadence
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold">
                Every delivery mode in one live console
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                Run multiple classrooms concurrently in teacher-paced, student-paced, or timed challenge mode, or pose a single ad-hoc question without creating a quiz first.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link to="/live-rooms" className="eval-btn-secondary text-xs py-2 px-3">
                  Live Rooms Guide <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                </Link>
                <Link to="/question-formats" className="eval-btn-ghost text-xs py-2 px-3">
                  Question Formats
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  icon: Radio,
                  title: 'Teacher-Paced & Quick Question',
                  body: 'Advance question-by-question with real-time response distributions, or launch an instant exit ticket.',
                },
                {
                  icon: SlidersHorizontal,
                  title: 'Timed Challenge Scoring',
                  body: 'Per-question countdown timers with deterministic speed-bonus scoring and live participant rankings.',
                },
                {
                  icon: Check,
                  title: 'Four Question Formats',
                  body: 'Single and multi-select MCQs, True/False checks, timed Challenges, and forgiving Short Answer matching.',
                },
                {
                  icon: Shield,
                  title: 'Reconnection Resilience',
                  body: 'Answers persist per question on the server so mobile students who drop offline resume seamlessly.',
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="p-4 rounded-lg border space-y-2"
                    style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                    <h3 className="text-sm font-semibold">{card.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                      {card.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 5b. Live Classrooms vs Self-Paced Assignments Comparison */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--eval-accent)' }}>
              Assessment Workflows
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold">
              Live sessions and assigned coursework, side by side
            </h2>
          </div>
          <Link to="/features" className="eval-btn-secondary text-xs self-start md:self-auto">
            Explore All Features <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        </div>

        <div className="eval-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)', color: 'var(--eval-muted)' }}>
                  <th className="py-3.5 px-5 font-semibold">Capability</th>
                  <th className="py-3.5 px-5 font-semibold">Live Classrooms</th>
                  <th className="py-3.5 px-5 font-semibold">Self-Paced Assignments</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
                {[
                  ['Entry Method', '6-character room code or scannable QR link', 'Direct card on verified Student Dashboard'],
                  ['Pacing & Timing', 'Teacher-paced, student-paced, challenge timer, or quick poll', 'Due date, countdown limit, and auto-submit on expiry'],
                  ['Roster Control', 'Roster-gated by default with optional open-join toggle', 'Targeted to entire roster, sections/groups, or individuals'],
                  ['Snapshot Safety', 'Freezes QuizVersion snapshot when room launches', 'Freezes QuizVersion snapshot upon assignment publish'],
                  ['Grading & Analytics', 'Live response bars, leaderboard, and auto-saved room report', 'Incremental progress save, manual overrides, and CSV export'],
                ].map(([cap, live, assign]) => (
                  <tr key={cap}>
                    <td className="py-3.5 px-5 font-semibold">{cap}</td>
                    <td className="py-3.5 px-5" style={{ color: 'var(--eval-muted)' }}>{live}</td>
                    <td className="py-3.5 px-5" style={{ color: 'var(--eval-muted)' }}>{assign}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Obsidian & Night Bordeaux Security Band */}
      <section id="security" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24">
        <div
          className="rounded-xl border p-8 sm:p-12 space-y-8"
          style={{
            backgroundColor: '#0a0908',
            borderColor: 'rgba(169, 146, 125, 0.25)',
            color: '#f2f4f3',
          }}
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b" style={{ borderColor: 'rgba(169, 146, 125, 0.2)' }}>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#a9927d' }}>
                Security &amp; Isolation
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold" style={{ color: '#f2f4f3' }}>
                Designed for high-trust academic environments
              </h2>
            </div>
            <Link
              to="/security"
              className="font-mono text-xs px-3 py-1.5 rounded border self-start md:self-auto inline-flex items-center gap-1.5 hover:opacity-90"
              style={{ borderColor: 'rgba(169, 146, 125, 0.3)', backgroundColor: '#49111c', color: '#f2f4f3' }}
            >
              Security Architecture <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'Zero Answer Leakage',
                desc: 'Answer keys and accepted short-answer patterns remain exclusively on the server until submission or explicit instructor reveal.',
              },
              {
                title: 'Verified Identity Gate',
                desc: 'Students authenticate strictly via verified Google identity or confirmed one-time email codes matched against instructor rosters.',
              },
              {
                title: 'Multi-Tenant Isolation',
                desc: 'Instructors maintain strictly isolated libraries, rosters, and gradebooks—even when teaching the same student.',
              },
            ].map((item) => (
              <div key={item.title} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#f2f4f3' }}>
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: '#a9927d' }} />
                  {item.title}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#a9927d' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Closing CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 text-center space-y-5">
        <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight">
          Ready to run your next classroom assessment on Roster?
        </h2>
        <p className="text-sm max-w-xl mx-auto" style={{ color: 'var(--eval-muted)' }}>
          Create an instructor account in under a minute, or sign in through your instructor&apos;s verified student roster.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link to="/teacher/signup" className="eval-btn-primary px-6 py-3 text-sm">
            Sign up for free <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
          <Link to="/student/login" className="eval-btn-secondary px-6 py-3 text-sm">
            Student Login
          </Link>
        </div>
      </section>
    </div>
  );
}
