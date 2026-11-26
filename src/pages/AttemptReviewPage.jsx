import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function AttemptReviewPage() {
  const { attemptId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api.get(`/api/attempts/${encodeURIComponent(attemptId)}/review`);
        setData(res);
      } catch (err) {
        setErrorMsg(err.message || 'Could not load attempt review.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId]);

  const backPath = user?.role === 'teacher' ? '/teacher' : '/student';

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
        Loading attempt breakdown...
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="eval-card p-6 text-center space-y-4">
          <p className="text-sm font-medium">{errorMsg || 'Review not found.'}</p>
          <Link to={backPath} className="eval-btn-primary text-xs inline-flex">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { attempt, items, showAnswers } = data;
  const passed = attempt.percent >= 50;

  const formatOptionResponse = (question, val) => {
    if (val === null || val === undefined || val === '') return 'Skipped';
    if (question?.type === 'tf') {
      return val === true || val === 'true' ? 'True' : 'False';
    }
    if (question?.type === 'mcq' || question?.type === 'challenge') {
      if (Array.isArray(val)) {
        return val.map((i) => question.options?.[i] ?? String(i)).join(', ') || 'Skipped';
      }
      return question.options?.[Number(val)] ?? String(val);
    }
    return String(val);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to={backPath} className="eval-btn-secondary text-xs py-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </div>

      {/* Summary Banner */}
      <div className="eval-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="eval-badge eval-badge-brand">{attempt.subject}</span>
            <span className={attempt.status === 'late' ? 'eval-badge eval-badge-warn' : 'eval-badge eval-badge-pass'}>
              {attempt.status}
            </span>
          </div>
          <h1 className="text-2xl font-semibold">{attempt.title}</h1>
          <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
            Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '—'}
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>Score</div>
            <div className="text-lg font-bold font-mono">
              {attempt.score} / {attempt.maxScore}
            </div>
          </div>
          <div
            className="w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center"
            style={{
              borderColor: passed ? 'var(--status-pass)' : 'var(--status-fail)',
            }}
          >
            <span className="text-lg font-bold font-mono">{attempt.percent}%</span>
          </div>
        </div>
      </div>

      {!showAnswers && (
        <div className="eval-card p-4 text-xs" style={{ color: 'var(--eval-muted)' }}>
          Your instructor configured this assignment to hide answer keys and per-question correctness after submission.
        </div>
      )}

      {/* Per-Question Breakdown */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const q = item.question;
          if (!q) return null;
          return (
            <div key={q.id} className="eval-card p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">
                  Q{idx + 1}. {q.prompt}
                </div>
                {showAnswers ? (
                  <span className={item.isCorrect ? 'eval-badge eval-badge-pass shrink-0' : 'eval-badge eval-badge-fail shrink-0'}>
                    {item.isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {item.awardedPoints} / {q.points} pts
                  </span>
                ) : (
                  <span className="eval-badge eval-badge-neutral shrink-0">
                    <HelpCircle className="w-3.5 h-3.5" /> Recorded
                  </span>
                )}
              </div>

              <div className="text-xs space-y-1" style={{ color: 'var(--eval-muted)' }}>
                <div>
                  Your answer:{' '}
                  <strong style={{ color: 'var(--eval-ink)' }}>
                    {formatOptionResponse(q, item.response)}
                  </strong>
                </div>
                {showAnswers && q.correctAnswer !== undefined && q.correctAnswer !== null && (
                  <div>
                    Accepted answer:{' '}
                    <strong style={{ color: 'var(--status-pass)' }}>
                      {q.type === 'short_answer'
                        ? (q.acceptedAnswers?.join(', ') || String(q.correctAnswer))
                        : formatOptionResponse(q, q.correctAnswer)}
                    </strong>
                  </div>
                )}
                {showAnswers && q.explanation && (
                  <div className="pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--eval-border)' }}>
                    <strong>Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
