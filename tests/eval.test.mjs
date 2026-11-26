import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  buildCsvReport,
  csvCell,
  gradeQuestion,
  isValidEmail,
  matchShortAnswer,
  normalizeEmail,
  parseBulkRoster,
  recalculateAttemptScore,
  sanitizeQuestionForStudent,
} from '../server/grading.js';
import { createDatabase } from '../server/db.js';
import { createEvalApp } from '../server/app.js';
import { createMailer } from '../server/mailer.js';

test('normalizeEmail & isValidEmail', () => {
  assert.equal(normalizeEmail('  Ali.Khan@University.EDU '), 'ali.khan@university.edu');
  assert.equal(isValidEmail('valid.student@edu.pk'), true);
  assert.equal(isValidEmail('bad-email@'), false);
  assert.equal(isValidEmail('missingdomain.com'), false);
});

test('parseBulkRoster handles CSV headers, duplicates, and invalid rows', () => {
  const existing = new Set(['already@school.edu']);
  const csv = [
    'email,name,group',
    '  NEW1@School.edu , First Student , Section A',
    'already@school.edu, Dup Existing , Section A',
    'new1@school.edu, Dup In Batch , Section A',
    'not-an-email, Bad Row , Section A',
    'second@school.edu, Second Student , Section B',
  ].join('\n');

  const res = parseBulkRoster(csv, existing);
  assert.equal(res.validEntries.length, 2);
  assert.equal(res.validEntries[0].email, 'new1@school.edu');
  assert.equal(res.validEntries[0].displayName, 'First Student');
  assert.equal(res.validEntries[0].groupName, 'Section A');
  assert.equal(res.duplicates.length, 2);
  assert.deepEqual(res.invalid, ['not-an-email']);
});

test('matchShortAnswer supports case-insensitivity, space ignoring, and minor typos', () => {
  assert.equal(
    matchShortAnswer('  binary   search ', ['Binary Search'], {
      caseSensitive: false,
      ignoreSpaces: true,
      allowMinorSpelling: true,
    }),
    true
  );
  // 1 edit typo in >= 4 char answer
  assert.equal(
    matchShortAnswer('photosyntesis', ['photosynthesis'], { allowMinorSpelling: true }),
    true
  );
  assert.equal(
    matchShortAnswer('photosynthesis', ['photosynthesis'], { caseSensitive: true }),
    true
  );
  assert.equal(
    matchShortAnswer('Photosynthesis', ['photosynthesis'], { caseSensitive: true, allowMinorSpelling: false }),
    false
  );
});

test('gradeQuestion handles MCQ single/multi, T/F, Short Answer, and Challenge speed bonus', () => {
  const mcqSingle = { type: 'mcq', correctAnswer: 2, points: 2 };
  assert.deepEqual(gradeQuestion(mcqSingle, 2), { isCorrect: true, awardedPoints: 2 });
  assert.deepEqual(gradeQuestion(mcqSingle, 1), { isCorrect: false, awardedPoints: 0 });

  const mcqMulti = { type: 'mcq', correctAnswer: [0, 2], points: 4 };
  assert.deepEqual(gradeQuestion(mcqMulti, [2, 0]), { isCorrect: true, awardedPoints: 4 });
  assert.deepEqual(gradeQuestion(mcqMulti, [0]), { isCorrect: false, awardedPoints: 0 });

  const tfQ = { type: 'tf', correctAnswer: false, points: 1 };
  assert.deepEqual(gradeQuestion(tfQ, false), { isCorrect: true, awardedPoints: 1 });
  assert.deepEqual(gradeQuestion(tfQ, true), { isCorrect: false, awardedPoints: 0 });

  const challengeQ = { type: 'challenge', correctAnswer: 1, points: 100, timeLimitSec: 20 };
  const instant = gradeQuestion(challengeQ, 1, { elapsedSec: 0 });
  const slow = gradeQuestion(challengeQ, 1, { elapsedSec: 20 });
  assert.equal(instant.isCorrect, true);
  assert.equal(instant.awardedPoints, 150);
  assert.equal(slow.awardedPoints, 100);
});

test('recalculateAttemptScore computes totals accurately', () => {
  const qs = [{ points: 2 }, { points: 3 }, { points: 5 }];
  const ans = [{ awardedPoints: 2 }, { awardedPoints: 0 }, { awardedPoints: 5 }];
  assert.deepEqual(recalculateAttemptScore(qs, ans), {
    score: 7,
    maxScore: 10,
    percent: 70,
  });
});

test('sanitizeQuestionForStudent never leaks answer keys unless revealed', () => {
  const q = {
    id: 'q1',
    position: 0,
    type: 'mcq',
    prompt: '2+2?',
    options: ['3', '4'],
    correctAnswer: [0, 1],
    acceptedAnswers: ['4'],
    explanation: 'Math.',
    points: 1,
    timeLimitSec: 20,
  };
  const hidden = sanitizeQuestionForStudent(q, false);
  assert.equal('correctAnswer' in hidden, false);
  assert.equal('acceptedAnswers' in hidden, false);
  assert.equal('explanation' in hidden, false);
  assert.equal(hidden.multiSelect, true);

  const revealed = sanitizeQuestionForStudent(q, true);
  assert.deepEqual(revealed.correctAnswer, [0, 1]);
  assert.equal(revealed.explanation, 'Math.');
});

test('csvCell neutralizes spreadsheet formula injection', () => {
  assert.equal(csvCell('=SUM(A1:A2)'), `"'=SUM(A1:A2)"`);
  const report = buildCsvReport(['Name', 'Note'], [['Alice', '+cmd|calc']]);
  assert.ok(report.includes(`"'+cmd|calc"`));
});

test('Snapshot isolation and roster access helpers', () => {
  const db = createDatabase({ persist: false });
  const teacherId = 't_demo_sarah';
  const quiz = db.state.quizzes.find((q) => q.ownerId === teacherId);
  assert.ok(quiz);

  const snap = db.createSnapshot(quiz, teacherId);
  const originalPrompt = snap.questions[0].prompt;
  // Mutate live draft
  quiz.draftQuestions[0].prompt = 'EDITED LIVE DRAFT PROMPT';

  const fetchedSnap = db.getVersion(snap.id);
  assert.equal(fetchedSnap.questions[0].prompt, originalPrompt);

  assert.equal(db.isEmailOnTeacherRoster(teacherId, 'ALI.KHAN@university.edu'), true);
  assert.equal(db.isEmailOnTeacherRoster(teacherId, 'stranger@nowhere.edu'), false);
  assert.equal(db.getTeachersForStudentEmail('ali.khan@university.edu').length >= 2, true);
});

test('API integration: dual portals, roster gating, assignment attempt, and live room', async (t) => {
  const db = createDatabase({ persist: false });
  const { app } = createEvalApp(db);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function req(path, { method = 'GET', token = null, body = null } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, data: json, raw: text };
  }

  // 1. Non-rostered student cannot request OTP
  const blockedOtp = await req('/api/auth/student/request-otp', {
    method: 'POST',
    body: { email: 'uninvited@stranger.org' },
  });
  assert.equal(blockedOtp.status, 403);
  assert.equal(blockedOtp.data.errorCode, 'NOT_ON_ROSTER');

  // 2. Teacher account hitting student portal gets WRONG_PORTAL
  const wrongPortal = await req('/api/auth/student/request-otp', {
    method: 'POST',
    body: { email: 'teacher@eval.demo' },
  });
  assert.equal(wrongPortal.status, 403);
  assert.equal(wrongPortal.data.errorCode, 'WRONG_PORTAL');

  // 3. Demo teacher login
  const tLogin = await req('/api/auth/teacher/login', {
    method: 'POST',
    body: { email: 'teacher@eval.demo', password: 'TeacherEval2026!' },
  });
  assert.equal(tLogin.status, 200);
  const teacherToken = tLogin.data.token;

  // 4. Rostered pending student OTP login activates roster entry
  const otpReq = await req('/api/auth/student/request-otp', {
    method: 'POST',
    body: { email: 'zainab.iqbal@institute.org' },
  });
  assert.equal(otpReq.status, 200);
  const otpVerify = await req('/api/auth/student/verify-otp', {
    method: 'POST',
    body: { email: 'zainab.iqbal@institute.org', code: otpReq.data.devOtp },
  });
  assert.equal(otpVerify.status, 200);
  const studentToken = otpVerify.data.token;

  // Verify roster entry became active
  const rosterRes = await req('/api/roster', { token: teacherToken });
  const zainab = rosterRes.data.entries.find((e) => e.studentEmail === 'zainab.iqbal@institute.org');
  assert.equal(zainab.status, 'active');

  // 5. Teacher creates assignment targeting all_roster with showAnswersAfterSubmit = false
  const libRes = await req('/api/library', { token: teacherToken });
  const quiz = libRes.data.quizzes[0];
  const asgCreate = await req('/api/assignments', {
    method: 'POST',
    token: teacherToken,
    body: {
      quizId: quiz.id,
      title: 'Test Snapshot Assignment',
      targetType: 'all_roster',
      settings: { showAnswersAfterSubmit: false, maxAttempts: 1 },
    },
  });
  assert.equal(asgCreate.status, 201);
  const asgId = asgCreate.data.assignment.id;

  // 6. Student starts, answers, submits, and reviews (answers hidden)
  const started = await req('/api/attempts/start', {
    method: 'POST',
    token: studentToken,
    body: { assignmentId: asgId },
  });
  assert.equal(started.status, 200);
  assert.equal('correctAnswer' in started.data.questions[0], false);

  const attemptId = started.data.attempt.id;
  await req(`/api/attempts/${attemptId}/answer`, {
    method: 'PUT',
    token: studentToken,
    body: { questionId: started.data.questions[0].id, response: 0 },
  });
  const submitted = await req(`/api/attempts/${attemptId}/submit`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.status, 'submitted');

  const review = await req(`/api/attempts/${attemptId}/review`, { token: studentToken });
  assert.equal(review.status, 200);
  assert.equal(review.data.showAnswers, false);
  assert.equal('correctAnswer' in review.data.items[0].question, false);

  // 7. CSV Report export
  const csvRes = await req(`/api/reports/export.csv?type=assignment&id=${encodeURIComponent(asgId)}`, {
    token: teacherToken,
  });
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.raw.includes('zainab.iqbal@institute.org'));
});

test('Mailer renders branded Resend emails with EVAL logo and delivers verification, OTP, recovery, and results', async (t) => {
  const sentEmails = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.resend.com/emails') {
      sentEmails.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `re_msg_${sentEmails.length}` }),
      };
    }
    return origFetch(url, init);
  };
  t.after(() => {
    globalThis.fetch = origFetch;
  });

  const mailer = createMailer({
    apiKey: 're_test_dummy_key',
    fromEmail: 'noreply@pages.grezorea.com',
    appUrl: 'https://eval.pages.grezorea.com',
  });

  assert.equal(mailer.isConfigured(), true);
  await mailer.sendTeacherVerification({ to: 'prof@univ.edu', displayName: 'Dr. Noor', token: 'tok123' });
  await mailer.sendStudentOtp({ to: 'stu@univ.edu', code: '654321' });
  await mailer.sendPasswordReset({ to: 'prof@univ.edu', displayName: 'Dr. Noor', token: 'rst999' });
  await mailer.sendAttemptResult({
    to: 'stu@univ.edu',
    studentName: 'Ali',
    title: 'Midterm Quiz',
    sourceLabel: 'Assignment',
    score: 9,
    maxScore: 10,
    percent: 90,
    attemptId: 'att_1',
    showAnswers: true,
  });

  assert.equal(sentEmails.length, 4);
  for (const mail of sentEmails) {
    assert.equal(mail.from, 'EVAL Assessment <noreply@pages.grezorea.com>');
    assert.ok(mail.html.includes('https://eval.pages.grezorea.com/eval-logo.png'));
    assert.ok(mail.html.includes('#49111c'));
  }
  assert.ok(sentEmails[0].html.includes('/teacher/login?verify=tok123'));
  assert.ok(sentEmails[1].html.includes('654321'));
  assert.ok(sentEmails[2].html.includes('/teacher/reset?token=rst999'));
  assert.ok(sentEmails[3].html.includes('90%'));
});
