/* Result page: score, percentage, full answer review (chosen vs correct) and the high-score table. */
(async function () {
  'use strict';
  const { $, $$, esc, fmtTime, scoreRows } = U;

  await Store.init();
  $('#loading').classList.add('d-none');

  const message = (title, text) => {
    $('#messageTitle').textContent = title;
    $('#messageText').textContent = text;
    $('#messageView').classList.remove('d-none');
  };

  const params = new URLSearchParams(location.search);
  const id = params.get('attempt') || Store.getLastAttempt();
  const attempt = id ? Store.getAttempt(id) : null;
  if (!attempt) return message('No result found', 'We could not find that attempt. Take a quiz first, then your result will appear here.');

  const student = Store.getStudent();
  const isAdmin = Store.isAdminAuthed();
  if (!isAdmin && (!student || student.email !== attempt.email)) {
    return message('This result is private', 'Sign in with the email that took this quiz to see the result.');
  }

  /* ---------- summary ---------- */

  const correct = attempt.items.filter((i) => i.isCorrect).length;
  const skipped = attempt.items.filter((i) => i.chosen === null).length;
  const wrong = attempt.total - correct - skipped;

  const ring = $('#ring');
  ring.style.setProperty('--pct', attempt.percent);
  ring.style.setProperty('--ring', attempt.passed ? 'var(--qh-ok)' : 'var(--qh-bad)');
  $('#ringPct').textContent = attempt.percent + '%';
  $('#ringScore').textContent = `${attempt.score} / ${attempt.total}`;

  const badge = $('#passBadge');
  badge.className = 'badge mb-2 ' + (attempt.passed ? 'text-bg-success' : 'text-bg-danger');
  badge.innerHTML = attempt.passed
    ? '<i class="fa-solid fa-circle-check me-1"></i>Passed'
    : '<i class="fa-solid fa-circle-xmark me-1"></i>Not passed';

  const headline =
    attempt.percent >= 90 ? 'Outstanding work!' :
    attempt.percent >= 75 ? 'Great job!' :
    attempt.passed ? 'Well done, you passed.' : 'Keep practising, you can do it.';
  $('#resultHeadline').textContent = headline;
  $('#resultSub').textContent = `${attempt.quizTitle} · pass mark ${attempt.passMark}% · ${attempt.name}`;
  $('#statCorrect').textContent = correct;
  $('#statWrong').textContent = wrong;
  $('#statSkipped').textContent = skipped;
  $('#statTime').textContent = fmtTime(attempt.timeTaken);
  $('#autoNote').classList.toggle('d-none', !attempt.autoSubmitted);
  $('#retakeBtn').href = 'quiz.html?id=' + encodeURIComponent(attempt.quizId);
  if (!Store.getQuiz(attempt.quizId) || !student) $('#retakeBtn').classList.add('d-none');

  /* ---------- review ---------- */

  const statusOf = (item) => (item.chosen === null ? 'skipped' : item.isCorrect ? 'correct' : 'wrong');
  const STATUS = {
    correct: '<span class="badge text-bg-success"><i class="fa-solid fa-check me-1"></i>Correct</span>',
    wrong: '<span class="badge text-bg-danger"><i class="fa-solid fa-xmark me-1"></i>Incorrect</span>',
    skipped: '<span class="badge text-bg-warning"><i class="fa-solid fa-forward me-1"></i>Skipped</span>',
  };

  $('#reviewList').innerHTML = attempt.items
    .map((item, n) => {
      const status = statusOf(item);
      const options = item.options
        .map((opt, i) => {
          const isCorrect = i === item.correct;
          const isChosen = i === item.chosen;
          const cls = isCorrect ? 'correct' : isChosen ? 'wrong' : '';
          const tags = [
            isChosen ? '<span class="badge text-bg-dark ms-1">Your answer</span>' : '',
            isCorrect ? '<span class="badge text-bg-success ms-1">Correct answer</span>' : '',
          ].join('');
          const icon = isCorrect ? 'fa-check' : isChosen ? 'fa-xmark' : '';
          return `<li class="rev-opt ${cls}">
            <span class="rev-key">${icon ? `<i class="fa-solid ${icon}"></i>` : String.fromCharCode(65 + i)}</span>
            <span class="rev-text">${esc(opt)}</span>${tags}
          </li>`;
        })
        .join('');
      return `<article class="card qh-card rev-card" data-status="${status}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="small text-muted fw-semibold">Question ${n + 1}</span>${STATUS[status]}
          </div>
          <h3 class="h6 mb-3">${esc(item.text)}</h3>
          <ul class="list-unstyled mb-2">${options}</ul>
          ${status === 'skipped' ? '<p class="small text-muted mb-2">You did not answer this question.</p>' : ''}
          ${item.explanation ? `<div class="explain"><i class="fa-regular fa-lightbulb me-2"></i>${esc(item.explanation)}</div>` : ''}
        </div>
      </article>`;
    })
    .join('');

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    $$('#filters button').forEach((b) => b.classList.toggle('active', b === btn));
    const f = btn.dataset.filter;
    $$('#reviewList .rev-card').forEach((card) => card.classList.toggle('d-none', f !== 'all' && card.dataset.status !== f));
  });

  /* ---------- high scores ---------- */

  const scores = Store.getScores(attempt.quizId);
  $('#lbQuizName').textContent = attempt.quizTitle;
  $('#lbBody').innerHTML = scoreRows(scores, attempt.email);
  const pos = scores.findIndex((s) => s.email === attempt.email);
  $('#rankNote').textContent = pos === -1
    ? 'Your best score is not in the top 10 yet.'
    : `Your best result ranks #${pos + 1} of ${scores.length} on this device's leaderboard.`;

  $('#printBtn').classList.remove('d-none');
  $('#printBtn').addEventListener('click', () => window.print());
  $('#resultView').classList.remove('d-none');
})();
