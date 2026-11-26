import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  LogOut,
  Send,
  Trophy,
  Users,
  Wifi,
  XCircle,
} from 'lucide-react';
import { api, connectRoomSocket } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function GoogleBrandIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
    </svg>
  );
}

export default function LiveRoomStudentPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joinError, setJoinError] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [studentIdx, setStudentIdx] = useState(0);
  const [draftResponse, setDraftResponse] = useState('');
  const [draftMulti, setDraftMulti] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [joinRequested, setJoinRequested] = useState(false);
  const [studentName, setStudentName] = useState(() => {
    try {
      return localStorage.getItem('roster.live.studentName') || '';
    } catch {
      return '';
    }
  });

  const syncState = useCallback(async () => {
    try {
      const res = await api.get(`/api/rooms/${encodeURIComponent(code)}/state`);
      setRoom(res.room);
    } catch {
      // Handled by joinError on initial load
    }
  }, [code]);

  useEffect(() => {
    let cleanupSocket = () => {};
    let pollTimer = null;

    async function init() {
      setLoading(true);
      setJoinError('');
      if (!joinRequested) {
        setLoading(false);
        return;
      }
      const joinName = (studentName || user?.displayName || '').trim();
      if (!joinName) {
        setJoinError('Enter your name to join this room.');
        setLoading(false);
        return;
      }
      try {
        localStorage.setItem('roster.live.studentName', joinName);
        const res = await api.post(`/api/rooms/${encodeURIComponent(code)}/join`, { studentName: joinName });
        setRoom(res.room);
        cleanupSocket = connectRoomSocket(code, {
          onUpdate: (nextRoom) => setRoom(nextRoom),
          onEnded: (nextRoom) => {
            setRoom(nextRoom);
            showToast('The teacher ended this live session.', 'info');
          },
          onStatusChange: (st) => setWsStatus(st),
        });
        pollTimer = setInterval(syncState, 8000);
      } catch (err) {
        setJoinError(err.message || 'Could not join this live room.');
      } finally {
        setLoading(false);
      }
    }

    init();
    return () => {
      cleanupSocket();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [code, showToast, syncState, studentName, user?.displayName, joinRequested]);

  const activeIdx = room?.mode === 'student_paced' ? studentIdx : (room?.currentQuestionIdx || 0);
  const currentQ = room?.questions?.[activeIdx] || null;

  // Reset local draft when active question changes
  useEffect(() => {
    setDraftResponse('');
    setDraftMulti([]);
  }, [currentQ?.id]);

  // Challenge mode countdown timer
  useEffect(() => {
    if (!room || room.mode !== 'challenge' || room.status !== 'active' || !currentQ || !room.questionStartedAt) {
      setSecondsLeft(null);
      return;
    }
    const limit = Math.max(5, Number(currentQ.timeLimitSec || 20));
    const startMs = new Date(room.questionStartedAt).getTime();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      setSecondsLeft(Math.max(0, limit - elapsed));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [room?.mode, room?.status, room?.questionStartedAt, currentQ?.id, currentQ?.timeLimitSec]);

  const handleLeave = () => {
    if (window.confirm('Leave this live classroom?')) {
      navigate('/student');
    }
  };

  const toggleMultiOption = (idx) => {
    setDraftMulti((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
    );
  };

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    if (!currentQ) return;

    let responsePayload = draftResponse;
    if (currentQ.type === 'mcq' || currentQ.type === 'challenge') {
      if (currentQ.multiSelect) {
        if (draftMulti.length === 0) {
          showToast('Select at least one option before submitting.', 'warning');
          return;
        }
        responsePayload = draftMulti;
      } else if (draftResponse === '' || draftResponse === null) {
        showToast('Choose an option first.', 'warning');
        return;
      } else {
        responsePayload = Number(draftResponse);
      }
    } else if (currentQ.type === 'tf') {
      if (draftResponse !== true && draftResponse !== false) {
        showToast('Select True or False first.', 'warning');
        return;
      }
      responsePayload = draftResponse;
    } else if (!String(draftResponse || '').trim()) {
      showToast('Type your answer before submitting.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/rooms/${encodeURIComponent(code)}/answer`, {
        questionIndex: activeIdx,
        response: responsePayload,
      });
      setRoom(res.room);
      if (res.feedback) {
        setFeedbackMap((prev) => ({ ...prev, [currentQ.id]: res.feedback }));
      }
      showToast('Answer submitted!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
        Connecting to live classroom {code}...
      </div>
    );
  }

  if (!joinRequested && !room) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="eval-card p-6 sm:p-8 text-center space-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>Live Classroom</div>
            <h1 className="text-xl sm:text-2xl font-semibold mt-1">Join Room {code}</h1>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!studentName.trim()) {
                showToast('Enter your name to join.', 'warning');
                return;
              }
              setJoinError('');
              setLoading(true);
              setJoinRequested(true);
            }}
            className="space-y-3 text-left"
          >
            <label className="block text-xs font-medium">Your Name</label>
            <input
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Enter your name"
              className="eval-input text-sm"
              maxLength={80}
              autoFocus
              required
            />
            <button type="submit" className="eval-btn-primary w-full text-xs">Continue with Name</button>
            <button
              type="button"
              onClick={async () => {
                if (!isSupabaseConfigured || !supabase) {
                  showToast('Google sign-in is not configured.', 'error');
                  return;
                }
                sessionStorage.setItem('googleAuthPortalRole', 'student');
                sessionStorage.setItem('googleAuthNext', `/room/${code}`);
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: `${window.location.origin}/auth/callback` },
                });
                if (error) showToast(error.message || 'Could not start Google sign-in.', 'error');
              }}
              className="eval-btn-secondary w-full text-xs"
            >
              <GoogleBrandIcon /> Continue with Google
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (joinError || !room) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="eval-card p-6 sm:p-8 text-center space-y-4">
          <AlertCircle className="w-8 h-8 mx-auto" style={{ color: 'var(--status-fail)' }} />
          <h1 className="text-lg font-semibold">Unable to Join Room {code}</h1>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
            {joinError || 'Room could not be loaded.'}
          </p>
          <Link to="/" className="eval-btn-secondary text-xs inline-flex">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const myResponses = room.myResponses || {};
  const myParticipant = (room.participants || []).find((p) => p.studentId === user?.id);
  const mySaved = currentQ ? myResponses[currentQ.id] : null;
  const myFeedback = currentQ ? feedbackMap[currentQ.id] : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Room Header */}
      <div className="eval-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wider px-2 py-0.5 rounded bg-[var(--eval-accent-soft)]" style={{ color: 'var(--eval-accent)' }}>
              {room.code}
            </span>
            <h1 className="text-base font-semibold">{room.title}</h1>
            <span className={room.status === 'active' ? 'eval-badge eval-badge-pass' : room.status === 'ended' ? 'eval-badge eval-badge-neutral' : 'eval-badge eval-badge-warn'}>
              {room.status}
            </span>
          </div>
          <div className="text-xs flex flex-wrap items-center gap-3" style={{ color: 'var(--eval-muted)' }}>
            <span>{room.teacherName}</span>
            <span>&middot;</span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {room.participantsCount} joined
            </span>
            <span>&middot;</span>
            <span className="inline-flex items-center gap-1">
              <Wifi className="w-3 h-3" style={{ color: wsStatus === 'connected' ? 'var(--status-pass)' : 'var(--status-warn)' }} />
              {wsStatus === 'connected' ? 'Live' : 'Reconnecting'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {myParticipant && (
            <span className="eval-badge eval-badge-brand font-mono">
              {myParticipant.totalScore || 0} pts
            </span>
          )}
          <button type="button" onClick={handleLeave} className="eval-btn-secondary py-1.5 px-3 text-xs">
            <LogOut className="w-3.5 h-3.5" /> Leave
          </button>
        </div>
      </div>

      {/* Lobby View */}
      {room.status === 'lobby' && (
        <div className="eval-card p-10 text-center space-y-3">
          <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center border" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)', color: 'var(--eval-accent)' }}>
            <Clock className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold">You&apos;re in! Waiting for instructor to start...</h2>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--eval-muted)' }}>
            Keep this tab open. Questions will appear automatically as soon as <strong>{room.teacherName}</strong> launches the session.
          </p>
        </div>
      )}

      {/* Active Question View */}
      {room.status === 'active' && currentQ && (
        <div className="space-y-4">
          {/* Student-Paced Navigator */}
          {room.mode === 'student_paced' && room.questions.length > 1 && (
            <div className="eval-card p-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={studentIdx <= 0}
                onClick={() => setStudentIdx((i) => Math.max(0, i - 1))}
                className="eval-btn-secondary py-1.5 px-3 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                {room.questions.map((q, idx) => {
                  const answered = Boolean(myResponses[q.id]);
                  const active = idx === studentIdx;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setStudentIdx(idx)}
                      className="w-7 h-7 rounded-md text-xs font-mono font-semibold border transition-all"
                      style={{
                        borderColor: active ? 'var(--eval-accent)' : 'var(--eval-border)',
                        backgroundColor: active
                          ? 'var(--eval-accent)'
                          : answered
                            ? 'var(--status-pass-soft)'
                            : 'var(--eval-bg)',
                        color: active ? '#f2f4f3' : 'var(--eval-ink)',
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={studentIdx >= room.questions.length - 1}
                onClick={() => setStudentIdx((i) => Math.min(room.questions.length - 1, i + 1))}
                className="eval-btn-secondary py-1.5 px-3 text-xs"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Question Card */}
          <form onSubmit={handleSubmitAnswer} className="eval-card p-5 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eval-badge eval-badge-brand font-mono">
                Question {activeIdx + 1} of {room.questions.length}
              </span>
              <div className="flex items-center gap-2">
                {secondsLeft !== null && (
                  <span
                    className={
                      secondsLeft <= 5
                        ? 'eval-badge eval-badge-fail font-mono'
                        : 'eval-badge eval-badge-warn font-mono'
                    }
                  >
                    <Clock className="w-3 h-3" /> {secondsLeft}s
                  </span>
                )}
                <span className="text-xs font-mono" style={{ color: 'var(--eval-muted)' }}>
                  {currentQ.points} pt(s)
                </span>
              </div>
            </div>

            <h2 className="text-lg sm:text-xl font-semibold leading-snug">{currentQ.prompt}</h2>

            {currentQ.multiSelect && !mySaved && (
              <p className="text-xs font-medium" style={{ color: 'var(--eval-accent)' }}>
                Select all answers that apply.
              </p>
            )}

            {/* Answer Inputs */}
            {currentQ.type === 'tf' ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: true, label: 'True' },
                  { val: false, label: 'False' },
                ].map((opt) => {
                  const chosen = mySaved
                    ? mySaved.response === opt.val
                    : draftResponse === opt.val;
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      disabled={Boolean(mySaved)}
                      onClick={() => setDraftResponse(opt.val)}
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
                <label htmlFor="liveShortAnswer" className="block text-xs font-medium mb-1.5">
                  Your Answer
                </label>
                <input
                  id="liveShortAnswer"
                  type="text"
                  disabled={Boolean(mySaved)}
                  className="eval-input text-sm"
                  value={mySaved ? String(mySaved.response ?? '') : draftResponse}
                  onChange={(e) => setDraftResponse(e.target.value)}
                  placeholder="Type your response here..."
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                {(currentQ.options || []).map((opt, idx) => {
                  const chosen = mySaved
                    ? Array.isArray(mySaved.response)
                      ? mySaved.response.includes(idx)
                      : Number(mySaved.response) === idx
                    : currentQ.multiSelect
                      ? draftMulti.includes(idx)
                      : draftResponse !== '' && Number(draftResponse) === idx;

                  const revealedCorrect =
                    room.revealedCurrent &&
                    (Array.isArray(currentQ.correctAnswer)
                      ? currentQ.correctAnswer.includes(idx)
                      : Number(currentQ.correctAnswer) === idx);

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={Boolean(mySaved)}
                      onClick={() =>
                        currentQ.multiSelect ? toggleMultiOption(idx) : setDraftResponse(idx)
                      }
                      className="w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-3"
                      style={{
                        borderColor: revealedCorrect
                          ? 'var(--status-pass)'
                          : chosen
                            ? 'var(--eval-accent)'
                            : 'var(--eval-border-strong)',
                        backgroundColor: revealedCorrect
                          ? 'var(--status-pass-soft)'
                          : chosen
                            ? 'var(--eval-accent-soft)'
                            : 'var(--eval-bg)',
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

            {/* Submit or Locked Banner */}
            {mySaved ? (
              <div className="p-4 rounded-xl border space-y-2" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5" style={{ color: 'var(--eval-accent)' }} />
                  Answer locked for Question {activeIdx + 1}
                </div>
                {(myFeedback || room.revealedCurrent) && (
                  <div className="text-xs space-y-1">
                    {mySaved.isCorrect !== null && (
                      <div className="font-semibold flex items-center gap-1.5" style={{ color: mySaved.isCorrect ? 'var(--status-pass)' : 'var(--status-fail)' }}>
                        {mySaved.isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {mySaved.isCorrect
                          ? `Correct (+${mySaved.awardedPoints} pts)`
                          : 'Incorrect (0 pts)'}
                      </div>
                    )}
                    {(myFeedback?.explanation || currentQ.explanation) && (
                      <p style={{ color: 'var(--eval-muted)' }}>
                        {myFeedback?.explanation || currentQ.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-end">
                <button type="submit" disabled={submitting} className="eval-btn-primary w-full sm:w-auto">
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Answer'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Ended Session Summary */}
      {room.status === 'ended' && (
        <div className="space-y-5">
          <div className="eval-card p-6 sm:p-8 text-center space-y-3">
            <Trophy className="w-8 h-8 mx-auto" style={{ color: 'var(--eval-accent)' }} />
            <h2 className="text-xl font-semibold">Live Session Complete</h2>
            <p className="text-sm">
              Final Score: <strong className="font-mono">{myParticipant?.totalScore || 0} pts</strong>
            </p>
            <div className="pt-2">
              <Link to="/student" className="eval-btn-primary text-xs inline-flex">
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Student Dashboard
              </Link>
            </div>
          </div>

          {/* Question Review */}
          <div className="eval-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Session Question Review</h3>
            <div className="space-y-3">
              {(room.questions || []).map((q, idx) => {
                const mine = myResponses[q.id];
                return (
                  <div key={q.id} className="p-4 rounded-lg border space-y-1.5 text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        Q{idx + 1}. {q.prompt}
                      </span>
                      <span className={mine?.isCorrect ? 'eval-badge eval-badge-pass shrink-0' : 'eval-badge eval-badge-fail shrink-0'}>
                        {mine?.awardedPoints ?? 0} pts
                      </span>
                    </div>
                    {q.explanation && (
                      <p style={{ color: 'var(--eval-muted)' }}>{q.explanation}</p>
                    )}
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
