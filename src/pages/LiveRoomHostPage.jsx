import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Play,
  QrCode,
  Square,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import { api, connectRoomSocket } from '../lib/api';
import { useToast } from '../components/Toast';

export default function LiveRoomHostPage() {
  const { code } = useParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [qrUrl, setQrUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [ending, setEnding] = useState(false);
  const { showToast } = useToast();

  const fetchState = useCallback(async () => {
    try {
      const res = await api.get(`/api/rooms/${encodeURIComponent(code)}/state`);
      setRoom(res.room);
    } catch (err) {
      showToast(err.message || 'Could not load room.', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, showToast]);

  useEffect(() => {
    fetchState();
    const joinUrl = `${window.location.origin}/room/${code}`;
    QRCode.toDataURL(joinUrl, { width: 220, margin: 1 })
      .then(setQrUrl)
      .catch(() => {});

    const disconnect = connectRoomSocket(code, {
      onUpdate: (nextRoom) => setRoom(nextRoom),
      onEnded: (nextRoom) => {
        setRoom(nextRoom);
        showToast('Live room session ended and results recorded.', 'info');
      },
      onStatusChange: (status) => setWsStatus(status),
    });

    // Backup poll if socket is reconnecting
    const poll = setInterval(() => {
      if (wsStatus !== 'connected') fetchState();
    }, 6000);

    return () => {
      disconnect();
      clearInterval(poll);
    };
  }, [code, fetchState]);

  const navigateQuestion = async (index) => {
    try {
      const res = await api.post(`/api/rooms/${encodeURIComponent(code)}/navigate`, {
        questionIndex: index,
      });
      setRoom(res.room);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleReveal = async () => {
    if (!room) return;
    try {
      const res = await api.post(`/api/rooms/${encodeURIComponent(code)}/reveal`, {
        revealed: !room.revealedCurrent,
      });
      setRoom(res.room);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEndSession = async () => {
    if (!window.confirm('End this live room and save all student scores to Reports?')) return;
    setEnding(true);
    try {
      const res = await api.post(`/api/rooms/${encodeURIComponent(code)}/end`, {});
      setRoom(res.room);
      showToast('Session ended and results saved.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setEnding(false);
    }
  };

  const copyJoinUrl = async () => {
    const url = `${window.location.origin}/room/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Copied student join link.');
    } catch {
      showToast(`Room code: ${code}`, 'info');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-sm" style={{ color: 'var(--eval-muted)' }}>
        Loading live room console...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-sm font-medium">Room {code} not found.</p>
        <Link to="/teacher" className="eval-btn-secondary text-xs">
          Back to Teacher Workspace
        </Link>
      </div>
    );
  }

  const questions = room.questions || [];
  const currentQ = questions[room.currentQuestionIdx] || null;
  const dist = (room.distributions || {})[room.currentQuestionIdx] || {};
  const totalResponsesForQ = Object.values(dist).reduce((s, c) => s + Number(c || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Bar */}
      <div className="eval-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/teacher" className="eval-btn-secondary py-1.5 px-3 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Workspace
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-widest px-2.5 py-0.5 rounded bg-[var(--eval-accent-soft)]" style={{ color: 'var(--eval-accent)' }}>
                {room.code}
              </span>
              <h1 className="text-base sm:text-lg font-semibold">{room.title}</h1>
              <span className={room.status === 'active' ? 'eval-badge eval-badge-pass' : room.status === 'ended' ? 'eval-badge eval-badge-neutral' : 'eval-badge eval-badge-warn'}>
                {room.status}
              </span>
            </div>
            <div className="text-xs flex items-center gap-3 mt-1" style={{ color: 'var(--eval-muted)' }}>
              <span className="capitalize">{room.mode.replace('_', ' ')}</span>
              <span>&middot;</span>
              <span className="inline-flex items-center gap-1">
                <Wifi className="w-3 h-3" style={{ color: wsStatus === 'connected' ? 'var(--status-pass)' : 'var(--status-warn)' }} />
                {wsStatus === 'connected' ? 'Real-time connected' : 'Syncing...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyJoinUrl} className="eval-btn-secondary py-1.5 px-3 text-xs">
            <Copy className="w-3.5 h-3.5" /> Copy Link
          </button>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="eval-btn-secondary py-1.5 px-3 text-xs">
            <QrCode className="w-3.5 h-3.5" /> QR Code
          </button>
          <button
            type="button"
            onClick={() => setPresentMode((v) => !v)}
            className={presentMode ? 'eval-btn-primary py-1.5 px-3 text-xs' : 'eval-btn-secondary py-1.5 px-3 text-xs'}
            title="Toggle classroom projector view"
          >
            {presentMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {presentMode ? 'Exit Present' : 'Present'}
          </button>
          {room.status !== 'ended' && (
            <button
              type="button"
              disabled={ending}
              onClick={handleEndSession}
              className="eval-btn-primary py-1.5 px-3.5 text-xs"
              style={{ backgroundColor: 'var(--status-fail)' }}
            >
              <Square className="w-3.5 h-3.5" /> {ending ? 'Ending...' : 'End Session'}
            </button>
          )}
        </div>
      </div>

      {showQr && qrUrl && (
        <div className="eval-card p-6 flex flex-col sm:flex-row items-center gap-6">
          <img src={qrUrl} alt={`QR Code for room ${room.code}`} className="w-40 h-40 rounded-lg border p-1 bg-white" />
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--eval-accent)' }}>
              Student Join Code
            </div>
            <div className="text-3xl font-bold font-mono tracking-widest">{room.code}</div>
            <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
              Students scan to open <code className="font-mono">{window.location.origin}/room/{room.code}</code>
            </p>
          </div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Question & Controls */}
        <div className={presentMode ? 'lg:col-span-12 space-y-4' : 'lg:col-span-8 space-y-4'}>
          {room.status === 'ended' ? (
            <div className="eval-card p-8 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: 'var(--status-pass)' }} />
              <h2 className="text-lg font-semibold">Live Session Ended</h2>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--eval-muted)' }}>
                Participant scores and responses have been permanently saved to your Reports &amp; Analytics tab.
              </p>
              <Link to="/teacher" className="eval-btn-primary text-xs inline-flex">
                Open Teacher Workspace &amp; Reports
              </Link>
            </div>
          ) : (
            <>
              {/* Pacing Bar */}
              <div className="eval-card p-4 flex flex-wrap items-center justify-between gap-3">
                {room.status === 'lobby' ? (
                  <>
                    <div className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                      Room is in <strong>Lobby</strong>. Wait for students to join, then start Question 1.
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateQuestion(0)}
                      className="eval-btn-primary text-xs"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Session (Q1)
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={room.currentQuestionIdx <= 0}
                        onClick={() => navigateQuestion(room.currentQuestionIdx - 1)}
                        className="eval-btn-secondary py-1.5 px-3 text-xs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </button>
                      <select
                        value={room.currentQuestionIdx}
                        onChange={(e) => navigateQuestion(Number(e.target.value))}
                        aria-label="Jump to question"
                        className="eval-input py-1.5 text-xs w-auto font-mono"
                      >
                        {questions.map((q, idx) => (
                          <option key={q.id} value={idx}>
                            Q{idx + 1} of {questions.length}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={room.currentQuestionIdx >= questions.length - 1}
                        onClick={() => navigateQuestion(room.currentQuestionIdx + 1)}
                        className="eval-btn-primary py-1.5 px-3 text-xs"
                      >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={toggleReveal}
                      className={room.revealedCurrent ? 'eval-btn-primary py-1.5 px-3 text-xs' : 'eval-btn-secondary py-1.5 px-3 text-xs'}
                    >
                      {room.revealedCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {room.revealedCurrent ? 'Hide Answer' : 'Reveal Answer'}
                    </button>
                  </>
                )}
              </div>

              {/* Current Question Display + Distribution */}
              {currentQ && (
                <div className="eval-card p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="eval-badge eval-badge-brand font-mono">
                      Question {room.currentQuestionIdx + 1} / {questions.length}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--eval-muted)' }}>
                      {totalResponsesForQ} / {room.participantsCount} answered &middot; {currentQ.points} pt(s)
                    </span>
                  </div>

                  <h2 className={presentMode ? 'text-2xl sm:text-3xl font-semibold leading-snug' : 'text-lg sm:text-xl font-semibold leading-snug'}>
                    {currentQ.prompt}
                  </h2>

                  {(currentQ.options || []).length > 0 ? (
                    <div className="space-y-2.5">
                      {currentQ.options.map((opt, idx) => {
                        const count = Number(dist[String(idx)] || 0);
                        const pct = totalResponsesForQ ? Math.round((count / totalResponsesForQ) * 100) : 0;
                        const isCorrect =
                          currentQ.type === 'tf'
                            ? (idx === 0 && currentQ.correctAnswer === true) || (idx === 1 && currentQ.correctAnswer === false)
                            : Array.isArray(currentQ.correctAnswer)
                              ? currentQ.correctAnswer.includes(idx)
                              : Number(currentQ.correctAnswer) === idx;

                        return (
                          <div
                            key={idx}
                            className="p-3.5 rounded-lg border space-y-2"
                            style={{
                              borderColor: room.revealedCurrent && isCorrect ? 'var(--status-pass)' : 'var(--eval-border)',
                              backgroundColor: room.revealedCurrent && isCorrect ? 'var(--status-pass-soft)' : 'var(--eval-bg)',
                            }}
                          >
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">
                                <span className="font-mono mr-2 opacity-60">{String.fromCharCode(65 + idx)}.</span>
                                {opt}
                              </span>
                              <span className="font-mono text-xs font-semibold shrink-0">
                                {count} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--eval-surface-muted)' }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: room.revealedCurrent && isCorrect ? 'var(--status-pass)' : 'var(--eval-accent)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold" style={{ color: 'var(--eval-muted)' }}>
                        Submitted Short Answers
                      </div>
                      {Object.keys(dist).length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>Waiting for responses...</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(dist).map(([text, count]) => (
                            <span key={text} className="eval-badge eval-badge-neutral">
                              {text} <strong className="font-mono ml-1">&times;{count}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {room.revealedCurrent && currentQ.explanation && (
                    <div className="p-3.5 rounded-lg border text-xs" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                      <strong>Explanation:</strong> {currentQ.explanation}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Participants & Leaderboard */}
        {!presentMode && (
          <div className="lg:col-span-4 space-y-4">
          {/* Leaderboard (highlighted in Challenge or when scores > 0) */}
          <div className="eval-card p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
              {room.mode === 'challenge' ? 'Live Challenge Leaderboard' : 'Scoreboard'}
            </h3>
            {(room.leaderboard || []).length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                No participants have joined yet.
              </p>
            ) : (
              <div className="space-y-2">
                {room.leaderboard.slice(0, 10).map((entry) => (
                  <div
                    key={entry.studentId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs"
                    style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold w-5 text-center" style={{ color: 'var(--eval-accent)' }}>
                        #{entry.rank}
                      </span>
                      <span className="font-medium truncate">{entry.displayName}</span>
                    </div>
                    <span className="font-mono font-semibold">{entry.totalScore} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Participant Status Pills */}
          <div className="eval-card p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
              Joined Students ({room.participantsCount})
            </h3>
            {(room.participants || []).length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                Share code <strong className="font-mono">{room.code}</strong> with your class.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {room.participants.map((p) => {
                  const answeredCurrent =
                    currentQ && Boolean(room.responses?.[p.studentId]?.[currentQ.id]);
                  return (
                    <span
                      key={p.studentId}
                      className={answeredCurrent ? 'eval-badge eval-badge-pass' : 'eval-badge eval-badge-neutral'}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: answeredCurrent ? 'var(--status-pass)' : 'var(--dusty-taupe)' }}
                      />
                      {p.displayName}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
