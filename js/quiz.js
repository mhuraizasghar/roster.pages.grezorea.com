/* Quiz runner: one question at a time, countdown timer, progress bar, auto-submit, resume after refresh. */
(async function () {
  'use strict';
  const { $, esc, fmtTime } = U;

  await Store.init();

  const VIEWS = ['loading', 'errorView', 'introView', 'quizView'];
  const show = (id) => VIEWS.forEach((v) => $('#' + v).classList.toggle('d-none', v !== id));
  const fail = (title, message) => {
    $('#errorTitle').textContent = title;
    $('#errorMsg').textContent = message;
    show('errorView');
  };

  /* ---------- guards: signed in, quiz exists, email enrolled ---------- */

  const student = Store.getStudent();
  const quizId = new URLSearchParams(location.search).get('id');
  if (!student) {
    location.replace('index.html' + (quizId ? '?next=' + encodeURIComponent('quiz.html?id=' + quizId) : ''));
    return;
  }
  const quiz = Store.getQuiz(quizId);
  if (!quiz) return fail('Quiz not found', 'This quiz does not exist or has been removed.');
  if (!Store.isAllowed(quiz, student.email)) {
    return fail('Not enrolled', `${student.email} is not on the enrolment list for this quiz. Ask your instructor to add your email.`);
  }
  if (!quiz.questions.length) return fail('No questions yet', 'This quiz has no questions. Please try again later.');

  const qMap = new Map(quiz.questions.map((q) => [q.id, q]));
  const total = quiz.questions.length;
  let state = null; // { quizId, email, version, order[], answers{}, current, startedAt, endsAt }
  let timerId = null;
  let submitting = false;

  $('#navQuizTitle').textContent = quiz.title;

  /* ---------- resume or show instructions ---------- */

  state = Store.getProgress(quiz.id, student.email);
  const stale =
    state &&
    (state.version !== quiz.updatedAt || state.order.length !== total || !state.order.every((id) => qMap.has(id)));
  if (stale) {
    Store.clearProgress(quiz.id, student.email);
    state = null;
  }

  if (state) {
    enterQuiz();
  } else {
    renderIntro();
    show('introView');
  }

  function renderIntro() {
    $('#introSubject').textContent = quiz.subject || 'General';
    $('#introTitle').textContent = quiz.title;
    $('#introDesc').textContent = quiz.description;
    $('#introQuestions').textContent = total;
    $('#introDuration').textContent = quiz.durationMinutes;
    $('#introPass').textContent = quiz.passMark + '%';
    const used = Store.attemptsFor(student.email, quiz.id).length;
    if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) {
      const box = $('#introLimit');
      box.textContent = `You have used all ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? '' : 's'} for this quiz.`;
      box.classList.remove('d-none');
      $('#beginBtn').disabled = true;
    }
  }

  $('#beginBtn').addEventListener('click', () => {
    const now = Date.now();
    const ids = quiz.questions.map((q) => q.id);
    state = {
      quizId: quiz.id,
      email: student.email,
      version: quiz.updatedAt,
      order: quiz.shuffle ? Store.shuffle(ids) : ids, // randomised question order
      answers: {},
      current: 0,
      startedAt: now,
      endsAt: now + quiz.durationMinutes * 60 * 1000,
    };
    persist();
    enterQuiz();
  });

  function enterQuiz() {
    show('quizView');
    $('#timer').classList.remove('d-none');
    $('#totalCount').textContent = total;
    buildNavigator();
    render();
    tick();
    timerId = setInterval(tick, 250);
  }

  const persist = () => Store.saveProgress(state);
  const currentQuestion = () => qMap.get(state.order[state.current]);
  const answeredCount = () => state.order.filter((id) => Number.isInteger(state.answers[id])).length;

  /* ---------- timer ---------- */

  function tick() {
    const left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    $('#timerText').textContent = fmtTime(left);
    const timer = $('#timer');
    timer.classList.toggle('warn', left <= 120 && left > 60);
    timer.classList.toggle('danger', left <= 60);
    if (left <= 0) submit(true);
  }

  /* ---------- rendering ---------- */

  function render() {
    const q = currentQuestion();
    const chosen = state.answers[q.id];

    $('#qNumber').textContent = `Question ${state.current + 1} of ${total}`;
    $('#qText').textContent = q.text;
    $('#options').innerHTML = q.options
      .map(
        (opt, i) => `<label class="opt ${chosen === i ? 'selected' : ''}">
          <input type="radio" name="opt" value="${i}" ${chosen === i ? 'checked' : ''}>
          <span class="opt-key">${String.fromCharCode(65 + i)}</span>
          <span class="opt-text">${esc(opt)}</span>
        </label>`
      )
      .join('');

    $('#prevBtn').disabled = state.current === 0;
    $('#nextBtn').disabled = state.current === total - 1;
    $('#clearBtn').classList.toggle('invisible', !Number.isInteger(chosen));
    updateProgress();
    updateNavigator();
  }

  function updateProgress() {
    const done = answeredCount();
    const pct = Math.round((done / total) * 100);
    $('#answeredCount').textContent = done;
    $('#answeredPct').textContent = pct + '%';
    $('#progressBar').style.width = pct + '%';
    $('#progressWrap').setAttribute('aria-valuenow', pct);
  }

  function buildNavigator() {
    $('#qNav').innerHTML = state.order
      .map((_, i) => `<button type="button" data-i="${i}" aria-label="Go to question ${i + 1}">${i + 1}</button>`)
      .join('');
  }

  function updateNavigator() {
    $('#qNav')
      .querySelectorAll('button')
      .forEach((btn, i) => {
        btn.classList.toggle('current', i === state.current);
        btn.classList.toggle('answered', Number.isInteger(state.answers[state.order[i]]));
        btn.setAttribute('aria-current', i === state.current ? 'true' : 'false');
      });
  }

  /* ---------- actions ---------- */

  function go(delta) {
    const next = state.current + delta;
    if (next < 0 || next >= total) return;
    state.current = next;
    persist();
    render();
  }

  function select(index) {
    state.answers[currentQuestion().id] = index;
    persist();
    render();
  }

  $('#options').addEventListener('change', (e) => {
    if (e.target.name === 'opt') select(Number(e.target.value));
  });
  $('#prevBtn').addEventListener('click', () => go(-1));
  $('#nextBtn').addEventListener('click', () => go(1));
  $('#clearBtn').addEventListener('click', () => {
    delete state.answers[currentQuestion().id];
    persist();
    render();
  });
  $('#qNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    state.current = Number(btn.dataset.i);
    persist();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (!state || submitting || $('#quizView').classList.contains('d-none')) return;
    if (document.querySelector('.modal.show')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const onRadio = e.target.tagName === 'INPUT' && e.target.type === 'radio';
    if (e.key === 'ArrowRight' && !onRadio) go(1);
    else if (e.key === 'ArrowLeft' && !onRadio) go(-1);
    else if (e.key.length === 1) {
      const idx = 'abcdef'.indexOf(e.key.toLowerCase());
      if (idx > -1 && idx < currentQuestion().options.length) select(idx);
    }
  });

  /* ---------- submit ---------- */

  const submitModal = new bootstrap.Modal($('#submitModal'));
  const timeUpModal = new bootstrap.Modal($('#timeUpModal'));

  $('#submitBtn').addEventListener('click', () => {
    const left = total - answeredCount();
    $('#submitSummary').innerHTML = left
      ? `You have answered <strong>${answeredCount()}</strong> of <strong>${total}</strong> questions. <strong>${left}</strong> unanswered question${left === 1 ? '' : 's'} will be marked as skipped.`
      : `You have answered all <strong>${total}</strong> questions. Ready to submit?`;
    submitModal.show();
  });
  $('#confirmSubmit').addEventListener('click', () => submit(false));

  function submit(auto) {
    if (submitting) return;
    submitting = true;
    clearInterval(timerId);
    submitModal.hide();
    if (auto) timeUpModal.show();

    const attempt = Store.buildAttempt({
      quiz,
      email: student.email,
      name: student.name,
      order: state.order,
      answers: state.answers,
      startedAt: state.startedAt,
      autoSubmitted: auto,
    });
    Store.addAttempt(attempt);
    Store.clearProgress(quiz.id, student.email);
    Store.setLastAttempt(attempt.id);

    const goToResult = () => location.replace('result.html?attempt=' + encodeURIComponent(attempt.id));
    if (auto) setTimeout(goToResult, 1600);
    else goToResult();
  }
})();
