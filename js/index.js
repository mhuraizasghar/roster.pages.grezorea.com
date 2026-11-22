/* Home page: student sign-in (email allow-list), quiz catalogue, attempt history, high scores. */
(async function () {
  'use strict';
  const { $, esc, fmtDate, scoreRows } = U;

  await Store.init();
  $('#loading').classList.add('d-none');

  const loginView = $('#loginView');
  const studentView = $('#studentView');
  const loginForm = $('#loginForm');
  const loginAlert = $('#loginAlert');

  /* Only allow redirects back into a quiz, never to arbitrary URLs. */
  const nextParam = new URLSearchParams(location.search).get('next');
  const safeNext = nextParam && /^quiz\.html\?id=[\w.-]+$/.test(nextParam) ? nextParam : null;

  function render() {
    const student = Store.getStudent();
    loginView.classList.toggle('d-none', !!student);
    studentView.classList.toggle('d-none', !student);
    $('#logoutBtn').classList.toggle('d-none', !student);
    $('#navUser').classList.toggle('d-none', !student);
    if (student) {
      $('#navUser').textContent = student.email;
      renderStudent(student);
    }
  }

  /* ---------- sign in ---------- */

  function setValidity(input, ok) {
    input.classList.toggle('is-invalid', !ok);
    return ok;
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginAlert.classList.add('d-none');
    const nameInput = $('#nameInput');
    const emailInput = $('#emailInput');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();

    const nameOk = setValidity(nameInput, name.length >= 2);
    const emailOk = setValidity(emailInput, Store.isEmail(email));
    if (!nameOk || !emailOk) return;

    if (!Store.quizzesFor(email).length) {
      loginAlert.textContent =
        'This email is not enrolled in any quiz yet. Ask your instructor to add it, then try again.';
      loginAlert.classList.remove('d-none');
      return;
    }
    Store.setStudent({ email, name });
    if (safeNext) {
      location.href = safeNext;
      return;
    }
    render();
  });

  $('#logoutBtn').addEventListener('click', () => {
    Store.clearStudent();
    loginForm.reset();
    render();
  });

  /* ---------- dashboard ---------- */

  function quizCard(q, student) {
    const used = Store.attemptsFor(student.email, q.id).length;
    const resuming = !!Store.getProgress(q.id, student.email);
    const locked = !resuming && q.maxAttempts > 0 && used >= q.maxAttempts;
    const attemptsText = q.maxAttempts > 0 ? `${used}/${q.maxAttempts} attempts used` : `${used} attempt${used === 1 ? '' : 's'}`;
    const action = locked
      ? '<button class="btn btn-secondary w-100" disabled><i class="fa-solid fa-lock me-2"></i>No attempts left</button>'
      : `<a class="btn btn-primary w-100" href="quiz.html?id=${encodeURIComponent(q.id)}">
           <i class="fa-solid ${resuming ? 'fa-play' : 'fa-rocket'} me-2"></i>${resuming ? 'Resume quiz' : 'Start quiz'}</a>`;
    return `<div class="col-md-6 col-xl-4">
      <div class="card qh-card h-100"><div class="card-body d-flex flex-column">
        <span class="badge soft-badge align-self-start mb-2">${esc(q.subject || 'General')}</span>
        <h3 class="h5">${esc(q.title)}</h3>
        <p class="text-muted small flex-grow-1">${esc(q.description)}</p>
        <ul class="list-inline small text-muted mb-3">
          <li class="list-inline-item me-3"><i class="fa-regular fa-circle-question me-1"></i>${q.questions.length} questions</li>
          <li class="list-inline-item me-3"><i class="fa-regular fa-clock me-1"></i>${q.durationMinutes} min</li>
          <li class="list-inline-item"><i class="fa-solid fa-flag-checkered me-1"></i>Pass ${q.passMark}%</li>
        </ul>
        <div class="small text-muted mb-3">${attemptsText}</div>
        ${action}
      </div></div></div>`;
  }

  function renderStudent(student) {
    $('#welcomeName').textContent = student.name;
    const quizzes = Store.quizzesFor(student.email);

    $('#quizGrid').innerHTML = quizzes.length
      ? quizzes.map((q) => quizCard(q, student)).join('')
      : '<div class="col-12"><div class="alert alert-warning mb-0">No quizzes are available for your email right now.</div></div>';

    const attempts = Store.getAttempts()
      .filter((a) => a.email === student.email)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, 10);
    $('#attemptsBody').innerHTML = attempts.length
      ? attempts
          .map(
            (a) => `<tr>
              <td class="fw-medium">${esc(a.quizTitle)}</td>
              <td class="text-muted small">${esc(fmtDate(a.submittedAt))}</td>
              <td class="text-end">${a.score}/${a.total}</td>
              <td class="text-end"><span class="badge ${a.passed ? 'text-bg-success' : 'text-bg-danger'}">${a.percent}%</span></td>
              <td class="text-end"><a class="btn btn-sm btn-outline-primary" href="result.html?attempt=${encodeURIComponent(a.id)}">Review</a></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="text-center text-muted py-4">You have not attempted a quiz yet.</td></tr>';

    const select = $('#lbQuiz');
    const previous = select.value;
    select.innerHTML = quizzes.map((q) => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('');
    if (quizzes.some((q) => q.id === previous)) select.value = previous;
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const student = Store.getStudent();
    const quizId = $('#lbQuiz').value;
    $('#lbBody').innerHTML = scoreRows(quizId ? Store.getScores(quizId) : [], student && student.email);
  }
  $('#lbQuiz').addEventListener('change', renderLeaderboard);

  render();
})();
