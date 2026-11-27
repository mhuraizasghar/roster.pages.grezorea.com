import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Save,
  Send,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

export default function AttemptRunnerPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answersMap, setAnswersMap] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [savingState, setSavingState] = useState('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const answersRef = useRef({});
  answersRef.current = answersMap;
  const submittedOnceRef = useRef(false);
  const saveTimersRef = useRef(new Map());

  useEffect(() => () => {
    saveTimersRef.current.forEach((timer) => clearTimeout(timer));
    saveTimersRef.current.clear();
  }, []);

  useEffect(() => {
    async function startOrResume() {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await api.post('/api/attempts/start', { assignmentId });
        setAttempt(res.attempt);
        setQuestions(res.questions || []);
        const initMap = {};
        (res.attempt.answers || []).forEach((a) => {
          initMap[a.questionId] = a.response;
        });
        setAnswersMap(initMap);
      } catch (err) {
        setErrorMsg(err.message || 'Cannot open this assignment.');
      } finally {
        setLoading(false);
      }
    }
    startOrResume();
  }, [assignmentId]);

  const handleFinalSubmit = useCallback(async () => {
    if (!attempt || submittedOnceRef.current) return;
    submittedOnceRef.current = true;
    setSubmitting(true);
    saveTimersRef.current.forEach((timer) => clearTimeout(timer));
    saveTimersRef.current.clear();
    try {
      await api.post(`/api/attempts/${attempt.id}/submit`, {
        answers: answersRef.current,
      });
      showToast('Assessment submitted!');
      navigate(`/review/${attempt.id}`, { replace: true });
    } catch (err) {
      submittedOnceRef.current = false;
      showToast(err.message, 'error');
      setSubmitting(false);
    }
  }, [attempt, navigate, showToast]);

  // Countdown timer when timeLimitMin > 0
  useEffect(() => {
    if (!attempt || !attempt.timeLimitMin) {
      setSecondsLeft(null);
      return;
    }
    const deadlineMs = new Date(attempt.startedAt).getTime() + attempt.timeLimitMin * 60_000;
    const tick = () => {
      const rem = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem === 0 && !submittedOnceRef.current) {
        showToast('Time expired — submitting your attempt automatically.', 'info');
        handleFinalSubmit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt, handleFinalSubmit, showToast]);

  const saveAnswer = async (questionId, value) => {
    setAnswersMap((prev) => ({ ...prev, [questionId]: value }));
    if (!attempt) return;
    setSavingState('saving');
    const existing = saveTimersRef.current.get(questionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      saveTimersRef.current.delete(questionId);
      try {
        await api.put(`/api/attempts/${attempt.id}/answer`, { questionId, response: value });
        if (!saveTimersRef.current.size) setSavingState('saved');
      } catch { setSavingState('error'); }
    }, 500);
    saveTimersRef.current.set(questionId, timer);
  };

  const toggleMultiOption = (questionId, optIdx) => {
    const prev = Array.isArray(answersMap[questionId]) ? answersMap[questionId] : [];
    const next = prev.includes(optIdx)
      ? prev.filter((x) => x !== optIdx)
      : [...prev, optIdx];
    saveAnswer(questionId, next);
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
        Preparing your assignment attempt...
      </div>
    );
  }

  if (errorMsg || !attempt) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="eval-card p-6 sm:p-8 text-center space-y-4">
          <AlertCircle className="w-8 h-8 mx-auto" style={{ color: 'var(--status-fail)' }} />
          <h1 className="text-lg font-semibold">Assignment Unavailable</h1>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            {errorMsg}
          </p>
          <Link to="/student" className="eval-btn-primary text-xs inline-flex">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const answeredCount = questions.filter((q) => {
    const v = answersMap[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '';
  }).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Status Bar */}
      <div className="eval-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
            {attempt.subject}
          </div>
          <h1 className="text-lg font-semibold">{attempt.title}</h1>
          <div className="text-xs flex items-center gap-3 mt-0.5" style={{ color: 'var(--eval-muted)' }}>
            <span>
              Answered: <strong className="font-mono">{answeredCount}/{questions.length}</strong>
            </span>
            <span>&middot;</span>
            <span className="inline-flex items-center gap-1">
              <Save className="w-3 h-3" />
              {savingState === 'saving'
                ? 'Saving...'
                : savingState === 'error'
                  ? 'Save warning'
                  : 'Progress saved'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {secondsLeft !== null && (
            <div
              className={
                secondsLeft <= 60
                  ? 'eval-badge eval-badge-fail font-mono text-sm py-1.5 px-3'
                  : 'eval-badge eval-badge-warn font-mono text-sm py-1.5 px-3'
              }
            >
              <Clock className="w-4 h-4" />
              {formatTimer(secondsLeft)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="eval-btn-primary text-xs"
          >
            <Send className="w-3.5 h-3.5" /> Submit Quiz
          </button>
        </div>
      </div>

      {/* Question Navigator Pills */}
      <div className="eval-card p-3 flex flex-wrap items-center gap-1.5" role="navigation" aria-label="Question navigator">
        {questions.map((q, idx) => {
          const v = answersMap[q.id];
          const isAnswered = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
          const isActive = idx === currentIdx;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIdx(idx)}
              className="w-8 h-8 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{
                borderColor: isActive ? 'var(--eval-accent)' : 'var(--eval-border)',
                backgroundColor: isActive
                  ? 'var(--eval-accent)'
                  : isAnswered
                    ? 'var(--status-pass-soft)'
                    : 'var(--eval-bg)',
                color: isActive ? '#f2f4f3' : 'var(--eval-ink)',
              }}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Current Question Card */}
      {currentQ && (
        <div className="eval-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <span className="eval-badge eval-badge-brand font-mono">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--eval-muted)' }}>
              {currentQ.points} pt(s)
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-semibold leading-snug">{currentQ.prompt}</h2>

          {currentQ.multiSelect && (
            <p className="text-xs font-medium" style={{ color: 'var(--eval-accent)' }}>
              Multiple correct options — select all that apply.
            </p>
          )}

          {currentQ.type === 'tf' ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { val: true, label: 'True' },
                { val: false, label: 'False' },
              ].map((opt) => {
                const chosen = answersMap[currentQ.id] === opt.val;
                return (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => saveAnswer(currentQ.id, opt.val)}
                    className="p-4 rounded-xl border text-sm font-semibold transition-all text-center"
                    style={{
                      borderColor: chosen ? 'var(--eval-accent)' : 'var(--eval-border-strong)',
                      backgroundColor: chosen ? 'var(--eval-accent-soft)' : 'var(--eval-bg)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : currentQ.type === 'short_answer' ? (
            <div>
              <label htmlFor="attemptShortAnswer" className="block text-xs font-medium mb-1.5">
                Your Answer
              </label>
              <input
                id="attemptShortAnswer"
                type="text"
                className="eval-input text-sm"
                value={String(answersMap[currentQ.id] ?? '')}
                onChange={(e) => saveAnswer(currentQ.id, e.target.value)}
                placeholder="Type your response..."
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {(currentQ.options || []).map((opt, idx) => {
                const curVal = answersMap[currentQ.id];
                const chosen = currentQ.multiSelect
                  ? Array.isArray(curVal) && curVal.includes(idx)
                  : curVal !== undefined && curVal !== null && curVal !== '' && Number(curVal) === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      currentQ.multiSelect
                        ? toggleMultiOption(currentQ.id, idx)
                        : saveAnswer(currentQ.id, idx)
                    }
                    className="w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-3"
                    style={{
                      borderColor: chosen ? 'var(--eval-accent)' : 'var(--eval-border-strong)',
                      backgroundColor: chosen ? 'var(--eval-accent-soft)' : 'var(--eval-bg)',
                    }}
                  >
                    <span className="w-6 h-6 rounded-md border flex items-center justify-center text-xs font-mono shrink-0" style={{ borderColor: 'var(--eval-border-strong)' }}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Question Footer Navigation */}
          <div className="pt-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--eval-border)' }}>
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="eval-btn-secondary text-xs"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="eval-btn-primary text-xs"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="eval-btn-primary text-xs"
              >
                <CheckCircle2 className="w-4 h-4" /> Review &amp; Submit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="eval-card max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-semibold">Submit Your Assignment?</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
              You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> question(s).
              {answeredCount < questions.length && (
                <> Unanswered questions ({questions.length - answeredCount}) will receive 0 points.</>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="eval-btn-secondary text-xs"
              >
                Keep Working
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="eval-btn-primary text-xs"
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
