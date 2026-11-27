import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CalendarClock,
  CheckCircle2,
  Clock,
  LayoutGrid,
  LogOut,
  Play,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'rooms', label: 'Live Classrooms', icon: Radio },
  { id: 'assignments', label: 'Assignments', icon: CalendarClock },
  { id: 'results', label: 'Results & Grades', icon: Award },
];

export default function StudentDashboardPage() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState({ liveRooms: [], assignments: [], results: [] });
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [roomCodeInput, setRoomCodeInput] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get('/api/student/dashboard');
      setData({
        liveRooms: res.liveRooms || [],
        assignments: res.assignments || [],
        results: res.results || [],
      });
    } catch (err) {
      showToast(err.message || 'Could not refresh dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard();
    // Dashboard data loads once per page visit; the visible Refresh button
    // keeps repeat database reads deliberate instead of polling every 30s.
  }, [loadDashboard]);

  const handleJoinCode = (e) => {
    e.preventDefault();
    const clean = roomCodeInput.trim().toUpperCase();
    if (!clean) return;
    navigate(`/room/${encodeURIComponent(clean)}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const statusBadge = (status) => {
    if (status === 'submitted') return 'eval-badge eval-badge-pass';
    if (status === 'late') return 'eval-badge eval-badge-warn';
    if (status === 'past_due') return 'eval-badge eval-badge-fail';
    if (status === 'in_progress') return 'eval-badge eval-badge-brand';
    return 'eval-badge eval-badge-neutral';
  };

  const pendingCount = useMemo(
    () => data.assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress').length,
    [data.assignments]
  );

  const avgPercent = useMemo(() => {
    if (!data.results.length) return null;
    const sum = data.results.reduce((s, r) => s + Number(r.percent || 0), 0);
    return Math.round((sum / data.results.length) * 10) / 10;
  }, [data.results]);

  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === 'pending') {
      return data.assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress');
    }
    if (assignmentFilter === 'completed') {
      return data.assignments.filter((a) => a.status === 'submitted' || a.status === 'late');
    }
    return data.assignments;
  }, [data.assignments, assignmentFilter]);

  const initials = (user?.displayName || user?.email || 'ST')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const showRooms = activeSection === 'overview' || activeSection === 'rooms';
  const showAssignments = activeSection === 'overview' || activeSection === 'assignments';
  const showResults = activeSection === 'overview' || activeSection === 'results';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar */}
        <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-24">
          {/* Identity Summary Card */}
          <div className="eval-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-semibold tracking-wider shrink-0"
                style={{
                  backgroundColor: 'var(--eval-accent)',
                  color: '#f2f4f3',
                }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{user?.displayName}</div>
                <div className="text-[11px] font-mono truncate" style={{ color: 'var(--eval-muted)' }}>
                  {user?.email}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--eval-border)', color: 'var(--eval-muted)' }}>
              <span>Verified Student Account</span>
              <span className="eval-badge eval-badge-brand text-[10px]">Rostered</span>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="eval-card p-2 space-y-1" aria-label="Student dashboard sections">
            {NAV_SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const count =
                item.id === 'rooms'
                  ? data.liveRooms.length
                  : item.id === 'assignments'
                    ? data.assignments.length
                    : item.id === 'results'
                      ? data.results.length
                      : null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--eval-accent-soft)',
                          color: 'var(--eval-accent)',
                          fontWeight: 600,
                        }
                      : { color: 'var(--eval-muted)' }
                  }
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                    {item.label}
                  </span>
                  {count !== null && (
                    <span
                      className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: active ? 'var(--eval-surface)' : 'var(--eval-bg)',
                        color: 'var(--eval-ink)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Join Room Quick Action */}
          <form onSubmit={handleJoinCode} className="eval-card p-4 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--eval-accent)' }}>
              Join Live Classroom
            </div>
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter room code"
              aria-label="Room code"
              className="eval-input font-mono uppercase tracking-wider text-xs py-2"
            />
            <button type="submit" className="eval-btn-primary w-full py-2 text-xs">
              Join Room <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </form>

          {/* Sign Out */}
          <button
            type="button"
            onClick={handleLogout}
            className="eval-btn-secondary w-full py-2 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            Sign out
          </button>
        </aside>

        {/* Right Content Area */}
        <div className="lg:col-span-9 space-y-6">
          {/* Header Bar */}
          <div className="eval-card p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
                Student Workspace
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold mt-0.5">
                {NAV_SECTIONS.find((s) => s.id === activeSection)?.label || 'Overview'}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--eval-muted)' }}>
                Sessions, assigned exams, and verified grades across instructors who rostered your address.
              </p>
            </div>
            <button
              type="button"
              onClick={loadDashboard}
              className="eval-btn-secondary text-xs py-2 px-3"
              title="Refresh dashboard"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
              Refresh
            </button>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Live Rooms', value: data.liveRooms.length },
              { label: 'Pending Tasks', value: pendingCount },
              { label: 'Completed', value: data.results.length },
              { label: 'Average Score', value: avgPercent !== null ? `${avgPercent}%` : '—' },
            ].map((kpi) => (
              <div key={kpi.label} className="eval-card p-4 space-y-1">
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--eval-muted)' }}>
                  {kpi.label}
                </div>
                <div className="text-xl font-semibold font-mono" style={{ color: 'var(--eval-ink)' }}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="eval-card p-12 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
              Loading student workspace...
            </div>
          ) : (
            <>
              {/* Live Classrooms Section */}
              {showRooms && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Radio className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                      Live Classrooms ({data.liveRooms.length})
                    </h2>
                  </div>

                  {data.liveRooms.length === 0 ? (
                    <div className="eval-card p-6 text-xs" style={{ color: 'var(--eval-muted)' }}>
                      No live rooms are active from your instructors right now. Enter a room code in the sidebar if your instructor shares one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.liveRooms.map((room) => (
                        <div key={room.id} className="eval-card eval-card-hover p-5 flex flex-col justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="font-mono text-sm font-bold tracking-wider px-2.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: 'var(--eval-accent-soft)',
                                  color: 'var(--eval-accent)',
                                }}
                              >
                                {room.code}
                              </span>
                              <span className={room.status === 'active' ? 'eval-badge eval-badge-pass' : 'eval-badge eval-badge-warn'}>
                                {room.status}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold">{room.title}</h3>
                            <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                              {room.teacherName} &middot; {room.mode.replace('_', ' ')} &middot; {room.participantsCount} online
                            </p>
                          </div>
                          <Link to={`/room/${encodeURIComponent(room.code)}`} className="eval-btn-primary text-xs w-full">
                            <Play className="w-3.5 h-3.5" strokeWidth={1.75} /> Enter Live Room
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Assignments Section */}
              {showAssignments && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <CalendarClock className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                      Self-Paced Assignments ({filteredAssignments.length})
                    </h2>
                    <div className="flex items-center gap-1 p-1 rounded-lg border text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-surface)' }}>
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'pending', label: 'Pending' },
                        { id: 'completed', label: 'Completed' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAssignmentFilter(tab.id)}
                          className="px-2.5 py-1 rounded-md transition-colors"
                          style={
                            assignmentFilter === tab.id
                              ? { backgroundColor: 'var(--eval-accent)', color: '#f2f4f3' }
                              : { color: 'var(--eval-muted)' }
                          }
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAssignments.length === 0 ? (
                    <div className="eval-card p-6 text-xs" style={{ color: 'var(--eval-muted)' }}>
                      No assignments match this filter.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredAssignments.map((asg) => (
                        <div key={asg.id} className="eval-card p-5 flex flex-col justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="eval-badge eval-badge-brand">{asg.subject}</span>
                              <span className={statusBadge(asg.status)}>
                                {asg.status.replace('_', ' ')}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold">{asg.title}</h3>
                            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--eval-muted)' }}>
                              <span>{asg.teacherName}</span>
                              <span>&middot;</span>
                              <span>{asg.questionsCount} Qs</span>
                              {asg.settings?.timeLimitMin > 0 && (
                                <>
                                  <span>&middot;</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" strokeWidth={1.75} /> {asg.settings.timeLimitMin} min
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>
                              {asg.dueAt ? `Due ${new Date(asg.dueAt).toLocaleString()}` : 'No due date'} &middot; Attempts:{' '}
                              <span className="font-mono">
                                {asg.attemptsUsed}/{asg.maxAllowedAttempts === 0 ? '∞' : asg.maxAllowedAttempts}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--eval-border)' }}>
                            {asg.canStart ? (
                              <Link to={`/attempt/${asg.id}`} className="eval-btn-primary text-xs w-full">
                                {asg.hasInProgress ? 'Resume Attempt' : asg.attemptsUsed > 0 ? 'Retake Quiz' : 'Start Assessment'}
                                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </Link>
                            ) : (
                              <span className="eval-badge eval-badge-neutral">
                                <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} /> Attempts Exhausted
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Results Section */}
              {showResults && (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Award className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
                    Results &amp; Transcripts ({data.results.length})
                  </h2>
                  <div className="eval-card overflow-hidden">
                    {data.results.length === 0 ? (
                      <div className="p-6 text-xs text-center" style={{ color: 'var(--eval-muted)' }}>
                        Completed assignments and ended live classroom scores will appear here.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead style={{ backgroundColor: 'var(--eval-bg)', color: 'var(--eval-muted)' }}>
                            <tr>
                              <th className="py-3 px-4 font-semibold">Assessment</th>
                              <th className="py-3 px-4 font-semibold">Instructor</th>
                              <th className="py-3 px-4 font-semibold">Format</th>
                              <th className="py-3 px-4 font-semibold">Score</th>
                              <th className="py-3 px-4 font-semibold">Percent</th>
                              <th className="py-3 px-4 font-semibold">Date</th>
                              <th className="py-3 px-4 font-semibold text-right">Breakdown</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
                            {data.results.map((r) => (
                              <tr key={r.id}>
                                <td className="py-3 px-4">
                                  <div className="font-medium">{r.title}</div>
                                  <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>{r.subject}</div>
                                </td>
                                <td className="py-3 px-4">{r.teacherName}</td>
                                <td className="py-3 px-4">
                                  <span className="eval-badge eval-badge-neutral">{r.source}</span>
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {r.score} / {r.maxScore}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={r.percent >= 50 ? 'eval-badge eval-badge-pass font-mono' : 'eval-badge eval-badge-fail font-mono'}>
                                    {r.percent}%
                                  </span>
                                </td>
                                <td className="py-3 px-4" style={{ color: 'var(--eval-muted)' }}>
                                  {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <Link to={`/review/${r.id}`} className="eval-btn-secondary py-1 px-2.5 text-xs">
                                    View Review
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
