/*
 * QuizHub data layer.
 *
 * This is the ONLY file that touches localStorage / sessionStorage or fetches the
 * published quiz bundle. Every page talks to `Store`, so swapping in a real backend
 * later (see ARCHITECTURE.md, phase 2) means rewriting this file, not the pages.
 */
const Store = (() => {
  'use strict';

  const K = {
    quizzes: 'qh.quizzes',
    attempts: 'qh.attempts',
    scores: 'qh.scores',
    progress: 'qh.progress',
    admin: 'qh.admin',
  };
  const S = { student: 'qh.student', adminAuth: 'qh.adminAuth', lastAttempt: 'qh.lastAttempt' };
  const DEFAULT_ADMIN_PASSWORD = 'admin123';
  const MAX_SCORES = 10;
  const PUBLISHED_URL = 'data/published.json';

  /* ---------- storage helpers ---------- */

  function makeArea(name) {
    try {
      const area = globalThis[name];
      area.setItem('__qh_test', '1');
      area.removeItem('__qh_test');
      return area;
    } catch (e) {
      // Storage blocked (private mode, disabled cookies): fall back to memory so the app still runs.
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    }
  }
  let _ls = null;
  let _ss = null;
  const ls = () => (_ls = _ls || makeArea('localStorage'));
  const ss = () => (_ss = _ss || makeArea('sessionStorage'));

  function read(area, key, fallback) {
    try {
      const raw = area.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(area, key, value) {
    try {
      area.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write failed:', e);
      return false;
    }
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /** Fisher-Yates shuffle. Returns a new array. */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- email rules ---------- */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const DOMAIN_RE = /^@[^\s@]+\.[^\s@]{2,}$/;
  const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

  /**
   * Parse pasted text / CSV into enrolment rules.
   * Accepts full emails ("ali@uni.edu") and whole-domain rules ("@uni.edu" or "*@uni.edu").
   */
  function parseEmails(text) {
    const seen = new Set();
    const valid = [];
    const invalid = [];
    String(text || '')
      .split(/[\s,;]+/)
      .forEach((raw) => {
        const cleaned = raw.trim();
        if (!cleaned) return;
        const t = cleaned.toLowerCase().replace(/^[<"'*]+|[>"']+$/g, '');
        if (!t) return;
        if (EMAIL_RE.test(t) || DOMAIN_RE.test(t)) {
          if (!seen.has(t)) {
            seen.add(t);
            valid.push(t);
          }
        } else {
          invalid.push(cleaned);
        }
      });
    return { valid, invalid };
  }

  function isAllowed(quiz, email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !quiz) return false;
    return (quiz.allowedEmails || []).some((rule) => (rule.startsWith('@') ? e.endsWith(rule) : rule === e));
  }

  /* ---------- quiz validation / normalisation ---------- */

  function normalizeQuestion(raw) {
    const r = raw || {};
    const pairs = (Array.isArray(r.options) ? r.options : [])
      .map((o, idx) => ({ t: String(o == null ? '' : o).trim(), idx }))
      .filter((p) => p.t);
    return {
      id: r.id ? String(r.id) : uid('q'),
      text: String(r.text || '').trim(),
      options: pairs.map((p) => p.t),
      correct: pairs.findIndex((p) => p.idx === Number(r.correct)),
      explanation: String(r.explanation || '').trim(),
    };
  }

  function validateQuestion(q, n) {
    const errors = [];
    if (!q.text) errors.push(`Question ${n}: the question text is empty.`);
    if (q.options.length < 2) errors.push(`Question ${n}: needs at least two answer options.`);
    if (q.options.length >= 2 && (q.correct < 0 || q.correct >= q.options.length)) {
      errors.push(`Question ${n}: choose which option is correct.`);
    }
    if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) {
      errors.push(`Question ${n}: answer options must all be different.`);
    }
    return errors;
  }

  function validateQuiz(quiz) {
    const errors = [];
    if (!quiz.title) errors.push('Give the quiz a title.');
    if (!quiz.questions.length) errors.push('Add at least one question.');
    quiz.questions.forEach((q, i) => errors.push(...validateQuestion(q, i + 1)));
    return errors;
  }

  function normalizeQuiz(raw, opts = {}) {
    const r = raw || {};
    const num = (v, d, lo, hi) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const emailSource = Array.isArray(r.allowedEmails) ? r.allowedEmails.join('\n') : r.allowedEmails;
    return {
      id: opts.keepId && r.id ? String(r.id) : uid('quiz'),
      title: String(r.title || '').trim(),
      subject: String(r.subject || '').trim(),
      description: String(r.description || '').trim(),
      durationMinutes: num(r.durationMinutes, 10, 1, 180),
      passMark: num(r.passMark, 50, 0, 100),
      shuffle: r.shuffle !== false,
      maxAttempts: num(r.maxAttempts, 0, 0, 50),
      allowedEmails: parseEmails(emailSource).valid,
      questions: (Array.isArray(r.questions) ? r.questions : []).map(normalizeQuestion),
      updatedAt: Number(r.updatedAt) || Date.now(),
    };
  }

  /* ---------- quizzes ---------- */

  let quizzes = [];
  const seed = () => clone(globalThis.SEED_QUIZZES || []);
  const persistQuizzes = () => write(ls(), K.quizzes, quizzes);

  /**
   * Load quizzes: local copy (or the built-in seed on first run), then merge the
   * published bundle (data/published.json) so quizzes appear on every device.
   * A published quiz wins only if it is newer than the local copy.
   */
  async function init() {
    let local = read(ls(), K.quizzes, null);
    if (!Array.isArray(local)) {
      local = seed();
      write(ls(), K.quizzes, local);
    }
    quizzes = local;
    try {
      const res = await fetch(PUBLISHED_URL, { cache: 'no-store' });
      if (res.ok) {
        const bundle = await res.json();
        let changed = false;
        (Array.isArray(bundle.quizzes) ? bundle.quizzes : []).forEach((remote) => {
          const rq = normalizeQuiz(remote, { keepId: true });
          if (!rq.id || validateQuiz(rq).length) return;
          const i = quizzes.findIndex((q) => q.id === rq.id);
          if (i === -1) {
            quizzes.push(rq);
            changed = true;
          } else if ((rq.updatedAt || 0) > (quizzes[i].updatedAt || 0)) {
            quizzes[i] = rq;
            changed = true;
          }
        });
        if (changed) persistQuizzes();
      }
    } catch (e) {
      /* offline, file:// or no bundle published: local data is fine */
    }
    return quizzes;
  }

  const getQuizzes = () => quizzes;
  const getQuiz = (id) => quizzes.find((q) => q.id === id) || null;
  const quizzesFor = (email) => quizzes.filter((q) => q.questions.length && isAllowed(q, email));

  function saveQuiz(quiz) {
    const q = clone(quiz);
    q.updatedAt = Date.now();
    const i = quizzes.findIndex((x) => x.id === q.id);
    if (i === -1) quizzes.push(q);
    else quizzes[i] = q;
    persistQuizzes();
    return q;
  }

  function deleteQuiz(id) {
    quizzes = quizzes.filter((q) => q.id !== id);
    persistQuizzes();
  }

  /** Import one quiz, an array of quizzes or a {quizzes: []} bundle. Imported quizzes always get new ids. */
  function importQuizzes(data) {
    const list = Array.isArray(data) ? data : data && Array.isArray(data.quizzes) ? data.quizzes : [data];
    let added = 0;
    const errors = [];
    list.forEach((raw, i) => {
      const q = normalizeQuiz(raw);
      const problems = validateQuiz(q);
      if (problems.length) {
        errors.push(`Quiz ${i + 1}: ${problems[0]}`);
        return;
      }
      q.updatedAt = Date.now();
      quizzes.push(q);
      added++;
    });
    persistQuizzes();
    return { added, errors };
  }

  function resetQuizzes() {
    quizzes = seed();
    persistQuizzes();
  }

  function buildPublishBundle() {
    return { version: 1, generatedAt: new Date().toISOString(), quizzes: clone(quizzes) };
  }

  /* ---------- student session ---------- */

  const getStudent = () => read(ss(), S.student, null);
  const setStudent = (s) =>
    write(ss(), S.student, { email: String(s.email).trim().toLowerCase(), name: String(s.name).trim() });
  const clearStudent = () => ss().removeItem(S.student);

  /* ---------- in-progress attempts (survive refresh / tab close) ---------- */

  const pKey = (quizId, email) => `${quizId}|${String(email).toLowerCase()}`;
  const getProgress = (quizId, email) => read(ls(), K.progress, {})[pKey(quizId, email)] || null;
  function saveProgress(p) {
    const all = read(ls(), K.progress, {});
    all[pKey(p.quizId, p.email)] = p;
    write(ls(), K.progress, all);
  }
  function clearProgress(quizId, email) {
    const all = read(ls(), K.progress, {});
    delete all[pKey(quizId, email)];
    write(ls(), K.progress, all);
  }

  /* ---------- attempts and scoring ---------- */

  /** Build a self-contained attempt record: a snapshot, so later quiz edits never change old results. */
  function buildAttempt({ quiz, email, name, order, answers, startedAt, autoSubmitted }) {
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    const items = order
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((q) => {
        const a = answers[q.id];
        const chosen = Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
        return {
          questionId: q.id,
          text: q.text,
          options: q.options.slice(),
          correct: q.correct,
          chosen,
          explanation: q.explanation || '',
          isCorrect: chosen === q.correct,
        };
      });
    const score = items.filter((i) => i.isCorrect).length;
    const total = items.length;
    const percent = total ? Math.round((score / total) * 1000) / 10 : 0;
    const submittedAt = Date.now();
    const timeTaken = Math.max(0, Math.min(quiz.durationMinutes * 60, Math.round((submittedAt - startedAt) / 1000)));
    return {
      id: uid('att'),
      quizId: quiz.id,
      quizTitle: quiz.title,
      email: String(email).toLowerCase(),
      name,
      score,
      total,
      percent,
      passMark: quiz.passMark,
      passed: percent >= quiz.passMark,
      startedAt,
      submittedAt,
      timeTaken,
      autoSubmitted: !!autoSubmitted,
      items,
    };
  }

  const getAttempts = () => read(ls(), K.attempts, []);
  const getAttempt = (id) => getAttempts().find((a) => a.id === id) || null;
  const attemptsFor = (email, quizId) =>
    getAttempts().filter((a) => a.email === String(email).toLowerCase() && a.quizId === quizId);

  function addAttempt(attempt) {
    const all = getAttempts();
    all.push(attempt);
    write(ls(), K.attempts, all);
    addScore(attempt);
    return attempt;
  }

  function clearAttempts() {
    write(ls(), K.attempts, []);
    write(ls(), K.scores, {});
  }

  /* ---------- high-score table ---------- */

  const sortScores = (a, b) => b.percent - a.percent || a.timeTaken - b.timeTaken || a.submittedAt - b.submittedAt;

  function getScores(quizId) {
    const all = read(ls(), K.scores, {});
    return (all[quizId] || []).slice().sort(sortScores);
  }

  /** Keeps each student's best result and the top MAX_SCORES per quiz. */
  function addScore(attempt) {
    const all = read(ls(), K.scores, {});
    const list = all[attempt.quizId] || [];
    const entry = {
      attemptId: attempt.id,
      email: attempt.email,
      name: attempt.name,
      score: attempt.score,
      total: attempt.total,
      percent: attempt.percent,
      timeTaken: attempt.timeTaken,
      submittedAt: attempt.submittedAt,
    };
    const i = list.findIndex((s) => s.email === entry.email);
    if (i === -1) list.push(entry);
    else if (sortScores(entry, list[i]) < 0) list[i] = entry;
    list.sort(sortScores);
    all[attempt.quizId] = list.slice(0, MAX_SCORES);
    write(ls(), K.scores, all);
    return all[attempt.quizId];
  }

  const setLastAttempt = (id) => write(ss(), S.lastAttempt, id);
  const getLastAttempt = () => read(ss(), S.lastAttempt, null);

  /* ---------- admin ---------- */

  const getAdminPassword = () => (read(ls(), K.admin, null) || {}).password || DEFAULT_ADMIN_PASSWORD;
  const isDefaultAdminPassword = () => getAdminPassword() === DEFAULT_ADMIN_PASSWORD;
  const isAdminAuthed = () => read(ss(), S.adminAuth, false) === true;
  function adminLogin(password) {
    if (password !== getAdminPassword()) return false;
    write(ss(), S.adminAuth, true);
    return true;
  }
  const adminLogout = () => ss().removeItem(S.adminAuth);
  function setAdminPassword(current, next) {
    if (current !== getAdminPassword()) return { ok: false, error: 'Current password is incorrect.' };
    if (String(next).length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    write(ls(), K.admin, { password: next });
    return { ok: true };
  }

  /* ---------- backup / restore ---------- */

  const exportBackup = () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    quizzes: clone(quizzes),
    attempts: getAttempts(),
    scores: read(ls(), K.scores, {}),
  });

  function restoreBackup(obj) {
    if (!obj || !Array.isArray(obj.quizzes)) return { ok: false, error: 'This is not a QuizHub backup file.' };
    const restored = obj.quizzes.map((q) => normalizeQuiz(q, { keepId: true }));
    const bad = restored.find((q) => validateQuiz(q).length);
    if (bad) return { ok: false, error: `Backup contains an invalid quiz ("${bad.title || 'untitled'}").` };
    quizzes = restored;
    persistQuizzes();
    write(ls(), K.attempts, Array.isArray(obj.attempts) ? obj.attempts : []);
    write(ls(), K.scores, obj.scores && typeof obj.scores === 'object' ? obj.scores : {});
    return { ok: true };
  }

  return {
    init, shuffle, uid, clone, isEmail, parseEmails, isAllowed,
    normalizeQuiz, validateQuiz, validateQuestion, normalizeQuestion,
    getQuizzes, getQuiz, quizzesFor, saveQuiz, deleteQuiz, importQuizzes, resetQuizzes, buildPublishBundle,
    getStudent, setStudent, clearStudent,
    getProgress, saveProgress, clearProgress,
    buildAttempt, getAttempts, getAttempt, attemptsFor, addAttempt, clearAttempts,
    getScores, setLastAttempt, getLastAttempt,
    isAdminAuthed, adminLogin, adminLogout, isDefaultAdminPassword, setAdminPassword,
    exportBackup, restoreBackup,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Store;
