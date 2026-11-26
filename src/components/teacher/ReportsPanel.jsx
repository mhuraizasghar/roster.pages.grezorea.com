import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Printer,
  X,
  XCircle,
} from 'lucide-react';
import { api, getStoredToken } from '../../lib/api';
import { useToast } from '../Toast';

export default function ReportsPanel({ initialTarget = null }) {
  const [overview, setOverview] = useState({ assignmentReports: [], roomReports: [] });
  const [selected, setSelected] = useState(initialTarget);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [inspectStudent, setInspectStudent] = useState(null);
  const [savingGrade, setSavingGrade] = useState(false);
  const { showToast } = useToast();

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/reports/overview');
      setOverview({
        assignmentReports: res.assignmentReports || [],
        roomReports: res.roomReports || [],
      });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (target) => {
    if (!target) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const res = await api.get(
        `/api/reports/detail?type=${encodeURIComponent(target.type)}&id=${encodeURIComponent(target.id)}`
      );
      setDetail(res.report);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (initialTarget) setSelected(initialTarget);
  }, [initialTarget]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected?.type, selected?.id]);

  const handleOverrideGrade = async (studentRow, question, ans, isCorrect, customPoints) => {
    setSavingGrade(true);
    try {
      const res = await api.post('/api/reports/override-grade', {
        attemptId: studentRow.attemptId,
        answerId: ans?.id,
        questionId: question.id,
        isCorrect,
        awardedPoints: customPoints,
      });
      showToast(`Grade updated (${res.attempt.percent}%).`);
      await loadDetail(selected);
      // Update inspect modal state cleanly
      setInspectStudent((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          score: res.attempt.score,
          maxScore: res.attempt.maxScore,
          percent: res.attempt.percent,
          answers: prev.answers.map((a) =>
            a.questionId === question.id ? res.answer : a
          ),
        };
      });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selected) return;
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/reports/export.csv?type=${encodeURIComponent(selected.type)}&id=${encodeURIComponent(selected.id)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error('Failed to export CSV report.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-report-${selected.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV report downloaded.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="eval-card p-10 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
        Loading reports...
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="eval-btn-secondary text-xs py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Reports
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => window.print()} className="eval-btn-secondary text-xs py-2">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            <button type="button" onClick={handleExportCsv} className="eval-btn-primary text-xs py-2">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {loadingDetail || !detail ? (
          <div className="eval-card p-10 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
            Loading detailed analytics...
          </div>
        ) : (
          <>
            <div className="eval-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
                    {selected.type === 'room' ? 'Live Room Report' : 'Assignment Report'}
                  </div>
                  <h2 className="text-xl font-semibold mt-0.5">{detail.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 rounded-lg border text-center" style={{ borderColor: 'var(--eval-border)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Submissions</div>
                    <div className="text-lg font-bold font-mono">{detail.studentRows.length}</div>
                  </div>
                  <div className="px-4 py-2 rounded-lg border text-center" style={{ borderColor: 'var(--eval-border)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Class Average</div>
                    <div className="text-lg font-bold font-mono">
                      {detail.studentRows.length
                        ? `${Math.round(
                            (detail.studentRows.reduce((s, r) => s + r.percent, 0) / detail.studentRows.length) * 10
                          ) / 10}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Most Missed Questions */}
              {detail.mostMissed?.length > 0 && detail.studentRows.length > 0 && (
                <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--eval-border)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--status-warn)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Lowest Accuracy Questions (Review Focus)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {detail.mostMissed.map((m) => (
                      <div key={m.questionId} className="p-3 rounded-lg border text-xs space-y-1" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                        <div className="flex items-center justify-between font-semibold">
                          <span>Q{m.index}</span>
                          <span className="font-mono" style={{ color: m.accuracyPercent < 50 ? 'var(--status-fail)' : 'var(--status-warn)' }}>
                            {m.accuracyPercent}% correct
                          </span>
                        </div>
                        <p className="line-clamp-2" style={{ color: 'var(--eval-muted)' }}>{m.prompt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Question Breakdown */}
            <div className="eval-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Question Accuracy Breakdown</h3>
              <div className="space-y-3">
                {detail.questionStats.map((qs) => (
                  <div key={qs.questionId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-3">
                      <span className="font-medium truncate">
                        Q{qs.index}. {qs.prompt}
                      </span>
                      <span className="font-mono shrink-0" style={{ color: 'var(--eval-muted)' }}>
                        {qs.correctCount}/{detail.studentRows.length} ({qs.accuracyPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--eval-surface-muted)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${qs.accuracyPercent}%`,
                          backgroundColor:
                            qs.accuracyPercent >= 70
                              ? 'var(--status-pass)'
                              : qs.accuracyPercent >= 40
                                ? 'var(--status-warn)'
                                : 'var(--status-fail)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Student Results Table */}
            <div className="eval-card overflow-hidden">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--eval-border)' }}>
                <h3 className="text-sm font-semibold">Student Submissions</h3>
                <span className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                  Click &ldquo;Grade / Inspect&rdquo; to manually override short answers or points.
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead style={{ backgroundColor: 'var(--eval-bg)', color: 'var(--eval-muted)' }}>
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Student</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold">Score</th>
                      <th className="py-2.5 px-4 font-semibold">Percent</th>
                      <th className="py-2.5 px-4 font-semibold">Submitted</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
                    {detail.studentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center" style={{ color: 'var(--eval-muted)' }}>
                          No completed student submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      detail.studentRows.map((row) => (
                        <tr key={row.attemptId}>
                          <td className="py-3 px-4">
                            <div className="font-medium">{row.displayName}</div>
                            <div className="text-[11px] font-mono" style={{ color: 'var(--eval-muted)' }}>
                              {row.studentEmail}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={row.status === 'late' ? 'eval-badge eval-badge-warn' : 'eval-badge eval-badge-pass'}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {row.score} / {row.maxScore}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold">{row.percent}%</td>
                          <td className="py-3 px-4" style={{ color: 'var(--eval-muted)' }}>
                            {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectStudent(row)}
                              className="eval-btn-secondary py-1 px-2.5 text-xs"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Grade / Inspect
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Manual Grading / Inspect Modal */}
        {inspectStudent && detail && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="eval-card max-w-2xl w-full p-6 space-y-4 my-8 max-h-[88vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 pb-3 border-b" style={{ borderColor: 'var(--eval-border)' }}>
                <div>
                  <h3 className="text-base font-semibold">{inspectStudent.displayName}</h3>
                  <p className="text-xs font-mono" style={{ color: 'var(--eval-muted)' }}>
                    {inspectStudent.studentEmail} &middot; Total: {inspectStudent.score}/{inspectStudent.maxScore} ({inspectStudent.percent}%)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectStudent(null)}
                  className="eval-btn-ghost p-1"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {detail.questions.map((q, idx) => {
                  const ans = inspectStudent.answers.find((a) => a.questionId === q.id);
                  const displayResp = Array.isArray(ans?.response)
                    ? ans.response.map((i) => q.options?.[i] ?? i).join(', ')
                    : q.type === 'mcq' || q.type === 'challenge'
                      ? (q.options?.[ans?.response] ?? String(ans?.response ?? 'No answer'))
                      : String(ans?.response ?? 'No answer');

                  return (
                    <div key={q.id} className="p-4 rounded-lg border space-y-2" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-semibold">
                          Q{idx + 1}. {q.prompt}
                        </div>
                        <span className={ans?.isCorrect ? 'eval-badge eval-badge-pass shrink-0' : 'eval-badge eval-badge-fail shrink-0'}>
                          {ans?.awardedPoints ?? 0} / {q.points} pts
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                        Student response: <strong style={{ color: 'var(--eval-ink)' }}>{displayResp || '—'}</strong>
                        {ans?.gradedBy === 'teacher' && (
                          <span className="ml-2 eval-badge eval-badge-brand text-[10px]">Manual Override</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={savingGrade || !ans}
                          onClick={() => handleOverrideGrade(inspectStudent, q, ans, true, q.points)}
                          className="eval-btn-secondary py-1 px-2.5 text-[11px]"
                        >
                          <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--status-pass)' }} />
                          Mark Correct ({q.points} pts)
                        </button>
                        <button
                          type="button"
                          disabled={savingGrade || !ans}
                          onClick={() => handleOverrideGrade(inspectStudent, q, ans, false, 0)}
                          className="eval-btn-secondary py-1 px-2.5 text-[11px]"
                        >
                          <XCircle className="w-3 h-3" style={{ color: 'var(--status-fail)' }} />
                          Mark Incorrect (0 pts)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Assignments Reports */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
          Assignment Reports ({overview.assignmentReports.length})
        </h3>
        {overview.assignmentReports.length === 0 ? (
          <div className="eval-card p-6 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
            No assignments created yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.assignmentReports.map((rep) => (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelected({ type: 'assignment', id: rep.id })}
                className="eval-card eval-card-hover p-5 text-left flex items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{rep.title}</div>
                  <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                    {rep.subject} &middot; {rep.submissions} submission(s)
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono">{rep.averagePercent}%</div>
                  <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Average</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live Room Reports */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
          Ended Live Room Reports ({overview.roomReports.length})
        </h3>
        {overview.roomReports.length === 0 ? (
          <div className="eval-card p-6 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
            End a live room session to automatically record its class report and scores.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.roomReports.map((rep) => (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelected({ type: 'room', id: rep.id })}
                className="eval-card eval-card-hover p-5 text-left flex items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{rep.code}</span>
                    <span className="text-sm font-semibold truncate">{rep.title}</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                    {rep.mode.replace('_', ' ')} &middot; {rep.submissions} participant(s)
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono">{rep.averagePercent}%</div>
                  <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Average</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
