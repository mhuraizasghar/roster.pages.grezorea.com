const Store = (() => {
    "use strict";
    const K = {
        quizzes: "qh.quizzes",
        attempts: "qh.attempts",
        scores: "qh.scores",
        progress: "qh.progress",
        admin: "qh.admin"
    };
    const S = {
        student: "qh.student",
        adminAuth: "qh.adminAuth",
        lastAttempt: "qh.lastAttempt"
    };
    const DEFAULT_ADMIN_PASSWORD = "admin123";
    const MAX_SCORES = 10;
    const PUBLISHED_URL = "data/published.json";
    const SHARED_API_URL = "https://quiz-project-students.pages.dev";
    function makeArea(name) {
        try {
            const area = globalThis[name];
            area.setItem("__qh_test", "1");
            area.removeItem("__qh_test");
            return area;
        } catch (e) {
            const m = new Map;
            return {
                getItem: k => m.has(k) ? m.get(k) : null,
                setItem: (k, v) => m.set(k, String(v)),
                removeItem: k => m.delete(k)
            };
        }
    }
    let _ls = null;
    let _ss = null;
    const ls = () => _ls = _ls || makeArea("localStorage");
    const ss = () => _ss = _ss || makeArea("sessionStorage");
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
            console.error("Storage write failed:", e);
            return false;
        }
    }
    const clone = v => JSON.parse(JSON.stringify(v));
    const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [ a[j], a[i] ];
        }
        return a;
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const DOMAIN_RE = /^@[^\s@]+\.[^\s@]{2,}$/;
    const isEmail = s => EMAIL_RE.test(String(s || "").trim());
    function parseEmails(text) {
        const seen = new Set;
        const valid = [];
        const invalid = [];
        String(text || "").split(/[\s,;]+/).forEach(raw => {
            const cleaned = raw.trim();
            if (!cleaned) return;
            const t = cleaned.toLowerCase().replace(/^[<"'*]+|[>"']+$/g, "");
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
        return {
            valid: valid,
            invalid: invalid
        };
    }
    function isAllowed(quiz, email) {
        const e = String(email || "").trim().toLowerCase();
        if (!e || !quiz) return false;
        return (quiz.allowedEmails || []).some(rule => rule.startsWith("@") ? e.endsWith(rule) : rule === e);
    }
    function normalizeQuestion(raw) {
        const r = raw || {};
        const pairs = (Array.isArray(r.options) ? r.options : []).map((o, idx) => ({
            t: String(o == null ? "" : o).trim(),
            idx: idx
        })).filter(p => p.t);
        return {
            id: r.id ? String(r.id) : uid("q"),
            text: String(r.text || "").trim(),
            options: pairs.map(p => p.t),
            correct: pairs.findIndex(p => p.idx === Number(r.correct)),
            explanation: String(r.explanation || "").trim()
        };
    }
    function validateQuestion(q, n) {
        const errors = [];
        if (!q.text) errors.push(`Question ${n}: the question text is empty.`);
        if (q.options.length < 2) errors.push(`Question ${n}: needs at least two answer options.`);
        if (q.options.length >= 2 && (q.correct < 0 || q.correct >= q.options.length)) {
            errors.push(`Question ${n}: choose which option is correct.`);
        }
        if (new Set(q.options.map(o => o.toLowerCase())).size !== q.options.length) {
            errors.push(`Question ${n}: answer options must all be different.`);
        }
        return errors;
    }
    function validateQuiz(quiz) {
        const errors = [];
        if (!quiz.title) errors.push("Give the quiz a title.");
        if (!quiz.questions.length) errors.push("Add at least one question.");
        quiz.questions.forEach((q, i) => errors.push(...validateQuestion(q, i + 1)));
        return errors;
    }
    function normalizeQuiz(raw, opts = {}) {
        const r = raw || {};
        const num = (v, d, lo, hi) => {
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
        };
        const emailSource = Array.isArray(r.allowedEmails) ? r.allowedEmails.join("\n") : r.allowedEmails;
        return {
            id: opts.keepId && r.id ? String(r.id) : uid("quiz"),
            title: String(r.title || "").trim(),
            subject: String(r.subject || "").trim(),
            description: String(r.description || "").trim(),
            durationMinutes: num(r.durationMinutes, 10, 1, 180),
            passMark: num(r.passMark, 50, 0, 100),
            shuffle: r.shuffle !== false,
            maxAttempts: num(r.maxAttempts, 0, 0, 50),
            allowedEmails: parseEmails(emailSource).valid,
            questions: (Array.isArray(r.questions) ? r.questions : []).map(normalizeQuestion),
            updatedAt: Number(r.updatedAt) || Date.now()
        };
    }
    let quizzes = [];
    let remoteAttempts = null;
    let remoteScores = null;
    let remoteQuizzes = null;
    let publishedQuizzes = [];
    const seed = () => clone(globalThis.SEED_QUIZZES || []);
    const persistQuizzes = () => write(ls(), K.quizzes, quizzes);
    async function init() {
        let local = read(ls(), K.quizzes, null);
        if (!Array.isArray(local)) {
            local = seed();
            write(ls(), K.quizzes, local);
        }
        quizzes = local;
        try {
            const res = await fetch(PUBLISHED_URL, {
                cache: "no-store"
            });
            if (res.ok) {
                const bundle = await res.json();
                publishedQuizzes = Array.isArray(bundle.quizzes) ? bundle.quizzes : [];
                let changed = false;
                (Array.isArray(bundle.quizzes) ? bundle.quizzes : []).forEach(remote => {
                    const rq = normalizeQuiz(remote, {
                        keepId: true
                    });
                    if (!rq.id || validateQuiz(rq).length) return;
                    const i = quizzes.findIndex(q => q.id === rq.id);
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
        } catch (e) {}
        try {
            const [attemptRes, scoreRes, quizRes] = await Promise.all([
                fetch(`${SHARED_API_URL}/api/attempts`, { cache: "no-store" }),
                fetch(`${SHARED_API_URL}/api/scores`, { cache: "no-store" }),
                fetch(`${SHARED_API_URL}/api/quizzes`, { cache: "no-store" })
            ]);
            if (attemptRes.ok) {
                const data = await attemptRes.json();
                remoteAttempts = Array.isArray(data.attempts) ? data.attempts : null;
            }
            if (scoreRes.ok) {
                const data = await scoreRes.json();
                remoteScores = data.scores && typeof data.scores === "object" ? data.scores : null;
            }
            if (quizRes.ok) {
                const data = await quizRes.json();
                if (Array.isArray(data.quizzes) && data.quizzes.length) {
                    remoteQuizzes = data.quizzes;
                    quizzes = data.quizzes.map(quiz => normalizeQuiz(quiz, { keepId: true })).filter(quiz => quiz.id && !validateQuiz(quiz).length);
                    persistQuizzes();
                } else {
                    await publishQuizzes(publishedQuizzes);
                }
            }
            const localAttempts = read(ls(), K.attempts, []);
            if (Array.isArray(localAttempts)) {
                await Promise.all(localAttempts.map(attempt => fetch(`${SHARED_API_URL}/api/attempts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ attempt: attempt })
                }).catch(() => {})));
            }
            const localScores = read(ls(), K.scores, {});
            const scorePosts = [];
            Object.keys(localScores).forEach(quizId => {
                (localScores[quizId] || []).forEach(score => scorePosts.push(fetch(`${SHARED_API_URL}/api/scores`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quizId: quizId, score: score })
                }).catch(() => {})));
            });
            await Promise.all(scorePosts);
        } catch (e) {}
        return quizzes;
    }
    async function publishQuizzes(list) {
        try {
            await fetch(`${SHARED_API_URL}/api/quizzes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quizzes: list })
            });
        } catch (e) {}
    }
    const getQuizzes = () => quizzes;
    const getQuiz = id => quizzes.find(q => q.id === id) || null;
    const quizzesFor = email => quizzes.filter(q => q.questions.length && isAllowed(q, email));
    function saveQuiz(quiz) {
        const q = clone(quiz);
        q.updatedAt = Date.now();
        const i = quizzes.findIndex(x => x.id === q.id);
        if (i === -1) quizzes.push(q); else quizzes[i] = q;
        persistQuizzes();
        publishQuizzes(quizzes);
        return q;
    }
    function deleteQuiz(id) {
        quizzes = quizzes.filter(q => q.id !== id);
        persistQuizzes();
        publishQuizzes(quizzes);
    }
    function importQuizzes(data) {
        const list = Array.isArray(data) ? data : data && Array.isArray(data.quizzes) ? data.quizzes : [ data ];
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
        publishQuizzes(quizzes);
        return {
            added: added,
            errors: errors
        };
    }
    function resetQuizzes() {
        quizzes = seed();
        persistQuizzes();
        publishQuizzes(quizzes);
    }
    function buildPublishBundle() {
        return {
            version: 1,
            generatedAt: (new Date).toISOString(),
            quizzes: clone(quizzes)
        };
    }
    const getStudent = () => read(ss(), S.student, null);
    const setStudent = s => write(ss(), S.student, {
        email: String(s.email).trim().toLowerCase(),
        name: String(s.name).trim()
    });
    const clearStudent = () => ss().removeItem(S.student);
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
    function buildAttempt({quiz: quiz, email: email, name: name, order: order, answers: answers, startedAt: startedAt, autoSubmitted: autoSubmitted}) {
        const byId = new Map(quiz.questions.map(q => [ q.id, q ]));
        const items = order.map(id => byId.get(id)).filter(Boolean).map(q => {
            const a = answers[q.id];
            const chosen = Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
            return {
                questionId: q.id,
                text: q.text,
                options: q.options.slice(),
                correct: q.correct,
                chosen: chosen,
                explanation: q.explanation || "",
                isCorrect: chosen === q.correct
            };
        });
        const score = items.filter(i => i.isCorrect).length;
        const total = items.length;
        const percent = total ? Math.round(score / total * 1e3) / 10 : 0;
        const submittedAt = Date.now();
        const timeTaken = Math.max(0, Math.min(quiz.durationMinutes * 60, Math.round((submittedAt - startedAt) / 1e3)));
        return {
            id: uid("att"),
            quizId: quiz.id,
            quizTitle: quiz.title,
            email: String(email).toLowerCase(),
            name: name,
            score: score,
            total: total,
            percent: percent,
            passMark: quiz.passMark,
            passed: percent >= quiz.passMark,
            startedAt: startedAt,
            submittedAt: submittedAt,
            timeTaken: timeTaken,
            autoSubmitted: !!autoSubmitted,
            items: items
        };
    }
    function getAttempts() {
        const local = read(ls(), K.attempts, []);
        if (!Array.isArray(remoteAttempts)) return local;
        const merged = new Map(local.map(attempt => [attempt.id, attempt]).concat(remoteAttempts.map(attempt => [attempt.id, attempt])));
        return [...merged.values()].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    }
    const getAttempt = id => getAttempts().find(a => a.id === id) || null;
    const attemptsFor = (email, quizId) => getAttempts().filter(a => a.email === String(email).toLowerCase() && a.quizId === quizId);
    function addAttempt(attempt) {
        const all = read(ls(), K.attempts, []);
        all.push(attempt);
        write(ls(), K.attempts, all);
        addScore(attempt);
        try {
            fetch(`${SHARED_API_URL}/api/attempts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attempt: attempt })
            }).catch(() => {});
        } catch (e) {}
        return attempt;
    }
    function clearAttempts() {
        write(ls(), K.attempts, []);
        write(ls(), K.scores, {});
    }
    const sortScores = (a, b) => b.percent - a.percent || a.timeTaken - b.timeTaken || a.submittedAt - b.submittedAt;
    function getScores(quizId) {
        const all = remoteScores && typeof remoteScores === "object" ? remoteScores : read(ls(), K.scores, {});
        return (all[quizId] || []).slice().sort(sortScores);
    }
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
            submittedAt: attempt.submittedAt
        };
        const i = list.findIndex(s => s.email === entry.email);
        if (i === -1) list.push(entry); else if (sortScores(entry, list[i]) < 0) list[i] = entry;
        list.sort(sortScores);
        all[attempt.quizId] = list.slice(0, MAX_SCORES);
        write(ls(), K.scores, all);
        if (remoteScores) remoteScores = { ...remoteScores, [attempt.quizId]: all[attempt.quizId] };
        try {
            fetch(`${SHARED_API_URL}/api/scores`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quizId: attempt.quizId, score: all[attempt.quizId].find(s => s.email === attempt.email) })
            }).catch(() => {});
        } catch (e) {}
        return all[attempt.quizId];
    }
    const setLastAttempt = id => write(ss(), S.lastAttempt, id);
    const getLastAttempt = () => read(ss(), S.lastAttempt, null);
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
        if (current !== getAdminPassword()) return {
            ok: false,
            error: "Current password is incorrect."
        };
        if (String(next).length < 6) return {
            ok: false,
            error: "New password must be at least 6 characters."
        };
        write(ls(), K.admin, {
            password: next
        });
        return {
            ok: true
        };
    }
    const exportBackup = () => ({
        version: 1,
        exportedAt: (new Date).toISOString(),
        quizzes: clone(quizzes),
        attempts: getAttempts(),
        scores: read(ls(), K.scores, {})
    });
    function restoreBackup(obj) {
        if (!obj || !Array.isArray(obj.quizzes)) return {
            ok: false,
            error: "This is not a QuizHub backup file."
        };
        const restored = obj.quizzes.map(q => normalizeQuiz(q, {
            keepId: true
        }));
        const bad = restored.find(q => validateQuiz(q).length);
        if (bad) return {
            ok: false,
            error: `Backup contains an invalid quiz ("${bad.title || "untitled"}").`
        };
        quizzes = restored;
        persistQuizzes();
        write(ls(), K.attempts, Array.isArray(obj.attempts) ? obj.attempts : []);
        write(ls(), K.scores, obj.scores && typeof obj.scores === "object" ? obj.scores : {});
        return {
            ok: true
        };
    }
    return {
        init: init,
        shuffle: shuffle,
        uid: uid,
        clone: clone,
        isEmail: isEmail,
        parseEmails: parseEmails,
        isAllowed: isAllowed,
        normalizeQuiz: normalizeQuiz,
        validateQuiz: validateQuiz,
        validateQuestion: validateQuestion,
        normalizeQuestion: normalizeQuestion,
        getQuizzes: getQuizzes,
        getQuiz: getQuiz,
        quizzesFor: quizzesFor,
        saveQuiz: saveQuiz,
        deleteQuiz: deleteQuiz,
        importQuizzes: importQuizzes,
        resetQuizzes: resetQuizzes,
        buildPublishBundle: buildPublishBundle,
        getStudent: getStudent,
        setStudent: setStudent,
        clearStudent: clearStudent,
        getProgress: getProgress,
        saveProgress: saveProgress,
        clearProgress: clearProgress,
        buildAttempt: buildAttempt,
        getAttempts: getAttempts,
        getAttempt: getAttempt,
        attemptsFor: attemptsFor,
        addAttempt: addAttempt,
        clearAttempts: clearAttempts,
        getScores: getScores,
        setLastAttempt: setLastAttempt,
        getLastAttempt: getLastAttempt,
        isAdminAuthed: isAdminAuthed,
        adminLogin: adminLogin,
        adminLogout: adminLogout,
        isDefaultAdminPassword: isDefaultAdminPassword,
        setAdminPassword: setAdminPassword,
        exportBackup: exportBackup,
        restoreBackup: restoreBackup
    };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Store;