const test = require("node:test");

const assert = require("node:assert/strict");

function fakeStorage() {
    const m = new Map;
    return {
        getItem: k => m.has(k) ? m.get(k) : null,
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
        clear: () => m.clear()
    };
}

globalThis.window = globalThis;

globalThis.localStorage = fakeStorage();

globalThis.sessionStorage = fakeStorage();

globalThis.fetch = async () => {
    throw new Error("offline");
};

require("../data/questions.js");

const Store = require("../js/store.js");

test.beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await Store.init();
});

const demo = () => Store.getQuiz("computer-basics");

test("seed quiz has at least 15 valid questions", () => {
    const quiz = demo();
    assert.ok(quiz.questions.length >= 15);
    assert.deepEqual(Store.validateQuiz(quiz), []);
    quiz.questions.forEach(q => assert.ok(q.correct >= 0 && q.correct < q.options.length));
});

test("parseEmails validates, lowercases, de-duplicates and accepts domains", () => {
    const {valid: valid, invalid: invalid} = Store.parseEmails('Ali@Uni.edu, ali@uni.edu; bad-email\n@campus.edu "sara@uni.edu"');
    assert.deepEqual(valid, [ "ali@uni.edu", "@campus.edu", "sara@uni.edu" ]);
    assert.deepEqual(invalid, [ "bad-email" ]);
});

test("isAllowed honours exact emails and domain rules", () => {
    const quiz = {
        allowedEmails: [ "ali@uni.edu", "@campus.edu" ]
    };
    assert.equal(Store.isAllowed(quiz, "ALI@uni.edu"), true);
    assert.equal(Store.isAllowed(quiz, "x@campus.edu"), true);
    assert.equal(Store.isAllowed(quiz, "x@evil-campus.edu"), false);
    assert.equal(Store.isAllowed(quiz, "other@uni.edu"), false);
    assert.equal(Store.isAllowed({
        allowedEmails: []
    }, "ali@uni.edu"), false);
});

test("quizzesFor only returns quizzes the email is enrolled in", () => {
    assert.equal(Store.quizzesFor("student@example.com").length, 1);
    assert.equal(Store.quizzesFor("stranger@example.com").length, 0);
});

test("shuffle returns a permutation and does not mutate the input", () => {
    const input = Array.from({
        length: 20
    }, (_, i) => i);
    const copy = input.slice();
    const out = Store.shuffle(input);
    assert.deepEqual(input, copy);
    assert.deepEqual(out.slice().sort((a, b) => a - b), copy);
});

function attemptWith(answerFn, extra = {}) {
    const quiz = demo();
    const order = quiz.questions.map(q => q.id);
    const answers = {};
    quiz.questions.forEach((q, i) => {
        const a = answerFn(q, i);
        if (a !== undefined) answers[q.id] = a;
    });
    return Store.buildAttempt({
        quiz: quiz,
        email: "student@example.com",
        name: "Student",
        order: order,
        answers: answers,
        startedAt: Date.now() - 9e4,
        autoSubmitted: false,
        ...extra
    });
}

test("buildAttempt scores correct, wrong and skipped answers", () => {
    const a = attemptWith((q, i) => i < 10 ? q.correct : i < 15 ? (q.correct + 1) % q.options.length : undefined);
    assert.equal(a.total, 20);
    assert.equal(a.score, 10);
    assert.equal(a.percent, 50);
    assert.equal(a.passed, true);
    assert.equal(a.items.filter(i => i.chosen === null).length, 5);
    assert.ok(a.timeTaken >= 89 && a.timeTaken <= 91);
});

test("buildAttempt: perfect score and fail case", () => {
    assert.equal(attemptWith(q => q.correct).percent, 100);
    const none = attemptWith(() => undefined);
    assert.equal(none.score, 0);
    assert.equal(none.passed, false);
});

test("buildAttempt caps time taken at the quiz duration", () => {
    const a = attemptWith(q => q.correct, {
        startedAt: Date.now() - 36e5
    });
    assert.equal(a.timeTaken, 600);
});

test("high-score table keeps each student best result, sorted, top 10", () => {
    const mk = (email, percent, timeTaken) => ({
        id: Store.uid("att"),
        quizId: "q1",
        email: email,
        name: email,
        score: percent,
        total: 100,
        percent: percent,
        timeTaken: timeTaken,
        submittedAt: Date.now()
    });
    Store.addAttempt(mk("a@x.com", 40, 100));
    Store.addAttempt(mk("b@x.com", 80, 200));
    Store.addAttempt(mk("a@x.com", 90, 300));
    Store.addAttempt(mk("b@x.com", 10, 50));
    Store.addAttempt(mk("c@x.com", 80, 100));
    const rows = Store.getScores("q1");
    assert.deepEqual(rows.map(r => r.email), [ "a@x.com", "c@x.com", "b@x.com" ]);
    for (let i = 0; i < 15; i++) Store.addAttempt(mk(`u${i}@x.com`, 50, 60));
    assert.equal(Store.getScores("q1").length, 10);
});

test("progress save, read and clear", () => {
    const p = {
        quizId: "q1",
        email: "A@x.com",
        order: [ "a" ],
        answers: {},
        current: 0,
        endsAt: 1
    };
    Store.saveProgress(p);
    assert.equal(Store.getProgress("q1", "a@x.com").endsAt, 1);
    Store.clearProgress("q1", "a@x.com");
    assert.equal(Store.getProgress("q1", "a@x.com"), null);
});

test("importQuizzes accepts valid quizzes and rejects invalid ones", () => {
    const good = {
        title: "Net",
        questions: [ {
            text: "Q?",
            options: [ "a", "b" ],
            correct: 1
        } ]
    };
    const bad = {
        title: "Bad",
        questions: [ {
            text: "Q?",
            options: [ "a" ],
            correct: 0
        } ]
    };
    const before = Store.getQuizzes().length;
    const res = Store.importQuizzes([ good, bad ]);
    assert.equal(res.added, 1);
    assert.equal(res.errors.length, 1);
    assert.equal(Store.getQuizzes().length, before + 1);
});

test("normalizeQuestion re-maps the correct index when blank options are dropped", () => {
    const q = Store.normalizeQuestion({
        text: "T",
        options: [ "", "x", "", "y" ],
        correct: 3
    });
    assert.deepEqual(q.options, [ "x", "y" ]);
    assert.equal(q.correct, 1);
    const lost = Store.normalizeQuestion({
        text: "T",
        options: [ "x", "", "y" ],
        correct: 1
    });
    assert.equal(lost.correct, -1);
});

test("saveQuiz persists across a reload and deleteQuiz removes it", async () => {
    const quiz = Store.normalizeQuiz({
        title: "Persist",
        questions: [ {
            text: "Q",
            options: [ "a", "b" ],
            correct: 0
        } ]
    });
    Store.saveQuiz(quiz);
    await Store.init();
    assert.ok(Store.getQuiz(quiz.id));
    Store.deleteQuiz(quiz.id);
    assert.equal(Store.getQuiz(quiz.id), null);
});

test("admin password: default, wrong, change, login", () => {
    assert.equal(Store.isDefaultAdminPassword(), true);
    assert.equal(Store.adminLogin("nope"), false);
    assert.equal(Store.adminLogin("admin123"), true);
    assert.equal(Store.isAdminAuthed(), true);
    assert.equal(Store.setAdminPassword("wrong", "newpassword").ok, false);
    assert.equal(Store.setAdminPassword("admin123", "abc").ok, false);
    assert.equal(Store.setAdminPassword("admin123", "newpassword").ok, true);
    Store.adminLogout();
    assert.equal(Store.adminLogin("admin123"), false);
    assert.equal(Store.adminLogin("newpassword"), true);
});

test("backup round-trip restores quizzes, attempts and scores", () => {
    Store.addAttempt(attemptWith(q => q.correct));
    const backup = JSON.parse(JSON.stringify(Store.exportBackup()));
    Store.clearAttempts();
    Store.deleteQuiz("computer-basics");
    assert.equal(Store.restoreBackup(backup).ok, true);
    assert.ok(Store.getQuiz("computer-basics"));
    assert.equal(Store.getAttempts().length, 1);
    assert.equal(Store.getScores("computer-basics").length, 1);
    assert.equal(Store.restoreBackup({
        nope: true
    }).ok, false);
});