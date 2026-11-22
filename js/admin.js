/* Admin panel: manage quizzes, questions, enrolled emails, results, publishing and backups. */
(async function () {
  'use strict';
  const { $, $$, esc, fmtDate, fmtTime, toast, confirmDialog, download, readFileText } = U;

  await Store.init();
  $('#loading').classList.add('d-none');

  let draft = null; // working copy of the quiz being edited
  let qDraft = null; // working copy of the question in the modal
  let qIndex = -1; // index of the question being edited, -1 = new
  const questionModal = new bootstrap.Modal($('#questionModal'));

  /* ---------- auth & navigation ---------- */

  function renderAuth() {
    const ok = Store.isAdminAuthed();
    $('#loginView').classList.toggle('d-none', ok);
    $('#appView').classList.toggle('d-none', !ok);
    $('#adminLogout').classList.toggle('d-none', !ok);
    $('#defaultHint').classList.toggle('d-none', !Store.isDefaultAdminPassword());
    if (ok) showView('quizzesView');
  }

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = Store.adminLogin($('#adminPassword').value);
    $('#loginAlert').classList.toggle('d-none', ok);
    if (ok) {
      $('#adminPassword').value = '';
      renderAuth();
    }
  });
  $('#adminLogout').addEventListener('click', () => {
    Store.adminLogout();
    renderAuth();
  });

  function showView(id) {
    $$('[data-view-panel]').forEach((p) => p.classList.toggle('d-none', p.id !== id));
    $$('#tabs .nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    if (id === 'quizzesView') renderQuizTable();
    if (id === 'resultsView') renderResults();
    window.scrollTo({ top: 0 });
  }
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) showView(b.dataset.view);
  });

  /* ---------- quiz list ---------- */

  function renderQuizTable() {
    const quizzes = Store.getQuizzes();
    $('#quizTable').innerHTML = quizzes.length
      ? quizzes
          .map(
            (q) => `<tr>
              <td><div class="fw-semibold">${esc(q.title)}</div><div class="small text-muted">${esc(q.subject || 'No subject')}</div></td>
              <td class="text-center">${q.questions.length}</td>
              <td class="text-center">${q.allowedEmails.length}</td>
              <td class="text-center">${q.durationMinutes} min</td>
              <td class="small text-muted">${esc(fmtDate(q.updatedAt))}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${esc(q.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-secondary" data-act="dup" data-id="${esc(q.id)}" title="Duplicate"><i class="fa-regular fa-copy"></i></button>
                <button class="btn btn-sm btn-outline-secondary" data-act="export" data-id="${esc(q.id)}" title="Export JSON"><i class="fa-solid fa-file-export"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-act="delete" data-id="${esc(q.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </td></tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="text-center text-muted py-5">No quizzes yet. Create one or import a JSON file.</td></tr>';
  }

  $('#quizTable').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const quiz = Store.getQuiz(btn.dataset.id);
    if (!quiz) return;
    const act = btn.dataset.act;
    if (act === 'edit') openEditor(Store.clone(quiz), false);
    else if (act === 'dup') {
      const copy = Store.clone(quiz);
      copy.id = Store.uid('quiz');
      copy.title = `${quiz.title} (copy)`;
      Store.saveQuiz(copy);
      renderQuizTable();
      toast('Quiz duplicated.');
    } else if (act === 'export') {
      download(`${quiz.id}.json`, JSON.stringify(quiz, null, 2));
    } else if (act === 'delete') {
      const ok = await confirmDialog({
        title: 'Delete quiz?',
        body: `"${quiz.title}" and its question bank will be removed. Past results are kept.`,
        okLabel: 'Delete',
      });
      if (ok) {
        Store.deleteQuiz(quiz.id);
        renderQuizTable();
        toast('Quiz deleted.', 'info');
      }
    }
  });

  $('#newQuizBtn').addEventListener('click', () =>
    openEditor(
      {
        id: Store.uid('quiz'), title: '', subject: '', description: '', durationMinutes: 10, passMark: 50,
        shuffle: true, maxAttempts: 0, allowedEmails: [], questions: [],
      },
      true
    )
  );

  $('#importQuizBtn').addEventListener('click', () => $('#importQuizFile').click());
  $('#importQuizFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = Store.importQuizzes(JSON.parse(await readFileText(file)));
      renderQuizTable();
      if (result.added) toast(`Imported ${result.added} quiz${result.added === 1 ? '' : 'zes'}.`);
      if (result.errors.length) toast(result.errors.join(' '), 'warning');
    } catch (err) {
      toast('That file is not valid JSON.', 'danger');
    }
  });

  /* ---------- quiz editor ---------- */

  function openEditor(quiz, isNew) {
    draft = quiz;
    $('#editorTitle').textContent = isNew ? 'New quiz' : 'Edit quiz';
    $('#editorErrors').classList.add('d-none');
    $('#qzTitle').value = quiz.title;
    $('#qzSubject').value = quiz.subject;
    $('#qzDesc').value = quiz.description;
    $('#qzDuration').value = quiz.durationMinutes;
    $('#qzPass').value = quiz.passMark;
    $('#qzMax').value = quiz.maxAttempts;
    $('#qzShuffle').checked = quiz.shuffle;
    $('#qzEmails').value = quiz.allowedEmails.join('\n');
    updateEmailStats();
    renderQuestionList();
    showView('editorView');
    $$('#tabs .nav-link').forEach((b) => b.classList.remove('active'));
  }

  function renderQuestionList() {
    $('#qCount').textContent = draft.questions.length;
    $('#questionList').innerHTML = draft.questions.length
      ? draft.questions
          .map(
            (q, i) => `<div class="q-row">
              <span class="q-index">${i + 1}</span>
              <div class="flex-grow-1 min-w-0">
                <div class="fw-medium">${esc(q.text)}</div>
                <div class="small text-muted"><i class="fa-solid fa-check text-success me-1"></i>${esc(q.options[q.correct] || '')} · ${q.options.length} options</div>
              </div>
              <div class="btn-group btn-group-sm flex-none">
                <button class="btn btn-outline-secondary" data-q="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                <button class="btn btn-outline-secondary" data-q="down" data-i="${i}" ${i === draft.questions.length - 1 ? 'disabled' : ''} aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="btn btn-outline-primary" data-q="edit" data-i="${i}" aria-label="Edit question"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-outline-danger" data-q="delete" data-i="${i}" aria-label="Delete question"><i class="fa-solid fa-trash"></i></button>
              </div></div>`
          )
          .join('')
      : '<div class="text-center text-muted py-5">No questions yet. Click <strong>Add question</strong>.</div>';
  }

  $('#questionList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-q]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const act = btn.dataset.q;
    if (act === 'edit') openQuestionModal(i);
    else if (act === 'delete') draft.questions.splice(i, 1);
    else if (act === 'up' && i > 0) [draft.questions[i - 1], draft.questions[i]] = [draft.questions[i], draft.questions[i - 1]];
    else if (act === 'down' && i < draft.questions.length - 1) [draft.questions[i + 1], draft.questions[i]] = [draft.questions[i], draft.questions[i + 1]];
    renderQuestionList();
  });

  /* enrolled emails */
  function updateEmailStats() {
    const { valid, invalid } = Store.parseEmails($('#qzEmails').value);
    $('#emailValid').textContent = valid.length;
    $('#emailInvalidCount').textContent = invalid.length;
    $('#emailInvalidWrap').classList.toggle('d-none', !invalid.length);
    $('#invalidEmails').innerHTML = invalid.map((x) => `<span class="chip-bad">${esc(x)}</span>`).join('');
  }
  $('#qzEmails').addEventListener('input', updateEmailStats);
  $('#emailClearBtn').addEventListener('click', () => {
    $('#qzEmails').value = '';
    updateEmailStats();
  });
  $('#emailFileBtn').addEventListener('click', () => $('#emailFile').click());
  $('#emailFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const existing = $('#qzEmails').value.trim();
    $('#qzEmails').value = (existing ? existing + '\n' : '') + (await readFileText(file));
    updateEmailStats();
    toast('Emails added from file.');
  });

  function readEditorForm() {
    draft.title = $('#qzTitle').value.trim();
    draft.subject = $('#qzSubject').value.trim();
    draft.description = $('#qzDesc').value.trim();
    draft.durationMinutes = Math.min(180, Math.max(1, parseInt($('#qzDuration').value, 10) || 10));
    draft.passMark = Math.min(100, Math.max(0, parseInt($('#qzPass').value, 10) || 0));
    draft.maxAttempts = Math.min(50, Math.max(0, parseInt($('#qzMax').value, 10) || 0));
    draft.shuffle = $('#qzShuffle').checked;
    draft.allowedEmails = Store.parseEmails($('#qzEmails').value).valid;
  }

  $('#saveQuizBtn').addEventListener('click', () => {
    readEditorForm();
    const errors = Store.validateQuiz(draft);
    const { invalid } = Store.parseEmails($('#qzEmails').value);
    if (invalid.length) errors.push(`Fix or remove ${invalid.length} invalid email${invalid.length === 1 ? '' : 's'}.`);
    const box = $('#editorErrors');
    if (errors.length) {
      box.innerHTML = '<strong>Please fix the following:</strong><ul class="mb-0"></ul>';
      errors.forEach((msg) => {
        const li = document.createElement('li');
        li.textContent = msg;
        box.querySelector('ul').appendChild(li);
      });
      box.classList.remove('d-none');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    Store.saveQuiz(draft);
    toast('Quiz saved.');
    showView('quizzesView');
  });
  const leaveEditor = () => showView('quizzesView');
  $('#cancelEditBtn').addEventListener('click', leaveEditor);
  $('#backBtn').addEventListener('click', leaveEditor);

  /* ---------- question modal ---------- */

  function openQuestionModal(index) {
    qIndex = index;
    qDraft = index === -1
      ? { id: Store.uid('q'), text: '', options: ['', '', '', ''], correct: 0, explanation: '' }
      : { ...Store.clone(draft.questions[index]) };
    $('#qmTitle').textContent = index === -1 ? 'Add question' : `Edit question ${index + 1}`;
    $('#qmText').value = qDraft.text;
    $('#qmExplain').value = qDraft.explanation || '';
    $('#qmError').classList.add('d-none');
    renderOptionRows();
    questionModal.show();
  }

  function renderOptionRows() {
    $('#qmOptions').innerHTML = qDraft.options
      .map(
        (text, i) => `<div class="opt-edit">
          <input class="form-check-input" type="radio" name="qmCorrect" value="${i}" ${qDraft.correct === i ? 'checked' : ''} aria-label="Mark option ${i + 1} as correct">
          <input class="form-control" data-opt="${i}" value="${esc(text)}" placeholder="Option ${String.fromCharCode(65 + i)}" maxlength="200" aria-label="Option ${i + 1} text">
          <button type="button" class="btn btn-outline-danger btn-sm" data-remove="${i}" ${qDraft.options.length <= 2 ? 'disabled' : ''} aria-label="Remove option ${i + 1}"><i class="fa-solid fa-xmark"></i></button>
        </div>`
      )
      .join('');
    $('#qmAddOption').disabled = qDraft.options.length >= 6;
  }

  $('#qmOptions').addEventListener('input', (e) => {
    if (e.target.dataset.opt !== undefined) qDraft.options[Number(e.target.dataset.opt)] = e.target.value;
  });
  $('#qmOptions').addEventListener('change', (e) => {
    if (e.target.name === 'qmCorrect') qDraft.correct = Number(e.target.value);
  });
  $('#qmOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn || qDraft.options.length <= 2) return;
    const i = Number(btn.dataset.remove);
    qDraft.options.splice(i, 1);
    if (qDraft.correct === i) qDraft.correct = 0;
    else if (qDraft.correct > i) qDraft.correct -= 1;
    renderOptionRows();
  });
  $('#qmAddOption').addEventListener('click', () => {
    if (qDraft.options.length < 6) {
      qDraft.options.push('');
      renderOptionRows();
    }
  });

  $('#addQuestionBtn').addEventListener('click', () => openQuestionModal(-1));

  $('#qmSave').addEventListener('click', () => {
    qDraft.text = $('#qmText').value;
    qDraft.explanation = $('#qmExplain').value;
    const clean = Store.normalizeQuestion(qDraft);
    // normalizeQuestion drops blank options and re-maps the correct index; it yields -1 if the correct option was blank.
    const errors = Store.validateQuestion(clean, qIndex === -1 ? draft.questions.length + 1 : qIndex + 1);
    if (errors.length) {
      const box = $('#qmError');
      box.textContent = errors[0].replace(/^Question \d+: /, '');
      box.classList.remove('d-none');
      return;
    }
    if (qIndex === -1) draft.questions.push(clean);
    else draft.questions[qIndex] = clean;
    questionModal.hide();
    renderQuestionList();
  });

  /* ---------- results ---------- */

  function filteredAttempts() {
    const quizId = $('#resQuiz').value;
    const term = $('#resSearch').value.trim().toLowerCase();
    return Store.getAttempts()
      .filter((a) => (!quizId || a.quizId === quizId) && (!term || a.email.includes(term) || (a.name || '').toLowerCase().includes(term)))
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }

  function renderResults() {
    const select = $('#resQuiz');
    const current = select.value;
    const titles = new Map();
    Store.getAttempts().forEach((a) => titles.set(a.quizId, a.quizTitle));
    Store.getQuizzes().forEach((q) => titles.set(q.id, q.title));
    select.innerHTML =
      '<option value="">All quizzes</option>' +
      Array.from(titles, ([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join('');
    if (titles.has(current)) select.value = current;
    drawResults();
  }

  function drawResults() {
    const rows = filteredAttempts();
    const avg = rows.length ? rows.reduce((s, a) => s + a.percent, 0) / rows.length : 0;
    const passRate = rows.length ? (rows.filter((a) => a.passed).length / rows.length) * 100 : 0;
    const best = rows.length ? Math.max(...rows.map((a) => a.percent)) : 0;
    const tile = (label, value, icon) =>
      `<div class="col-6 col-lg-3"><div class="card qh-card"><div class="card-body d-flex gap-3 align-items-center">
        <span class="feature-icon"><i class="fa-solid ${icon}"></i></span>
        <div><div class="h4 mb-0">${value}</div><div class="small text-muted">${label}</div></div></div></div></div>`;
    $('#resStats').innerHTML =
      tile('Attempts', rows.length, 'fa-pen-to-square') +
      tile('Average score', `${avg.toFixed(1)}%`, 'fa-chart-simple') +
      tile('Pass rate', `${passRate.toFixed(0)}%`, 'fa-circle-check') +
      tile('Highest score', `${best}%`, 'fa-trophy');

    $('#resBody').innerHTML = rows.length
      ? rows
          .map(
            (a) => `<tr>
              <td class="small text-muted">${esc(fmtDate(a.submittedAt))}</td>
              <td><div class="fw-medium">${esc(a.name || '')}</div><div class="small text-muted">${esc(a.email)}</div></td>
              <td>${esc(a.quizTitle)}</td>
              <td class="text-end">${a.score}/${a.total}</td>
              <td class="text-end"><span class="badge ${a.passed ? 'text-bg-success' : 'text-bg-danger'}">${a.percent}%</span></td>
              <td class="text-end text-muted">${fmtTime(a.timeTaken)}${a.autoSubmitted ? ' <i class="fa-regular fa-hourglass-half" title="Auto-submitted"></i>' : ''}</td>
              <td class="text-end"><a class="btn btn-sm btn-outline-primary" href="result.html?attempt=${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Review</a></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="7" class="text-center text-muted py-5">No results yet.</td></tr>';
  }
  $('#resQuiz').addEventListener('change', drawResults);
  $('#resSearch').addEventListener('input', drawResults);

  /* Prefix cells that start with = + - @ so spreadsheets never run them as formulas. */
  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  };
  $('#exportCsvBtn').addEventListener('click', () => {
    const rows = filteredAttempts();
    if (!rows.length) return toast('There are no results to export.', 'warning');
    const header = ['Submitted', 'Name', 'Email', 'Quiz', 'Score', 'Total', 'Percent', 'Passed', 'Time (s)', 'Auto-submitted'];
    const lines = rows.map((a) =>
      [new Date(a.submittedAt).toISOString(), a.name, a.email, a.quizTitle, a.score, a.total, a.percent, a.passed ? 'Yes' : 'No', a.timeTaken, a.autoSubmitted ? 'Yes' : 'No']
        .map(csvCell)
        .join(',')
    );
    download('quizhub-results.csv', [header.map(csvCell).join(','), ...lines].join('\n'), 'text/csv');
  });

  /* ---------- publish, backup, settings ---------- */

  $('#publishBtn').addEventListener('click', () => {
    download('published.json', JSON.stringify(Store.buildPublishBundle(), null, 2));
    toast('Downloaded. Commit it to data/published.json in your repository.', 'info');
  });

  $('#backupBtn').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`quizhub-backup-${stamp}.json`, JSON.stringify(Store.exportBackup(), null, 2));
  });
  $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await readFileText(file));
    } catch (err) {
      return toast('That file is not valid JSON.', 'danger');
    }
    const ok = await confirmDialog({
      title: 'Restore backup?',
      body: 'This replaces all quizzes, results and high scores in this browser.',
      okLabel: 'Restore',
    });
    if (!ok) return;
    const res = Store.restoreBackup(data);
    toast(res.ok ? 'Backup restored.' : res.error, res.ok ? 'success' : 'danger');
  });

  $('#resetBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset to the demo quiz?',
      body: 'All quizzes in this browser are replaced by the built-in Computer Basics quiz. Results are kept.',
      okLabel: 'Reset',
    });
    if (ok) {
      Store.resetQuizzes();
      toast('Demo quiz restored.', 'info');
    }
  });

  $('#pwForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Store.setAdminPassword($('#pwCurrent').value, $('#pwNew').value);
    const box = $('#pwAlert');
    box.className = `alert ${res.ok ? 'alert-success' : 'alert-danger'}`;
    box.textContent = res.ok ? 'Password updated.' : res.error;
    if (res.ok) e.target.reset();
  });

  renderAuth();
})();
