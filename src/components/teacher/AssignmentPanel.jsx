import React, { useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

/**
 * Modal for assigning a quiz (creates an immutable quiz_version snapshot).
 */
export function AssignQuizModal({ quiz, groups = [], rosterEntries = [], onClose, onAssigned }) {
  const [title, setTitle] = useState(quiz?.title || '');
  const [targetType, setTargetType] = useState('all_roster');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [dueAt, setDueAt] = useState('');
  const [timeLimitMin, setTimeLimitMin] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [showAnswersAfterSubmit, setShowAnswersAfterSubmit] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [allowSaveProgress, setAllowSaveProgress] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState(null);
  const { showToast } = useToast();

  if (!quiz) return null;

  const toggleGroup = (id) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleEmail = (email) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((x) => x !== email) : [...prev, email]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (targetType === 'groups' && selectedGroupIds.length === 0) {
      showToast('Select at least one group.', 'warning');
      return;
    }
    if (targetType === 'students' && selectedEmails.length === 0) {
      showToast('Select at least one student.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/assignments', {
        quizId: quiz.id,
        title: title.trim() || quiz.title,
        targetType,
        targetGroupIds: targetType === 'groups' ? selectedGroupIds : [],
        targetEmails: targetType === 'students' ? selectedEmails : [],
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        settings: {
          timeLimitMin: Math.max(0, Number(timeLimitMin || 0)),
          maxAttempts: Math.max(0, Number(maxAttempts ?? 1)),
          showAnswersAfterSubmit,
          shuffleQuestions,
          allowSaveProgress,
        },
      });
      setSnapshotInfo(res.snapshot);
      showToast('Assignment published with an immutable quiz snapshot.');
      onAssigned?.(res.assignment);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="eval-card max-w-xl w-full p-6 space-y-5 my-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
              Assign Self-Paced Quiz
            </div>
            <h2 className="text-lg font-semibold mt-0.5">{quiz.title}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--eval-muted)' }}>
              {(quiz.draftQuestions || []).length} question(s) &middot; Creating an assignment freezes a snapshot so later draft edits stay safe.
            </p>
          </div>
          <button type="button" onClick={onClose} className="eval-btn-ghost p-1.5" aria-label="Close modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        {snapshotInfo ? (
          <div className="space-y-4">
            <div
              className="p-4 rounded-lg border space-y-2"
              style={{
                backgroundColor: 'var(--status-pass-soft)',
                borderColor: 'var(--status-pass)',
              }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-pass)' }} />
                Assignment Active & Snapshot Locked
              </div>
              <p className="text-xs" style={{ color: 'var(--eval-ink)' }}>
                Snapshot <code className="font-mono">{snapshotInfo.id}</code> (v{snapshotInfo.versionNumber}) was captured with{' '}
                <strong>{snapshotInfo.questions?.length || 0}</strong> question(s). Only targeted students on your roster can access it.
              </p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="eval-btn-primary text-xs">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="asgTitle" className="block text-xs font-medium mb-1">
                Assignment Title
              </label>
              <input
                id="asgTitle"
                className="eval-input text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Audience Target */}
            <div className="space-y-2">
              <span className="block text-xs font-medium">Assign To</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all_roster', label: 'Entire Roster' },
                  { id: 'groups', label: 'Class Groups' },
                  { id: 'students', label: 'Specific Students' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTargetType(opt.id)}
                    className={
                      targetType === opt.id
                        ? 'eval-btn-primary py-2 text-xs'
                        : 'eval-btn-secondary py-2 text-xs'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {targetType === 'groups' && (
                <div className="p-3 rounded-lg border max-h-40 overflow-y-auto space-y-1.5" style={{ borderColor: 'var(--eval-border)' }}>
                  {groups.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                      No groups created yet. Create class groups in the Roster tab.
                    </p>
                  ) : (
                    groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                        />
                        <span className="font-medium">{g.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}

              {targetType === 'students' && (
                <div className="p-3 rounded-lg border max-h-40 overflow-y-auto space-y-1.5" style={{ borderColor: 'var(--eval-border)' }}>
                  {rosterEntries.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                      No students on your roster yet.
                    </p>
                  ) : (
                    rosterEntries.map((entry) => (
                      <label key={entry.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEmails.includes(entry.studentEmail)}
                          onChange={() => toggleEmail(entry.studentEmail)}
                        />
                        <span className="font-medium">{entry.displayName || entry.studentEmail}</span>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--eval-muted)' }}>
                          ({entry.studentEmail})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Timing & Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="asgDue" className="block text-xs font-medium mb-1">
                  Due Date (optional)
                </label>
                <input
                  id="asgDue"
                  type="datetime-local"
                  className="eval-input text-xs"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="asgLimit" className="block text-xs font-medium mb-1">
                  Time Limit (min, 0 = none)
                </label>
                <input
                  id="asgLimit"
                  type="number"
                  min="0"
                  className="eval-input text-xs"
                  value={timeLimitMin}
                  onChange={(e) => setTimeLimitMin(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="asgAttempts" className="block text-xs font-medium mb-1">
                  Max Attempts (0 = unlimited)
                </label>
                <input
                  id="asgAttempts"
                  type="number"
                  min="0"
                  className="eval-input text-xs"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="p-3.5 rounded-lg border space-y-2 text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAnswersAfterSubmit}
                  onChange={(e) => setShowAnswersAfterSubmit(e.target.checked)}
                />
                Show correct answers and explanations after submission
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                />
                Shuffle question order per student attempt
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSaveProgress}
                  onChange={(e) => setAllowSaveProgress(e.target.checked)}
                />
                Allow students to save progress and resume across devices
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="eval-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="eval-btn-primary text-xs">
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Publishing...' : 'Publish Assignment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Assignments overview & per-student override manager for Teacher Workspace.
 */
export default function AssignmentPanel({ assignments = [], onRefresh }) {
  const [expandedId, setExpandedId] = useState(assignments[0]?.id || null);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [extendedDueAt, setExtendedDueAt] = useState('');
  const [extraAttempts, setExtraAttempts] = useState(1);
  const [reopened, setReopened] = useState(true);
  const [savingOverride, setSavingOverride] = useState(false);
  const { showToast } = useToast();

  const openOverride = (assignmentId, studentStatus) => {
    setOverrideTarget({ assignmentId, studentStatus });
    const existingDue = studentStatus.override?.extendedDueAt;
    setExtendedDueAt(existingDue ? existingDue.slice(0, 16) : '');
    setExtraAttempts(studentStatus.override?.extraAttempts ?? 1);
    setReopened(studentStatus.override?.reopened ?? true);
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideTarget) return;
    setSavingOverride(true);
    try {
      await api.post(`/api/assignments/${overrideTarget.assignmentId}/override`, {
        studentEmail: overrideTarget.studentStatus.studentEmail,
        extendedDueAt: extendedDueAt ? new Date(extendedDueAt).toISOString() : null,
        extraAttempts: Math.max(0, Number(extraAttempts || 0)),
        reopened,
      });
      showToast(`Updated access override for ${overrideTarget.studentStatus.displayName}.`);
      setOverrideTarget(null);
      onRefresh?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingOverride(false);
    }
  };

  const statusBadge = (status) => {
    if (status === 'submitted') return 'eval-badge eval-badge-pass';
    if (status === 'late') return 'eval-badge eval-badge-warn';
    if (status === 'in_progress') return 'eval-badge eval-badge-brand';
    return 'eval-badge eval-badge-neutral';
  };

  if (assignments.length === 0) {
    return (
      <div className="eval-card p-10 text-center space-y-2">
        <CalendarClock className="w-6 h-6 mx-auto" style={{ color: 'var(--eval-muted)' }} />
        <h3 className="text-sm font-semibold">No assignments published yet</h3>
        <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--eval-muted)' }}>
          Open any quiz in your Library and click <strong>Assign</strong> to freeze a snapshot and distribute it to your roster or groups.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assignments.map((asg) => {
        const isExpanded = expandedId === asg.id;
        const completedCount = (asg.studentStatuses || []).filter(
          (s) => s.status === 'submitted' || s.status === 'late'
        ).length;
        return (
          <div key={asg.id} className="eval-card overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{asg.title}</h3>
                  <span className="eval-badge eval-badge-brand">{asg.subject}</span>
                  <span className="eval-badge eval-badge-neutral font-mono">
                    {asg.questionsCount} Qs
                  </span>
                  <span className="eval-badge eval-badge-neutral">
                    <Lock className="w-3 h-3" /> Snapshot
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--eval-muted)' }}>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {completedCount}/{(asg.studentStatuses || []).length} submitted
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {asg.dueAt ? `Due ${new Date(asg.dueAt).toLocaleString()}` : 'No due date'}
                  </span>
                  <span>
                    Max attempts: {asg.settings?.maxAttempts ? asg.settings.maxAttempts : 'Unlimited'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : asg.id)}
                className="eval-btn-secondary text-xs py-1.5 px-3"
              >
                {isExpanded ? 'Hide Roster Progress' : 'View Student Progress'}
              </button>
            </div>

            {isExpanded && (
              <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--eval-border)' }}>
                <table className="w-full text-left text-xs">
                  <thead style={{ backgroundColor: 'var(--eval-bg)', color: 'var(--eval-muted)' }}>
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Student</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold">Attempts</th>
                      <th className="py-2.5 px-4 font-semibold">Best Score</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Overrides</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
                    {(asg.studentStatuses || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center" style={{ color: 'var(--eval-muted)' }}>
                          No targeted roster students match this assignment yet.
                        </td>
                      </tr>
                    ) : (
                      asg.studentStatuses.map((st) => (
                        <tr key={st.studentEmail}>
                          <td className="py-2.5 px-4">
                            <div className="font-medium">{st.displayName}</div>
                            <div className="text-[11px] font-mono" style={{ color: 'var(--eval-muted)' }}>
                              {st.studentEmail}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={statusBadge(st.status)}>
                              {st.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono">{st.attemptsCount}</td>
                          <td className="py-2.5 px-4 font-mono">
                            {st.bestPercent !== null ? `${st.bestPercent}%` : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openOverride(asg.id, st)}
                              className="eval-btn-ghost py-1 px-2.5 text-xs"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              {st.override ? 'Edit Override' : 'Grant Extension'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Per-Student Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveOverride} className="eval-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Student Access Override</h3>
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="eval-btn-ghost p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
              Grant individual extensions or extra attempts for{' '}
              <strong style={{ color: 'var(--eval-ink)' }}>{overrideTarget.studentStatus.displayName}</strong>{' '}
              ({overrideTarget.studentStatus.studentEmail}).
            </p>
            <div>
              <label htmlFor="ovDue" className="block text-xs font-medium mb-1">
                Extended Due Date
              </label>
              <input
                id="ovDue"
                type="datetime-local"
                className="eval-input text-xs"
                value={extendedDueAt}
                onChange={(e) => setExtendedDueAt(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ovAttempts" className="block text-xs font-medium mb-1">
                Extra Attempts
              </label>
              <input
                id="ovAttempts"
                type="number"
                min="0"
                className="eval-input text-xs"
                value={extraAttempts}
                onChange={(e) => setExtraAttempts(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={reopened}
                onChange={(e) => setReopened(e.target.checked)}
              />
              Reopen assignment immediately for one new attempt
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOverrideTarget(null)} className="eval-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={savingOverride} className="eval-btn-primary text-xs">
                {savingOverride ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
