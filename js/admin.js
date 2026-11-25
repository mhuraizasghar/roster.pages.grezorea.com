(async function() {
    "use strict";
    const {$: $, $$: $$, esc: esc, fmtDate: fmtDate, fmtTime: fmtTime, toast: toast, confirmDialog: confirmDialog, download: download, readFileText: readFileText} = U;
    await Store.init();
    $("#loading").classList.add("d-none");

    let draft = null;
    let qDraft = null;
    let qIndex = -1;
    const questionModal = new bootstrap.Modal($("#questionModal"));

    function updateAdminKPIs() {
        const quizzes = Store.getQuizzes();
        const attempts = Store.getAttempts();
        const totalQuestions = quizzes.reduce((acc, q) => acc + (q.questions ? q.questions.length : 0), 0);
        
        // Count unique enrolled emails
        const enrolledSet = new Set();
        quizzes.forEach(q => (q.allowedEmails || []).forEach(e => enrolledSet.add(e)));

        const passedCount = attempts.filter(a => a.passed).length;
        const passRate = attempts.length ? Math.round((passedCount / attempts.length) * 100) : 0;

        if ($("#kpiQuizzes")) $("#kpiQuizzes").textContent = quizzes.length;
        if ($("#kpiQuestions")) $("#kpiQuestions").textContent = totalQuestions;
        if ($("#kpiEnrolled")) $("#kpiEnrolled").textContent = enrolledSet.size;
        if ($("#kpiAttempts")) $("#kpiAttempts").textContent = attempts.length;
        if ($("#kpiPassRate")) $("#kpiPassRate").textContent = `${passRate}%`;
    }

    function renderAuth() {
        const ok = Store.isAdminAuthed();
        $("#loginView").classList.toggle("d-none", ok);
        $("#appView").classList.toggle("d-none", !ok);
        $("#adminLogout").classList.toggle("d-none", !ok);
        
        if (ok) {
            updateAdminKPIs();
            showView("quizzesView");
        }
    }

    $("#loginForm").addEventListener("submit", e => {
        e.preventDefault();
        const ok = Store.adminLogin($("#adminPassword").value);
        $("#loginAlert").classList.toggle("d-none", ok);
        if (ok) {
            $("#adminPassword").value = "";
            renderAuth();
        }
    });

    $("#adminLogout").addEventListener("click", () => {
        Store.adminLogout();
        renderAuth();
    });

    function showView(id, scrollTop = true) {
        $$("[data-view-panel]").forEach(p => p.classList.toggle("d-none", p.id !== id));
        $$("#tabs .nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === id));
        if (id === "quizzesView") renderQuizTable();
        if (id === "liveRoomsView") renderLiveRoomsView();
        if (id === "resultsView") renderResults();
        updateAdminKPIs();
        if (scrollTop) {
            window.scrollTo({
                top: 0
            });
        }
    }

    setInterval(async () => {
        if (document.hidden) return;
        await Store.refreshShared();
        if (!$("#appView").classList.contains("d-none")) {
            const active = $$('[data-view-panel]:not(.d-none)')[0];
            if (active && active.id !== "liveRoomsView") showView(active.id, false);
        }
    }, 30000);

    // Real-time refresh for Live Classrooms & Results tab (3s)
    setInterval(() => {
        if (document.hidden || $("#appView").classList.contains("d-none")) return;
        const liveView = $("#liveRoomsView");
        if (liveView && !liveView.classList.contains("d-none")) {
            renderLiveRoomsView();
        }
    }, 3000);

    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
            await Store.refreshShared();
            const active = $$('[data-view-panel]:not(.d-none)')[0];
            if (active) showView(active.id, false);
        }
    });

    $("#tabs").addEventListener("click", e => {
        const b = e.target.closest("[data-view]");
        if (b) showView(b.dataset.view);
    });

    function renderQuizTable() {
        let quizzes = Store.getQuizzes();
        const searchTerm = ($("#quizSearchInput") ? $("#quizSearchInput").value : "").trim().toLowerCase();
        
        if (searchTerm) {
            quizzes = quizzes.filter(q => 
                (q.title && q.title.toLowerCase().includes(searchTerm)) || 
                (q.subject && q.subject.toLowerCase().includes(searchTerm))
            );
        }

        $("#quizTable").innerHTML = quizzes.length ? quizzes.map(q => `<tr>
              <td>
                <div class="fw-semibold">${esc(q.title)}</div>
                <div class="small text-muted">${esc(q.subject || "General")}</div>
              </td>
              <td class="text-center font-monospace">${q.questions.length}</td>
              <td class="text-center font-monospace">${q.allowedEmails.length}</td>
              <td class="text-center">${q.durationMinutes} min</td>
              <td class="small text-muted">${esc(fmtDate(q.updatedAt))}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-success" data-act="live" data-id="${esc(q.id)}" title="Launch Live Room (Socrative Mode)"><i class="fa-solid fa-tower-broadcast"></i></button>
                <button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${esc(q.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-secondary" data-act="dup" data-id="${esc(q.id)}" title="Duplicate"><i class="fa-regular fa-copy"></i></button>
                <button class="btn btn-sm btn-outline-secondary" data-act="export" data-id="${esc(q.id)}" title="Export JSON"><i class="fa-solid fa-file-export"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-act="delete" data-id="${esc(q.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </td></tr>`).join("") : `<tr><td colspan="6" class="text-center text-muted py-5">${searchTerm ? 'No quizzes match your filter.' : 'No quizzes yet. Create one or import a JSON file.'}</td></tr>`;
    }

    if ($("#quizSearchInput")) {
        $("#quizSearchInput").addEventListener("input", renderQuizTable);
    }

    $("#quizTable").addEventListener("click", async e => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const quiz = Store.getQuiz(btn.dataset.id);
        if (!quiz) return;
        const act = btn.dataset.act;
        if (act === "live") {
            window.location.assign(`live-host.html?quiz=${encodeURIComponent(quiz.id)}`);
        } else if (act === "edit") openEditor(Store.clone(quiz), false); else if (act === "dup") {
            const copy = Store.clone(quiz);
            copy.id = Store.uid("quiz");
            copy.title = `${quiz.title} (copy)`;
            Store.saveQuiz(copy);
            renderQuizTable();
            updateAdminKPIs();
            toast("Quiz duplicated.");
        } else if (act === "export") {
            download(`${quiz.id}.json`, JSON.stringify(quiz, null, 2));
        } else if (act === "delete") {
            const ok = await confirmDialog({
                title: "Delete quiz?",
                body: `"${quiz.title}" and its question bank will be removed. Past results are kept.`,
                okLabel: "Delete"
            });
            if (ok) {
                Store.deleteQuiz(quiz.id);
                renderQuizTable();
                updateAdminKPIs();
                toast("Quiz deleted.", "info");
            }
        }
    });

    $("#newQuizBtn").addEventListener("click", () => openEditor({
        id: Store.uid("quiz"),
        title: "",
        subject: "",
        description: "",
        durationMinutes: 10,
        passMark: 50,
        shuffle: true,
        maxAttempts: 0,
        allowedEmails: [],
        questions: []
    }, true));

    if ($("#sampleQuizJsonBtn")) {
        $("#sampleQuizJsonBtn").addEventListener("click", () => {
            const sampleTemplate = {
                title: "Applied Physics Midterm",
                subject: "Physics",
                description: "Sample subject quiz template. Customize title, subject, allowedEmails, and questions (correct is 0-indexed: 0 = Option A, 1 = Option B, 2 = Option C, 3 = Option D), then upload using 'Import JSON'.",
                durationMinutes: 15,
                passMark: 50,
                shuffle: true,
                maxAttempts: 0,
                allowedEmails: [
                    "@au.edu.pk",
                    "student1@university.edu",
                    "student2@university.edu"
                ],
                questions: [
                    {
                        text: "Which law states that Force equals Mass times Acceleration (F = ma)?",
                        options: [
                            "Newton's Second Law",
                            "Newton's First Law",
                            "Newton's Third Law",
                            "Law of Universal Gravitation"
                        ],
                        correct: 0,
                        explanation: "Newton's second law establishes F = ma, relating net force, mass, and acceleration."
                    },
                    {
                        text: "What is the SI unit of electrical resistance?",
                        options: [
                            "Volt",
                            "Ampere",
                            "Ohm",
                            "Watt"
                        ],
                        correct: 2,
                        explanation: "Electrical resistance is measured in Ohms (Ω), named after Georg Simon Ohm."
                    },
                    {
                        text: "What is the approximate acceleration due to gravity near Earth's surface?",
                        options: [
                            "8.9 m/s²",
                            "9.8 m/s²",
                            "10.5 m/s²",
                            "11.2 m/s²"
                        ],
                        correct: 1,
                        explanation: "Standard acceleration due to gravity on Earth is approximately 9.8 m/s²."
                    }
                ]
            };
            download("quizhub-subject-sample.json", JSON.stringify(sampleTemplate, null, 2));
            toast("Downloaded quizhub-subject-sample.json template. Edit & click 'Import JSON' to add it!", "info");
        });
    }

    $("#importQuizBtn").addEventListener("click", () => $("#importQuizFile").click());
    $("#importQuizFile").addEventListener("change", async e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        try {
            const result = Store.importQuizzes(JSON.parse(await readFileText(file)));
            renderQuizTable();
            updateAdminKPIs();
            if (result.added) toast(`Imported ${result.added} quiz${result.added === 1 ? "" : "zes"}.`);
            if (result.errors.length) toast(result.errors.join(" "), "warning");
        } catch (err) {
            toast("That file is not valid JSON.", "danger");
        }
    });

    function openEditor(quiz, isNew) {
        draft = quiz;
        $("#editorTitle").textContent = isNew ? "Create New Quiz" : "Edit Quiz";
        $("#editorErrors").classList.add("d-none");
        $("#qzTitle").value = quiz.title;
        $("#qzSubject").value = quiz.subject;
        $("#qzDesc").value = quiz.description;
        $("#qzDuration").value = quiz.durationMinutes;
        $("#qzPass").value = quiz.passMark;
        $("#qzMax").value = quiz.maxAttempts;
        $("#qzShuffle").checked = quiz.shuffle;
        $("#qzEmails").value = quiz.allowedEmails.join("\n");
        updateEmailStats();
        renderQuestionList();
        showView("editorView");
        $$("#tabs .nav-link").forEach(b => b.classList.remove("active"));
    }

    function renderQuestionList() {
        $("#qCount").textContent = draft.questions.length;
        $("#questionList").innerHTML = draft.questions.length ? draft.questions.map((q, i) => `<div class="q-row">
              <span class="q-index">${i + 1}</span>
              <div class="flex-grow-1 min-w-0">
                <div class="fw-medium">${esc(q.text)}</div>
                <div class="small text-muted"><i class="fa-solid fa-check text-success me-1"></i>${esc(q.options[q.correct] || "")} · ${q.options.length} options</div>
              </div>
              <div class="btn-group btn-group-sm flex-none">
                <button class="btn btn-outline-secondary" data-q="up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                <button class="btn btn-outline-secondary" data-q="down" data-i="${i}" ${i === draft.questions.length - 1 ? "disabled" : ""} aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="btn btn-outline-primary" data-q="edit" data-i="${i}" aria-label="Edit question"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-outline-danger" data-q="delete" data-i="${i}" aria-label="Delete question"><i class="fa-solid fa-trash"></i></button>
              </div></div>`).join("") : '<div class="text-center text-muted py-5">No questions added yet. Click <strong>Add Question</strong> to begin.</div>';
    }

    $("#questionList").addEventListener("click", e => {
        const btn = e.target.closest("button[data-q]");
        if (!btn) return;
        const i = Number(btn.dataset.i);
        const act = btn.dataset.q;
        if (act === "edit") openQuestionModal(i); else if (act === "delete") draft.questions.splice(i, 1); else if (act === "up" && i > 0) [draft.questions[i - 1], draft.questions[i]] = [ draft.questions[i], draft.questions[i - 1] ]; else if (act === "down" && i < draft.questions.length - 1) [draft.questions[i + 1], draft.questions[i]] = [ draft.questions[i], draft.questions[i + 1] ];
        renderQuestionList();
    });

    function updateEmailStats() {
        const {valid: valid, invalid: invalid} = Store.parseEmails($("#qzEmails").value);
        $("#emailValid").textContent = valid.length;
        $("#emailInvalidCount").textContent = invalid.length;
        $("#emailInvalidWrap").classList.toggle("d-none", !invalid.length);
        $("#invalidEmails").innerHTML = invalid.map(x => `<span class="chip-bad">${esc(x)}</span>`).join("");
    }

    $("#qzEmails").addEventListener("input", updateEmailStats);
    $("#emailClearBtn").addEventListener("click", () => {
        $("#qzEmails").value = "";
        updateEmailStats();
    });
    $("#emailFileBtn").addEventListener("click", () => $("#emailFile").click());
    $("#emailFile").addEventListener("change", async e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        const existing = $("#qzEmails").value.trim();
        $("#qzEmails").value = (existing ? existing + "\n" : "") + await readFileText(file);
        updateEmailStats();
        toast("Emails added from file.");
    });

    function readEditorForm() {
        draft.title = $("#qzTitle").value.trim();
        draft.subject = $("#qzSubject").value.trim();
        draft.description = $("#qzDesc").value.trim();
        draft.durationMinutes = Math.min(180, Math.max(1, parseInt($("#qzDuration").value, 10) || 10));
        draft.passMark = Math.min(100, Math.max(0, parseInt($("#qzPass").value, 10) || 0));
        draft.maxAttempts = Math.min(50, Math.max(0, parseInt($("#qzMax").value, 10) || 0));
        draft.shuffle = $("#qzShuffle").checked;
        draft.allowedEmails = Store.parseEmails($("#qzEmails").value).valid;
    }

    $("#saveQuizBtn").addEventListener("click", () => {
        readEditorForm();
        const errors = Store.validateQuiz(draft);
        const {invalid: invalid} = Store.parseEmails($("#qzEmails").value);
        if (invalid.length) errors.push(`Fix or remove ${invalid.length} invalid email${invalid.length === 1 ? "" : "s"}.`);
        const box = $("#editorErrors");
        if (errors.length) {
            box.innerHTML = '<strong>Please fix the following:</strong><ul class="mb-0"></ul>';
            errors.forEach(msg => {
                const li = document.createElement("li");
                li.textContent = msg;
                box.querySelector("ul").appendChild(li);
            });
            box.classList.remove("d-none");
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
            return;
        }
        Store.saveQuiz(draft);
        updateAdminKPIs();
        toast("Quiz saved successfully.");
        showView("quizzesView");
    });

    const leaveEditor = () => showView("quizzesView");
    $("#cancelEditBtn").addEventListener("click", leaveEditor);
    $("#backBtn").addEventListener("click", leaveEditor);

    function openQuestionModal(index) {
        qIndex = index;
        qDraft = index === -1 ? {
            id: Store.uid("q"),
            text: "",
            options: [ "", "", "", "" ],
            correct: 0,
            explanation: ""
        } : {
            ...Store.clone(draft.questions[index])
        };
        $("#qmTitle").textContent = index === -1 ? "Add Question" : `Edit Question ${index + 1}`;
        $("#qmText").value = qDraft.text;
        $("#qmExplain").value = qDraft.explanation || "";
        $("#qmError").classList.add("d-none");
        renderOptionRows();
        questionModal.show();
    }

    function renderOptionRows() {
        $("#qmOptions").innerHTML = qDraft.options.map((text, i) => `<div class="opt-edit">
          <input class="form-check-input" type="radio" name="qmCorrect" value="${i}" ${qDraft.correct === i ? "checked" : ""} aria-label="Mark option ${i + 1} as correct">
          <input class="form-control" data-opt="${i}" value="${esc(text)}" placeholder="Option ${String.fromCharCode(65 + i)}" maxlength="200" aria-label="Option ${i + 1} text">
          <button type="button" class="btn btn-outline-danger btn-sm" data-remove="${i}" ${qDraft.options.length <= 2 ? "disabled" : ""} aria-label="Remove option ${i + 1}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join("");
        $("#qmAddOption").disabled = qDraft.options.length >= 6;
    }

    $("#qmOptions").addEventListener("input", e => {
        if (e.target.dataset.opt !== undefined) qDraft.options[Number(e.target.dataset.opt)] = e.target.value;
    });
    $("#qmOptions").addEventListener("change", e => {
        if (e.target.name === "qmCorrect") qDraft.correct = Number(e.target.value);
    });
    $("#qmOptions").addEventListener("click", e => {
        const btn = e.target.closest("[data-remove]");
        if (!btn || qDraft.options.length <= 2) return;
        const i = Number(btn.dataset.remove);
        qDraft.options.splice(i, 1);
        if (qDraft.correct === i) qDraft.correct = 0; else if (qDraft.correct > i) qDraft.correct -= 1;
        renderOptionRows();
    });
    $("#qmAddOption").addEventListener("click", () => {
        if (qDraft.options.length < 6) {
            qDraft.options.push("");
            renderOptionRows();
        }
    });

    $("#addQuestionBtn").addEventListener("click", () => openQuestionModal(-1));

    $("#qmSave").addEventListener("click", () => {
        qDraft.text = $("#qmText").value;
        qDraft.explanation = $("#qmExplain").value;
        const clean = Store.normalizeQuestion(qDraft);
        const errors = Store.validateQuestion(clean, qIndex === -1 ? draft.questions.length + 1 : qIndex + 1);
        if (errors.length) {
            const box = $("#qmError");
            box.textContent = errors[0].replace(/^Question \d+: /, "");
            box.classList.remove("d-none");
            return;
        }
        if (qIndex === -1) draft.questions.push(clean); else draft.questions[qIndex] = clean;
        questionModal.hide();
        renderQuestionList();
    });

    function filteredAttempts() {
        const quizId = $("#resQuiz").value;
        const term = $("#resSearch").value.trim().toLowerCase();
        const statusFilter = $("#resFilterStatus") ? $("#resFilterStatus").value : "";

        return Store.getAttempts().filter(a => {
            if (quizId && a.quizId !== quizId) return false;
            if (term && !a.email.includes(term) && !(a.name || "").toLowerCase().includes(term)) return false;
            if (statusFilter === "passed" && !a.passed) return false;
            if (statusFilter === "failed" && a.passed) return false;
            return true;
        }).sort((a, b) => b.submittedAt - a.submittedAt);
    }

    function renderResults() {
        const select = $("#resQuiz");
        const current = select.value;
        const titles = new Map;
        Store.getAttempts().forEach(a => titles.set(a.quizId, a.quizTitle));
        Store.getQuizzes().forEach(q => titles.set(q.id, q.title));
        select.innerHTML = '<option value="">All quizzes</option>' + Array.from(titles, ([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join("");
        if (titles.has(current)) select.value = current;
        drawResults();
    }

    function drawResults() {
        const rows = filteredAttempts();
        const avg = rows.length ? rows.reduce((s, a) => s + a.percent, 0) / rows.length : 0;
        const passRate = rows.length ? rows.filter(a => a.passed).length / rows.length * 100 : 0;
        const best = rows.length ? Math.max(...rows.map(a => a.percent)) : 0;

        const tile = (label, value, icon) => `<div class="col-6 col-lg-3"><div class="card qh-card"><div class="card-body d-flex gap-3 align-items-center">
        <span class="feature-icon"><i class="fa-solid ${icon}"></i></span>
        <div><div class="h5 mb-0 fw-bold">${value}</div><div class="small text-muted">${label}</div></div></div></div></div>`;

        $("#resStats").innerHTML = tile("Filtered Attempts", rows.length, "fa-pen-to-square") + 
                                   tile("Average Score", `${avg.toFixed(1)}%`, "fa-chart-simple") + 
                                   tile("Pass Rate", `${passRate.toFixed(0)}%`, "fa-circle-check") + 
                                   tile("Highest Score", `${best}%`, "fa-trophy");

        $("#resBody").innerHTML = rows.length ? rows.map(a => `<tr>
              <td class="small text-muted">${esc(fmtDate(a.submittedAt))}</td>
              <td><div class="fw-medium">${esc(a.name || "")}</div><div class="small text-muted font-monospace">${esc(a.email)}</div></td>
              <td>${esc(a.quizTitle)}</td>
              <td class="text-end font-monospace">${a.score}/${a.total}</td>
              <td class="text-end"><span class="badge ${a.passed ? "text-bg-success" : "text-bg-danger"}">${a.percent}%</span></td>
              <td class="text-end text-muted font-monospace">${fmtTime(a.timeTaken)}${a.autoSubmitted ? ' <i class="fa-regular fa-hourglass-half text-warning" title="Auto-submitted"></i>' : ""}</td>
              <td class="text-end"><a class="btn btn-sm btn-outline-primary" href="result.html?attempt=${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Review</a></td>
            </tr>`).join("") : '<tr><td colspan="7" class="text-center text-muted py-5">No results match the selected filters.</td></tr>';
    }

    $("#resQuiz").addEventListener("change", drawResults);
    $("#resSearch").addEventListener("input", drawResults);
    if ($("#resFilterStatus")) $("#resFilterStatus").addEventListener("change", drawResults);

    $("#resBody").addEventListener("click", e => {
        const reviewLink = e.target.closest('a[target="_blank"]');
        if (!reviewLink) return;
        e.preventDefault();
        window.location.assign(reviewLink.href);
    });

    const csvCell = v => {
        const s = String(v == null ? "" : v);
        return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
    };

    $("#exportCsvBtn").addEventListener("click", () => {
        const rows = filteredAttempts();
        if (!rows.length) return toast("There are no results to export.", "warning");
        const header = [ "Submitted", "Name", "Email", "Quiz", "Score", "Total", "Percent", "Passed", "Time (s)", "Auto-submitted" ];
        const lines = rows.map(a => [ new Date(a.submittedAt).toISOString(), a.name, a.email, a.quizTitle, a.score, a.total, a.percent, a.passed ? "Yes" : "No", a.timeTaken, a.autoSubmitted ? "Yes" : "No" ].map(csvCell).join(","));
        download("quizhub-results.csv", [ header.map(csvCell).join(","), ...lines ].join("\n"), "text/csv");
    });

    $("#publishBtn").addEventListener("click", () => {
        download("published.json", JSON.stringify(Store.buildPublishBundle(), null, 2));
        toast("Downloaded published.json. Commit it to data/published.json in your repo.", "info");
    });

    $("#backupBtn").addEventListener("click", () => {
        const stamp = (new Date).toISOString().slice(0, 10);
        download(`quizhub-backup-${stamp}.json`, JSON.stringify(Store.exportBackup(), null, 2));
    });

    $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
    $("#restoreFile").addEventListener("change", async e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        let data;
        try {
            data = JSON.parse(await readFileText(file));
        } catch (err) {
            return toast("That file is not valid JSON.", "danger");
        }
        const ok = await confirmDialog({
            title: "Restore backup?",
            body: "This replaces all quizzes, results and high scores in this browser.",
            okLabel: "Restore"
        });
        if (!ok) return;
        const res = Store.restoreBackup(data);
        updateAdminKPIs();
        renderQuizTable();
        toast(res.ok ? "Backup restored successfully." : res.error, res.ok ? "success" : "danger");
    });

    $("#resetBtn").addEventListener("click", async () => {
        const ok = await confirmDialog({
            title: "Reset to default quiz?",
            body: "All quizzes in this browser are replaced by the built-in Computer Basics quiz. Past student results are kept.",
            okLabel: "Reset"
        });
        if (ok) {
            Store.resetQuizzes();
            updateAdminKPIs();
            renderQuizTable();
            toast("Default quizzes restored.", "info");
        }
    });

    $("#pwForm").addEventListener("submit", e => {
        e.preventDefault();
        const res = Store.setAdminPassword($("#pwCurrent").value, $("#pwNew").value);
        const box = $("#pwAlert");
        box.className = `alert py-2 px-3 small ${res.ok ? "alert-success" : "alert-danger"}`;
        box.textContent = res.ok ? "Admin password updated successfully." : res.error;
        box.classList.remove("d-none");
        if (res.ok) e.target.reset();
    });

    // ----------------------------------------------------
    // LIVE ROOMS & RESULTS MANAGEMENT
    // ----------------------------------------------------
    let currentScorecardReport = null;
    let scorecardModal = null;
    if ($("#viewScorecardModal")) {
        scorecardModal = new bootstrap.Modal($("#viewScorecardModal"));
    }

    function populateLaunchSubjectSelect() {
        const select = $("#launchSubjectSelect");
        if (!select) return;
        const quizzes = Store.getQuizzes();
        select.innerHTML = quizzes.map(q => 
            `<option value="${esc(q.id)}">${esc(q.title)} (${esc(q.subject || "General")}) - ${q.questions.length} Qs</option>`
        ).join("");
    }

    const launchLiveModalEl = document.getElementById("launchLiveModal");
    if (launchLiveModalEl) {
        launchLiveModalEl.addEventListener("show.bs.modal", populateLaunchSubjectSelect);
    }

    if ($("#confirmLaunchLiveBtn")) {
        $("#confirmLaunchLiveBtn").addEventListener("click", () => {
            const quizId = $("#launchSubjectSelect")?.value;
            if (!quizId) return toast("Please select a subject or quiz first.", "warning");
            const customCode = ($("#launchRoomCodeInput")?.value || "").trim().toUpperCase();
            const url = `live-host.html?quiz=${encodeURIComponent(quizId)}${customCode ? `&room=${encodeURIComponent(customCode)}` : ""}`;
            window.location.assign(url);
        });
    }

    async function renderLiveRoomsView() {
        // 1. Render Active Live Classrooms
        try {
            const allRooms = await RoomSync.getActiveRooms();
            const activeRooms = allRooms.filter(r => r.status === "lobby" || r.status === "active");
            const activeBadge = $("#activeRoomsCountBadge");
            if (activeBadge) activeBadge.textContent = `${activeRooms.length} Running`;

            const activeTbody = $("#liveTabActiveRoomsBody");
            if (activeTbody) {
                if (!activeRooms.length) {
                    activeTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No live classrooms currently in session. Click "Launch Live Room" to start one.</td></tr>';
                } else {
                    activeTbody.innerHTML = activeRooms.map(r => `
                        <tr>
                            <td><span class="badge font-monospace bg-light text-dark border px-2 py-1 fs-6">${esc(r.code)}</span></td>
                            <td>
                                <div class="fw-semibold">${esc(r.title)}</div>
                                <div class="small text-muted">${esc(r.subject || "General")} · ${r.totalQuestions || 0} Questions</div>
                            </td>
                            <td>
                                <span class="badge ${r.status === 'active' ? 'text-bg-success' : 'text-bg-warning'}">${r.status === 'active' ? 'In Progress' : 'In Lobby'}</span>
                            </td>
                            <td class="text-center">
                                <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2">${r.participantsCount ?? (r.participants ? r.participants.length : 0)} Students</span>
                            </td>
                            <td class="text-end text-nowrap">
                                <a href="live-host.html?room=${encodeURIComponent(r.code)}" class="btn btn-sm btn-success me-1">
                                    <i class="fa-solid fa-play me-1"></i>Host Controller
                                </a>
                                <button class="btn btn-sm btn-outline-danger" data-live-act="close" data-code="${esc(r.code)}" title="Close Room">
                                    <i class="fa-solid fa-power-off"></i>
                                </button>
                            </td>
                        </tr>
                    `).join("");
                }
            }
        } catch (e) {
            console.error("Error rendering active live rooms:", e);
        }

        // 2. Fetch cloud reports & render Saved Live Reports
        try {
            await RoomSync.fetchReports();
        } catch (e) {}
        renderLiveReports();
    }

    function renderLiveReports() {
        let reports = [];
        try {
            reports = RoomSync.getReports();
        } catch (e) {
            reports = [];
        }

        const search = ($("#liveReportsSearch")?.value || "").trim().toLowerCase();
        if (search) {
            reports = reports.filter(r => 
                (r.roomCode && r.roomCode.toLowerCase().includes(search)) ||
                (r.title && r.title.toLowerCase().includes(search)) ||
                (r.subject && r.subject.toLowerCase().includes(search))
            );
        }

        const countBadge = $("#liveReportsCountBadge");
        if (countBadge) countBadge.textContent = `${reports.length} Saved`;

        const reportsTbody = $("#liveReportsBody");
        if (!reportsTbody) return;

        if (!reports.length) {
            reportsTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${search ? 'No reports match your search query.' : 'No saved live classroom reports yet. When a teacher finishes a live session, its complete scorecard is stored here.'}</td></tr>`;
            return;
        }

        reportsTbody.innerHTML = reports.map(r => `
            <tr>
                <td class="small text-muted">${esc(fmtDate(r.finishedAt))}</td>
                <td><span class="badge font-monospace bg-light text-dark border">${esc(r.roomCode)}</span></td>
                <td>
                    <div class="fw-semibold">${esc(r.title)}</div>
                    <div class="small text-muted">${esc(r.subject || "General")}</div>
                </td>
                <td class="text-center font-monospace">${r.summary?.totalJoined || (r.studentResults ? r.studentResults.length : 0)}</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${r.summary?.averagePercent || 0}%</span></td>
                <td class="text-center"><span class="badge ${(r.summary?.passRatePercent || 0) >= 50 ? 'text-bg-success' : 'text-bg-danger'}">${r.summary?.passRatePercent || 0}%</span></td>
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1" data-rep-act="scorecard" data-id="${esc(r.id)}" title="View Scorecard">
                        <i class="fa-solid fa-table me-1"></i>Scorecard
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-1" data-rep-act="csv" data-id="${esc(r.id)}" title="Export CSV">
                        <i class="fa-solid fa-file-csv"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-rep-act="delete" data-id="${esc(r.id)}" title="Delete Report">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join("");
    }

    if ($("#liveTabActiveRoomsBody")) {
        $("#liveTabActiveRoomsBody").addEventListener("click", async e => {
            const btn = e.target.closest("button[data-live-act]");
            if (!btn) return;
            const act = btn.dataset.liveAct;
            const code = btn.dataset.code;
            if (act === "close") {
                const ok = await confirmDialog({
                    title: "Close Live Classroom?",
                    body: `Are you sure you want to close Room ${code}? Connected students will be notified that the session has ended.`,
                    okLabel: "Close Room"
                });
                if (ok) {
                    await RoomSync.closeRoom(code);
                    toast(`Room ${code} closed.`, "info");
                    renderLiveRoomsView();
                }
            }
        });
    }

    if ($("#liveReportsSearch")) {
        $("#liveReportsSearch").addEventListener("input", renderLiveReports);
    }

    if ($("#refreshLiveTabBtn")) {
        $("#refreshLiveTabBtn").addEventListener("click", () => {
            renderLiveRoomsView();
            toast("Live rooms list refreshed.", "info");
        });
    }

    function openScorecard(report) {
        if (!report || !scorecardModal) return;
        currentScorecardReport = report;
        $("#vsmTitle").textContent = `${report.title || "Live Session"} - Evaluation Scorecard`;
        $("#vsmSubtitle").textContent = `Room Code: ${report.roomCode} · Session finished on ${fmtDate(report.finishedAt)}`;
        $("#vsmTotal").textContent = report.summary?.totalJoined || (report.studentResults ? report.studentResults.length : 0);
        $("#vsmAvg").textContent = `${report.summary?.averagePercent || 0}%`;
        $("#vsmPass").textContent = `${report.summary?.passRatePercent || 0}%`;
        $("#vsmQuestions").textContent = report.summary?.totalQuestions || (report.studentResults?.[0]?.questionBreakdown?.length || 0);

        const students = report.studentResults || [];
        const numQ = report.summary?.totalQuestions || (students[0]?.questionBreakdown?.length || 0);

        let headerHtml = `
            <th>#</th>
            <th>Student Name</th>
            <th class="text-center">Score</th>
            <th class="text-center">Percent</th>
            <th class="text-center">Status</th>
        `;
        for (let i = 0; i < numQ; i++) {
            headerHtml += `<th class="text-center" title="Question ${i + 1}">Q${i + 1}</th>`;
        }
        $("#vsmTableHeader").innerHTML = headerHtml;

        if (!students.length) {
            $("#vsmTableBody").innerHTML = `<tr><td colspan="${5 + numQ}" class="text-center text-muted py-4">No student submissions recorded for this session.</td></tr>`;
        } else {
            $("#vsmTableBody").innerHTML = students.map((s, idx) => {
                let qCells = "";
                (s.questionBreakdown || []).forEach(q => {
                    const icon = q.isCorrect ? "✔" : (q.status === "skipped" ? "-" : "✘");
                    const badgeClass = q.isCorrect ? "text-bg-success" : (q.status === "skipped" ? "text-bg-secondary" : "text-bg-danger");
                    qCells += `<td class="text-center"><span class="badge ${badgeClass}" title="${esc(q.questionText || '')}">${icon}</span></td>`;
                });
                return `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><div class="fw-semibold">${esc(s.name)}</div></td>
                        <td class="text-center font-monospace">${s.score}/${s.total}</td>
                        <td class="text-center font-monospace"><span class="badge ${s.passed ? "text-bg-success" : "text-bg-danger"}">${s.percent}%</span></td>
                        <td class="text-center"><span class="badge ${s.passed ? "text-bg-success" : "text-bg-secondary"}">${s.passed ? "Passed" : "Failed"}</span></td>
                        ${qCells}
                    </tr>
                `;
            }).join("");
        }

        scorecardModal.show();
    }

    function exportReportCSV(report) {
        if (!report) return;
        const students = report.studentResults || [];
        const numQ = report.summary?.totalQuestions || (students[0]?.questionBreakdown?.length || 0);

        const header = ["#", "Student Name", "Score", "Total", "Percentage", "Passed"];
        for (let i = 0; i < numQ; i++) {
            header.push(`Q${i + 1}`);
        }

        const lines = students.map((s, idx) => {
            const row = [
                idx + 1,
                s.name,
                s.score,
                s.total,
                `${s.percent}%`,
                s.passed ? "Passed" : "Failed"
            ];
            (s.questionBreakdown || []).forEach(q => {
                row.push(q.isCorrect ? "Correct" : (q.status === "skipped" ? "Skipped" : "Incorrect"));
            });
            return row.map(csvCell).join(",");
        });

        download(`scorecard-${report.roomCode}-${new Date(report.finishedAt).toISOString().slice(0, 10)}.csv`, [header.map(csvCell).join(","), ...lines].join("\n"), "text/csv");
    }

    if ($("#vsmExportBtn")) {
        $("#vsmExportBtn").addEventListener("click", () => {
            if (currentScorecardReport) exportReportCSV(currentScorecardReport);
        });
    }

    if ($("#liveReportsBody")) {
        $("#liveReportsBody").addEventListener("click", async e => {
            const btn = e.target.closest("button[data-rep-act]");
            if (!btn) return;
            const act = btn.dataset.repAct;
            const id = btn.dataset.id;
            const report = RoomSync.getReport(id);
            if (!report) return toast("Report not found.", "warning");

            if (act === "scorecard") {
                openScorecard(report);
            } else if (act === "csv") {
                exportReportCSV(report);
                toast("Scorecard CSV exported.", "info");
            } else if (act === "delete") {
                const ok = await confirmDialog({
                    title: "Delete Scorecard Report?",
                    body: `Delete saved report for Room ${report.roomCode} (${report.title})? This cannot be undone.`,
                    okLabel: "Delete"
                });
                if (ok) {
                    RoomSync.deleteReport(report.id);
                    renderLiveReports();
                    toast("Report deleted.", "info");
                }
            }
        });
    }

    renderAuth();
})();
