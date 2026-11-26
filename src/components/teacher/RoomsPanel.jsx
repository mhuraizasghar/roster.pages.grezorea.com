import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Play,
  Plus,
  Radio,
  SlidersHorizontal,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

const ROOM_MODES = [
  {
    id: 'teacher_paced',
    label: 'Teacher-Paced',
    desc: 'You control when the class moves to the next question.',
    icon: Radio,
  },
  {
    id: 'student_paced',
    label: 'Student-Paced',
    desc: 'Students advance through questions at their own speed.',
    icon: Users,
  },
  {
    id: 'challenge',
    label: 'Challenge (Speed)',
    desc: 'Timed live leaderboard with up to +50% speed bonus points.',
    icon: Trophy,
  },
  {
    id: 'quick_question',
    label: 'Quick Question',
    desc: 'Launch a single ad-hoc question or exit ticket immediately.',
    icon: Zap,
  },
];

export default function RoomsPanel({
  rooms = [],
  quizzes = [],
  initialQuiz = null,
  onClearInitialQuiz,
  onRefresh,
  onViewReport,
}) {
  const [quizId, setQuizId] = useState(initialQuiz?.id || quizzes[0]?.id || '');
  const [mode, setMode] = useState('teacher_paced');
  const [customTitle, setCustomTitle] = useState(initialQuiz?.title || '');
  const [openJoin, setOpenJoin] = useState(false);
  const [showFeedbackImmediately, setShowFeedbackImmediately] = useState(false);
  const [qqPrompt, setQqPrompt] = useState('');
  const [qqType, setQqType] = useState('mcq');
  const [qqOptions, setQqOptions] = useState(['Option A', 'Option B', 'Option C', 'Option D']);
  const [qqCorrect, setQqCorrect] = useState(0);
  const [qqAccepted, setQqAccepted] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Keep quizId synced if initialQuiz changes
  React.useEffect(() => {
    if (initialQuiz) {
      setQuizId(initialQuiz.id);
      setCustomTitle(initialQuiz.title);
      if (mode === 'quick_question') setMode('teacher_paced');
    } else if (!quizId && quizzes.length > 0) {
      setQuizId(quizzes[0].id);
    }
  }, [initialQuiz, quizzes]);

  const activeRooms = rooms.filter((r) => r.status !== 'ended');
  const endedRooms = rooms.filter((r) => r.status === 'ended');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        mode,
        title: customTitle.trim(),
        openJoin,
        settings: { showFeedbackImmediately },
      };

      if (mode === 'quick_question') {
        if (!qqPrompt.trim()) {
          showToast('Enter a prompt for your quick question.', 'warning');
          setCreating(false);
          return;
        }
        payload.quickQuestion = {
          type: qqType,
          prompt: qqPrompt.trim(),
          options:
            qqType === 'tf'
              ? ['True', 'False']
              : qqType === 'mcq'
                ? qqOptions.map((o) => o.trim()).filter(Boolean)
                : [],
          correctAnswer:
            qqType === 'tf'
              ? qqCorrect === true || qqCorrect === 'true' || qqCorrect === 0
              : qqType === 'short_answer'
                ? qqAccepted.split(',')[0]?.trim() || null
                : Number(qqCorrect),
          acceptedAnswers:
            qqType === 'short_answer'
              ? qqAccepted.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
          points: 1,
          timeLimitSec: 30,
        };
      } else {
        if (!quizId) {
          showToast('Select a quiz from your library first.', 'warning');
          setCreating(false);
          return;
        }
        payload.quizId = quizId;
      }

      const res = await api.post('/api/rooms', payload);
      showToast(`Live room ${res.room.code} launched!`);
      onClearInitialQuiz?.();
      await onRefresh?.();
      navigate(`/teacher/room/${res.room.code}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const copyJoinLink = async (code) => {
    const url = `${window.location.origin}/room/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Copied room link for ${code}`);
    } catch {
      showToast(`Room code: ${code}`, 'info');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Live Room Card */}
      <form onSubmit={handleCreateRoom} className="eval-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
              Launch a Live Classroom
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--eval-muted)' }}>
              Run quizzes in real time with WebSocket updates or pose an instant quick question.
            </p>
          </div>
          {initialQuiz && (
            <button
              type="button"
              onClick={onClearInitialQuiz}
              className="eval-btn-ghost text-xs py-1 px-2"
            >
              Clear preselected quiz
            </button>
          )}
        </div>

        {/* Mode Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ROOM_MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className="text-left p-3.5 rounded-lg border transition-all"
                style={{
                  borderColor: active ? 'var(--eval-accent)' : 'var(--eval-border)',
                  backgroundColor: active ? 'var(--eval-accent-soft)' : 'var(--eval-bg)',
                }}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Icon className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
                  {m.label}
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--eval-muted)' }}>
                  {m.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Quiz selection OR Quick Question inline builder */}
        {mode === 'quick_question' ? (
          <div className="p-4 rounded-lg border space-y-3" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Quick Question Prompt</label>
                <input
                  className="eval-input text-sm"
                  value={qqPrompt}
                  onChange={(e) => setQqPrompt(e.target.value)}
                  placeholder="e.g. Which complexity class describes binary search?"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Response Format</label>
                <select
                  className="eval-input text-sm"
                  value={qqType}
                  onChange={(e) => {
                    setQqType(e.target.value);
                    setQqCorrect(e.target.value === 'tf' ? true : 0);
                  }}
                >
                  <option value="mcq">Multiple Choice</option>
                  <option value="tf">True / False</option>
                  <option value="short_answer">Short Answer / Poll</option>
                </select>
              </div>
            </div>

            {qqType === 'mcq' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {qqOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="qqCorrectRadio"
                      checked={Number(qqCorrect) === idx}
                      onChange={() => setQqCorrect(idx)}
                      aria-label={`Mark option ${idx + 1} as correct`}
                    />
                    <input
                      className="eval-input text-xs py-2"
                      value={opt}
                      onChange={(e) => {
                        const copy = [...qqOptions];
                        copy[idx] = e.target.value;
                        setQqOptions(copy);
                      }}
                      placeholder={`Option ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {qqType === 'tf' && (
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium">Correct Answer:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="qqTf"
                    checked={qqCorrect === true}
                    onChange={() => setQqCorrect(true)}
                  />
                  True
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="qqTf"
                    checked={qqCorrect === false}
                    onChange={() => setQqCorrect(false)}
                  />
                  False
                </label>
              </div>
            )}

            {qqType === 'short_answer' && (
              <div>
                <label className="block text-xs font-medium mb-1">
                  Accepted Answers (comma-separated, leave blank for open poll)
                </label>
                <input
                  className="eval-input text-xs"
                  value={qqAccepted}
                  onChange={(e) => setQqAccepted(e.target.value)}
                  placeholder="e.g. O(log n), log n"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="roomQuizSelect" className="block text-xs font-medium mb-1">
                Select Quiz from Library
              </label>
              <select
                id="roomQuizSelect"
                className="eval-input text-sm"
                value={quizId}
                onChange={(e) => {
                  setQuizId(e.target.value);
                  const found = quizzes.find((q) => q.id === e.target.value);
                  if (found && !customTitle) setCustomTitle(found.title);
                }}
              >
                {quizzes.length === 0 ? (
                  <option value="">No quizzes in library yet</option>
                ) : (
                  quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({(q.draftQuestions || []).length} Qs)
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label htmlFor="roomTitleInput" className="block text-xs font-medium mb-1">
                Session Title (optional)
              </label>
              <input
                id="roomTitleInput"
                className="eval-input text-sm"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Defaults to quiz title"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t" style={{ borderColor: 'var(--eval-border)' }}>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFeedbackImmediately}
                onChange={(e) => setShowFeedbackImmediately(e.target.checked)}
              />
              Show feedback right after each response
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={openJoin}
                onChange={(e) => setOpenJoin(e.target.checked)}
              />
              Allow any signed-in student (bypass roster check for this room)
            </label>
          </div>
          <button type="submit" disabled={creating} className="eval-btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Launching...' : 'Start Live Room'}
          </button>
        </div>
      </form>

      {/* Active Rooms */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Radio className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--eval-accent)' }} />
          Active &amp; Lobby Rooms ({activeRooms.length})
        </h3>
        {activeRooms.length === 0 ? (
          <div className="eval-card p-8 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
            No live rooms running right now. Launch one above to generate a room code.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRooms.map((room) => (
              <div key={room.id} className="eval-card eval-card-hover p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base font-bold tracking-wider px-2.5 py-0.5 rounded bg-[var(--eval-accent-soft)]" style={{ color: 'var(--eval-accent)' }}>
                      {room.code}
                    </span>
                    <span className={room.status === 'active' ? 'eval-badge eval-badge-pass' : 'eval-badge eval-badge-warn'}>
                      {room.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold">{room.title}</h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--eval-muted)' }}>
                    <span className="capitalize">{room.mode.replace('_', ' ')}</span>
                    <span>&middot;</span>
                    <span>{room.questionsCount} question(s)</span>
                    <span>&middot;</span>
                    <span>{room.participantsCount} joined</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--eval-border)' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/room/${room.code}`)}
                    className="eval-btn-primary text-xs py-1.5 px-3 flex-1"
                  >
                    <Play className="w-3.5 h-3.5" /> Open Host Console
                  </button>
                  <button
                    type="button"
                    onClick={() => copyJoinLink(room.code)}
                    className="eval-btn-secondary text-xs py-1.5 px-3"
                    title="Copy student join URL"
                  >
                    <Copy className="w-3.5 h-3.5" /> Share Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past / Ended Rooms */}
      {endedRooms.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eval-muted)' }}>
            Ended Sessions ({endedRooms.length})
          </h3>
          <div className="eval-card divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {endedRooms.map((room) => (
              <div key={room.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{room.code}</span>
                    <span className="text-sm font-medium">{room.title}</span>
                    <span className="eval-badge eval-badge-neutral text-[11px]">
                      {room.mode.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--eval-muted)' }}>
                    {room.participantsCount} participant(s) &middot; Ended{' '}
                    {room.endedAt ? new Date(room.endedAt).toLocaleString() : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewReport?.({ type: 'room', id: room.id })}
                  className="eval-btn-secondary text-xs py-1.5 px-3"
                >
                  View Report
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
