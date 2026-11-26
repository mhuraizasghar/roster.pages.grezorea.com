import React, { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice (Single / Multi)' },
  { value: 'tf', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'challenge', label: 'Challenge (Timed + Speed Bonus)' },
];

function createEmptyQuestion(type = 'mcq') {
  return {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    prompt: '',
    options: type === 'tf' ? ['True', 'False'] : type === 'short_answer' ? [] : ['', '', '', ''],
    correctAnswer: type === 'tf' ? true : type === 'short_answer' ? '' : 0,
    acceptedAnswers: [],
    matchOptions: { caseSensitive: false, ignoreSpaces: true, allowMinorSpelling: true },
    points: type === 'challenge' ? 100 : 1,
    timeLimitSec: type === 'challenge' ? 20 : 30,
    explanation: '',
    imageUrl: '',
  };
}

export default function QuizEditorPanel({ quiz, onBack, onSaved }) {
  const [title, setTitle] = useState(quiz.title || '');
  const [subject, setSubject] = useState(quiz.subject || 'General');
  const [description, setDescription] = useState(quiz.description || '');
  const [shuffleOptions, setShuffleOptions] = useState(Boolean(quiz.settings?.shuffleOptions));
  const [questions, setQuestions] = useState(() =>
    (quiz.draftQuestions || []).map((q) => ({ ...q }))
  );
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const updateQuestion = (idx, patch) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const changeType = (idx, newType) => {
    const fresh = createEmptyQuestion(newType);
    const prev = questions[idx];
    updateQuestion(idx, {
      ...fresh,
      id: prev.id,
      prompt: prev.prompt,
      explanation: prev.explanation,
      imageUrl: prev.imageUrl,
    });
  };

  const moveQuestion = (idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= questions.length) return;
    const copy = [...questions];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setQuestions(copy);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Quiz title is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const cleanedQuestions = questions.map((q, idx) => {
        if (q.type === 'short_answer') {
          const accepted = (q.acceptedAnswers || []).map((s) => s.trim()).filter(Boolean);
          return {
            ...q,
            position: idx,
            acceptedAnswers: accepted,
            correctAnswer: accepted[0] || '',
          };
        }
        if (q.type === 'tf') {
          return {
            ...q,
            position: idx,
            options: ['True', 'False'],
            correctAnswer: q.correctAnswer === false ? false : true,
          };
        }
        const opts = (q.options || []).map((o) => o.trim()).filter(Boolean);
        return {
          ...q,
          position: idx,
          options: opts,
        };
      });

      const res = await api.patch(`/api/library/quizzes/${quiz.id}`, {
        title: title.trim(),
        subject: subject.trim() || 'General',
        description: description.trim(),
        settings: { ...quiz.settings, shuffleOptions },
        draftQuestions: cleanedQuestions,
      });
      showToast('Quiz draft saved. Existing assignments & rooms keep their original snapshot.');
      onSaved(res.quiz);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: 'var(--eval-border)' }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="eval-btn-secondary text-xs py-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Library
          </button>
          <div>
            <h2 className="text-lg font-semibold">Edit Quiz</h2>
            <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
              Mix MCQ, True/False, Short Answer, and timed Challenge questions.
            </p>
          </div>
        </div>
        <button type="button" onClick={handleSave} disabled={saving} className="eval-btn-primary text-xs py-2.5 px-5">
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save Quiz'}
        </button>
      </div>

      {/* Metadata */}
      <div className="eval-card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1">Quiz Title</label>
          <input className="eval-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Subject</label>
          <input className="eval-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1">Description</label>
          <input className="eval-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-end pb-2">
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
            />
            Shuffle MCQ answer options
          </label>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isMulti = Array.isArray(q.correctAnswer);
          return (
            <div key={q.id || idx} className="eval-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--eval-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="eval-badge eval-badge-brand font-mono">Q{idx + 1}</span>
                  <select
                    value={q.type}
                    onChange={(e) => changeType(idx, e.target.value)}
                    aria-label={`Question ${idx + 1} type`}
                    className="eval-input py-1.5 text-xs w-auto"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <span style={{ color: 'var(--eval-muted)' }}>Pts</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={q.points || 1}
                      onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) || 1 })}
                      className="eval-input py-1 px-2 text-xs w-16 font-mono"
                    />
                  </label>
                  {q.type === 'challenge' && (
                    <label className="flex items-center gap-1 text-xs">
                      <span style={{ color: 'var(--eval-muted)' }}>Sec</span>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={q.timeLimitSec || 20}
                        onChange={(e) => updateQuestion(idx, { timeLimitSec: Number(e.target.value) || 20 })}
                        className="eval-input py-1 px-2 text-xs w-16 font-mono"
                      />
                    </label>
                  )}
                  <button type="button" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="eval-btn-ghost p-1.5" title="Move up">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1} className="eval-btn-ghost p-1.5" title="Move down">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                    className="eval-btn-ghost p-1.5"
                    style={{ color: 'var(--status-fail)' }}
                    title="Delete question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Question Prompt</label>
                <textarea
                  rows={2}
                  className="eval-input"
                  value={q.prompt}
                  onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                  placeholder="Enter question text..."
                />
              </div>

              {/* Type-Specific Editors */}
              {(q.type === 'mcq' || q.type === 'challenge') && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Answer Options</span>
                    {q.type === 'mcq' && (
                      <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isMulti}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateQuestion(idx, { correctAnswer: [Number(q.correctAnswer) || 0] });
                            } else {
                              updateQuestion(idx, { correctAnswer: Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] ?? 0) : 0 });
                            }
                          }}
                        />
                        Allow multiple correct answers
                      </label>
                    )}
                  </div>

                  {(q.options || []).map((opt, oIdx) => {
                    const checked = isMulti
                      ? q.correctAnswer.includes(oIdx)
                      : Number(q.correctAnswer) === oIdx;
                    return (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={`correct_${q.id || idx}`}
                          checked={checked}
                          onChange={() => {
                            if (isMulti) {
                              const next = checked
                                ? q.correctAnswer.filter((x) => x !== oIdx)
                                : [...q.correctAnswer, oIdx];
                              updateQuestion(idx, { correctAnswer: next.length ? next : [oIdx] });
                            } else {
                              updateQuestion(idx, { correctAnswer: oIdx });
                            }
                          }}
                          aria-label={`Mark option ${oIdx + 1} correct`}
                        />
                        <span className="font-mono text-xs w-5" style={{ color: 'var(--eval-muted)' }}>
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <input
                          className="eval-input py-1.5 text-xs"
                          value={opt}
                          onChange={(e) => {
                            const next = [...q.options];
                            next[oIdx] = e.target.value;
                            updateQuestion(idx, { options: next });
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                        />
                        {q.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = q.options.filter((_, i) => i !== oIdx);
                              updateQuestion(idx, { options: next, correctAnswer: isMulti ? [0] : 0 });
                            }}
                            className="eval-btn-ghost p-1"
                            style={{ color: 'var(--status-fail)' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {(q.options || []).length < 6 && (
                    <button
                      type="button"
                      onClick={() => updateQuestion(idx, { options: [...(q.options || []), ''] })}
                      className="eval-btn-ghost text-xs py-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Option
                    </button>
                  )}
                </div>
              )}

              {q.type === 'tf' && (
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-medium">Correct Answer:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`tf_${q.id || idx}`}
                      checked={q.correctAnswer === true}
                      onChange={() => updateQuestion(idx, { correctAnswer: true })}
                    />
                    True
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`tf_${q.id || idx}`}
                      checked={q.correctAnswer === false}
                      onChange={() => updateQuestion(idx, { correctAnswer: false })}
                    />
                    False
                  </label>
                </div>
              )}

              {q.type === 'short_answer' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Accepted Answers (one per line)
                    </label>
                    <textarea
                      rows={2}
                      className="eval-input text-xs font-mono"
                      value={(q.acceptedAnswers || []).join('\n')}
                      onChange={(e) =>
                        updateQuestion(idx, { acceptedAnswers: e.target.value.split('\n') })
                      }
                      placeholder={'Central Processing Unit\nCPU'}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    {[
                      { key: 'caseSensitive', label: 'Case-sensitive' },
                      { key: 'ignoreSpaces', label: 'Ignore extra spaces' },
                      { key: 'allowMinorSpelling', label: 'Allow minor typos' },
                    ].map((opt) => (
                      <label key={opt.key} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(q.matchOptions?.[opt.key])}
                          onChange={(e) =>
                            updateQuestion(idx, {
                              matchOptions: { ...(q.matchOptions || {}), [opt.key]: e.target.checked },
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: 'var(--eval-border)' }}>
                <div>
                  <label className="block text-xs font-medium mb-1">Explanation (shown after answer)</label>
                  <input
                    className="eval-input py-1.5 text-xs"
                    value={q.explanation || ''}
                    onChange={(e) => updateQuestion(idx, { explanation: e.target.value })}
                    placeholder="Optional explanation..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Image URL (optional)</label>
                  <input
                    className="eval-input py-1.5 text-xs"
                    value={q.imageUrl || ''}
                    onChange={(e) => updateQuestion(idx, { imageUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Question Buttons */}
        <div className="eval-card p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-medium" style={{ color: 'var(--eval-muted)' }}>
            Add a question:
          </span>
          <div className="flex flex-wrap gap-2">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setQuestions((prev) => [...prev, createEmptyQuestion(t.value)])}
                className="eval-btn-secondary text-xs py-1.5 px-3"
              >
                <Plus className="w-3.5 h-3.5" /> {t.label.split(' (')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
