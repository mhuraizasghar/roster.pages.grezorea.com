(async function() {
  "use strict";

  const { $: $, $$: $$, esc: esc, toast: toast, confirmDialog: confirmDialog, download: download } = U;

  await Store.init();
  $("#loading").classList.add("d-none");

  const hostLobbyView = $("#hostLobbyView");
  const hostActiveView = $("#hostActiveView");
  const hostResultsView = $("#hostResultsView");
  const fullscreenOverlay = $("#fullscreenQrOverlay");

  let currentRoom = null;
  let unsubscribeSync = null;
  let qrCodeInstance = null;
  let fsQrInstance = null;
  let revealedOnScreen = false; // By default, DO NOT reveal correct answer on projector screen

  // Read URL parameters
  const urlParams = new URLSearchParams(location.search);
  const quizId = urlParams.get("quiz");
  let roomCode = (urlParams.get("room") || "").trim().toUpperCase();

  // Initialize or load room
  const allQuizzes = Store.getQuizzes();

  if (quizId) {
    const quiz = Store.getQuiz(quizId);
    if (!quiz) {
      alert("Selected quiz not found.");
      location.href = "admin.html";
      return;
    }
    currentRoom = await RoomSync.createRoom(quiz);
    roomCode = currentRoom.code;
    history.replaceState(null, "", `live-host.html?room=${encodeURIComponent(roomCode)}`);
  } else if (roomCode) {
    currentRoom = await RoomSync.getRoom(roomCode);
    if (!currentRoom) {
      alert(`Room ${roomCode} not found.`);
      location.href = "admin.html";
      return;
    }
  } else {
    const quiz = allQuizzes[0];
    if (quiz) {
      currentRoom = await RoomSync.createRoom(quiz);
      roomCode = currentRoom.code;
      history.replaceState(null, "", `live-host.html?room=${encodeURIComponent(roomCode)}`);
    } else {
      alert("No quizzes available to create a room. Please create a quiz first.");
      location.href = "admin.html";
      return;
    }
  }

  // Setup header
  $("#headerRoomCode").textContent = currentRoom.code;

  // Compute join URL
  const basePath = location.pathname.replace(/[^/]*$/, "");
  const joinUrl = `${location.origin}${basePath}live.html?room=${encodeURIComponent(currentRoom.code)}`;

  // Populate Subject / Quiz Switcher in Lobby
  setupSubjectSwitcher();

  // Generate QR Codes
  generateQRCodes(joinUrl);

  // Setup Private Answer Key
  renderPrivateAnswerKey(currentRoom);

  // Subscribe to real-time events
  unsubscribeSync = RoomSync.subscribe(currentRoom.code, handleLiveRoomUpdate);
  handleLiveRoomUpdate(currentRoom);

  // ----------------------------------------------------
  // Subject / Quiz Selection in Lobby
  // ----------------------------------------------------
  function setupSubjectSwitcher() {
    const select = $("#lobbyQuizSelect");
    if (!select) return;

    select.innerHTML = allQuizzes.map(q => {
      const isCurrent = q.id === currentRoom.quizId;
      return `<option value="${esc(q.id)}" ${isCurrent ? "selected" : ""}>
        ${esc(q.subject || "General")} · ${esc(q.title)} (${q.questions.length} Qs)
      </option>`;
    }).join("");

    select.addEventListener("change", async (e) => {
      const selectedQuizId = e.target.value;
      const newQuiz = Store.getQuiz(selectedQuizId);
      if (!newQuiz) return;

      select.disabled = true;
      toast(`Switching quiz to: ${newQuiz.title}...`, "info");
      currentRoom = await RoomSync.switchQuiz(currentRoom.code, newQuiz);
      select.disabled = false;

      renderLobbyState(currentRoom);
      renderPrivateAnswerKey(currentRoom);
      toast("Subject updated for live room!");
    });
  }

  // ----------------------------------------------------
  // QR Code Generation (Card + Fullscreen)
  // ----------------------------------------------------
  function generateQRCodes(url) {
    $("#lobbyJoinUrlText").textContent = url;
    $("#fsJoinUrl").textContent = url;

    const qrBox = document.getElementById("qrcodeBox");
    const fsBox = document.getElementById("fsQrcodeBox");

    if (typeof QRCode !== "undefined") {
      qrBox.innerHTML = "";
      qrCodeInstance = new QRCode(qrBox, {
        text: url,
        width: 180,
        height: 180,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });

      fsBox.innerHTML = "";
      fsQrInstance = new QRCode(fsBox, {
        text: url,
        width: 320,
        height: 320,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      qrBox.innerHTML = `<a href="${url}" target="_blank" class="btn btn-outline-primary btn-sm">Direct Join Link</a>`;
      fsBox.innerHTML = `<a href="${url}" target="_blank" class="btn btn-primary">Open Join Link</a>`;
    }
  }

  // Fullscreen Projector Handlers
  function openFullscreenOverlay() {
    fullscreenOverlay.classList.remove("d-none");
    $("#fsSubjectBadge").textContent = currentRoom.subject || "Subject";
    $("#fsQuizTitle").textContent = currentRoom.title;
    $("#fsRoomCode").textContent = currentRoom.code;
    $("#fsStudentsCount").textContent = (currentRoom.participants || []).length;

    // Attempt native browser fullscreen
    if (fullscreenOverlay.requestFullscreen) {
      fullscreenOverlay.requestFullscreen().catch(() => {});
    }
  }

  function closeFullscreenOverlay() {
    fullscreenOverlay.classList.add("d-none");
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  $("#qrCardBox").addEventListener("click", openFullscreenOverlay);
  $("#fullscreenQrTriggerBtn").addEventListener("click", openFullscreenOverlay);
  $("#closeFullscreenOverlayBtn").addEventListener("click", closeFullscreenOverlay);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !fullscreenOverlay.classList.contains("d-none")) {
      closeFullscreenOverlay();
    }
  });

  // Copy Link Handler
  $("#copyJoinUrlBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      toast("Join link copied to clipboard!");
    }).catch(() => {
      prompt("Copy room link:", joinUrl);
    });
  });

  // ----------------------------------------------------
  // Real-Time Room State Dispatcher
  // ----------------------------------------------------
  function handleLiveRoomUpdate(room) {
    if (!room) return;
    currentRoom = room;

    const participantsCount = (room.participants || []).length;
    $("#joinedStudentsCount").textContent = participantsCount;
    $("#participantHeaderCount").textContent = participantsCount;
    $("#fsStudentsCount").textContent = participantsCount;

    if (room.status === "lobby") {
      showView("lobby");
      renderLobbyState(room);
    } else if (room.status === "active") {
      showView("active");
      renderActiveState(room);
    } else if (room.status === "finished") {
      showView("results");
      renderResultsState(room);
    }
  }

  function showView(viewName) {
    hostLobbyView.classList.toggle("d-none", viewName !== "lobby");
    hostActiveView.classList.toggle("d-none", viewName !== "active");
    hostResultsView.classList.toggle("d-none", viewName !== "results");
  }

  // ----------------------------------------------------
  // Stage 1: Lobby Rendering
  // ----------------------------------------------------
  function renderLobbyState(room) {
    $("#lobbySubjectBadge").textContent = room.subject || "Subject";
    $("#lobbyQuizTitle").textContent = room.title;
    $("#lobbyBigRoomCode").textContent = room.code;

    const participants = room.participants || [];
    const grid = $("#participantsLobbyGrid");

    if (participants.length) {
      grid.innerHTML = participants.map(p => {
        const initial = (p.name || "?").charAt(0).toUpperCase();
        return `<div class="participant-pill">
          <span class="participant-avatar">${initial}</span>
          <span>${esc(p.name)}</span>
        </div>`;
      }).join("");
    } else {
      grid.innerHTML = '<span class="text-muted small">No students have joined yet. Waiting for QR scans...</span>';
    }
  }

  // Start Live Quiz Button
  $("#startQuizBtn").addEventListener("click", async () => {
    $("#startQuizBtn").disabled = true;
    $("#startQuizBtn").innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Launching...';
    await RoomSync.navigate(currentRoom.code, 0, "active");
  });

  // ----------------------------------------------------
  // Stage 2: Active Question Control (Projector Safe)
  // ----------------------------------------------------
  function renderActiveState(room) {
    const questions = room.questions || [];
    const qIndex = room.currentIndex || 0;
    const q = questions[qIndex];
    if (!q) return;

    $("#hostQIndexBadge").textContent = `Question ${qIndex + 1} of ${questions.length}`;
    $("#hostQSubject").textContent = room.subject || "General";
    $("#hostQText").textContent = q.text;

    // Populate Jump Question Dropdown
    const select = $("#jumpQuestionSelect");
    select.innerHTML = questions.map((item, idx) => {
      return `<option value="${idx}" ${idx === qIndex ? "selected" : ""}>Question ${idx + 1}</option>`;
    }).join("");

    // Toggle navigation buttons
    $("#prevQuestionBtn").disabled = qIndex === 0;
    $("#nextQuestionBtn").disabled = qIndex === questions.length - 1;

    // Calculate responses for this specific question
    const participants = room.participants || [];
    const responses = room.responses || {};
    let answeredCount = 0;
    const optionCounts = (q.options || []).map(() => 0);

    const participantStatusHtml = participants.map(p => {
      const pAns = responses[p.id] ? responses[p.id][qIndex] : undefined;
      const hasAnswered = pAns !== undefined;
      if (hasAnswered) {
        answeredCount++;
        if (optionCounts[pAns] !== undefined) {
          optionCounts[pAns]++;
        }
      }

      const initial = (p.name || "?").charAt(0).toUpperCase();
      return `<div class="participant-pill ${hasAnswered ? "answered" : ""}">
        <span class="participant-avatar">${initial}</span>
        <span>${esc(p.name)}</span>
        ${hasAnswered ? '<i class="fa-solid fa-check text-success ms-1 small"></i>' : ''}
      </div>`;
    }).join("");

    $("#participantStatusList").innerHTML = participantStatusHtml || '<span class="text-muted small">No participants</span>';

    // Update Response Counter
    const totalP = participants.length;
    const pct = totalP > 0 ? Math.round((answeredCount / totalP) * 100) : 0;

    $("#answeredCount").textContent = answeredCount;
    $("#totalStudentsCount").textContent = totalP;
    $("#counterSubmitted").textContent = answeredCount;
    $("#counterPending").textContent = Math.max(0, totalP - answeredCount);
    $("#responseRateBadge").textContent = `${pct}%`;
    $("#responseProgressBar").style.width = `${pct}%`;

    // Render Option Response Distribution (PROJECTOR SAFE - NEUTRAL BARS)
    const breakdownBox = $("#hostOptionsBreakdown");
    breakdownBox.innerHTML = (q.options || []).map((optText, oIdx) => {
      const count = optionCounts[oIdx] || 0;
      const optPct = totalP > 0 ? Math.round((count / totalP) * 100) : 0;
      const isCorrect = oIdx === q.correct;
      const key = String.fromCharCode(65 + oIdx);

      // Only reveal green highlight if teacher explicitly toggled "Reveal to Screen"
      const isRevealed = revealedOnScreen && isCorrect;

      return `<div class="p-3 border rounded ${isRevealed ? "bg-success-subtle border-success" : "bg-light"}">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="fw-semibold">
            <span class="badge ${isRevealed ? "bg-success" : "bg-secondary"} me-2">${key}</span>
            <span>${esc(optText)}</span>
            ${isRevealed ? '<span class="badge bg-success ms-2 small">Correct Answer</span>' : ''}
          </div>
          <div class="small fw-bold">${count} <span class="text-muted fw-normal">(${optPct}%)</span></div>
        </div>
        <div class="progress" style="height: 6px;">
          <div class="progress-bar ${isRevealed ? "bg-success" : "bg-primary"}" style="width: ${optPct}%;"></div>
        </div>
      </div>`;
    }).join("");

    // Explanation Box (Visible only if revealed on screen)
    const explainBox = $("#hostExplanationBox");
    if (q.explanation && revealedOnScreen) {
      $("#hostExplanationText").textContent = q.explanation;
      explainBox.classList.remove("d-none");
    } else {
      explainBox.classList.add("d-none");
    }
  }

  // Next / Previous Navigation Handlers
  $("#nextQuestionBtn").addEventListener("click", async () => {
    if (!currentRoom) return;
    revealedOnScreen = false; // Reset reveal for next question
    $("#revealToScreenBtn").innerHTML = '<i class="fa-regular fa-eye me-1"></i>Reveal Answer on Screen';
    const nextIdx = (currentRoom.currentIndex || 0) + 1;
    await RoomSync.navigate(currentRoom.code, nextIdx, "active");
  });

  $("#prevQuestionBtn").addEventListener("click", async () => {
    if (!currentRoom) return;
    revealedOnScreen = false; // Reset reveal
    $("#revealToScreenBtn").innerHTML = '<i class="fa-regular fa-eye me-1"></i>Reveal Answer on Screen';
    const prevIdx = (currentRoom.currentIndex || 0) - 1;
    await RoomSync.navigate(currentRoom.code, prevIdx, "active");
  });

  $("#jumpQuestionSelect").addEventListener("change", async (e) => {
    if (!currentRoom) return;
    revealedOnScreen = false;
    $("#revealToScreenBtn").innerHTML = '<i class="fa-regular fa-eye me-1"></i>Reveal Answer on Screen';
    const jumpIdx = Number(e.target.value);
    await RoomSync.navigate(currentRoom.code, jumpIdx, "active");
  });

  // Reveal Answer on Screen Toggle (Explicit action after students submitted)
  $("#revealToScreenBtn").addEventListener("click", () => {
    revealedOnScreen = !revealedOnScreen;
    $("#revealToScreenBtn").innerHTML = revealedOnScreen
      ? '<i class="fa-solid fa-eye-slash me-1"></i>Hide Answer on Screen'
      : '<i class="fa-regular fa-eye me-1"></i>Reveal Answer on Screen';
    renderActiveState(currentRoom);
  });

  // ----------------------------------------------------
  // Private Instructor Answer Key Drawer
  // ----------------------------------------------------
  function renderPrivateAnswerKey(room) {
    const list = $("#privateAnswerKeyList");
    if (!list) return;

    const questions = room.questions || [];
    list.innerHTML = questions.map((q, idx) => {
      const correctText = (q.options || [])[q.correct] || "";
      const correctKey = String.fromCharCode(65 + q.correct);

      return `<div class="card qh-card mb-3 p-3">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge bg-secondary font-monospace">Q${idx + 1}</span>
          <span class="badge bg-success-subtle text-success">Option ${correctKey}</span>
        </div>
        <div class="fw-semibold text-dark mb-2">${esc(q.text)}</div>
        <div class="p-2 bg-success-subtle border border-success-subtle rounded small mb-2 text-success">
          <strong>Correct Answer:</strong> ${correctKey}) ${esc(correctText)}
        </div>
        ${q.explanation ? `<div class="explain small"><i class="fa-solid fa-lightbulb text-warning me-1"></i>${esc(q.explanation)}</div>` : ''}
      </div>`;
    }).join("");
  }

  // Finish & End Exam Button Handler
  $("#finishLiveQuizBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Finish & End Live Assessment?",
      body: "All connected students will immediately receive their personal scorecards and question reviews.",
      okLabel: "Finish Assessment",
      okClass: "btn-danger"
    });

    if (ok) {
      await RoomSync.finishRoom(currentRoom.code);
    }
  });

  // ----------------------------------------------------
  // Stage 3: Results & Comprehensive Class Report
  // ----------------------------------------------------
  function renderResultsState(room) {
    const { studentResults, summary } = RoomSync.computeResults(room);

    $("#reportTotalJoined").textContent = summary.totalJoined;
    $("#reportAverageScore").textContent = `${summary.averagePercent}%`;
    $("#reportPassRate").textContent = `${summary.passRatePercent}%`;
    $("#reportTotalQuestions").textContent = summary.totalQuestions;

    // Build Table Headers (Q1, Q2, Q3...)
    const headerRow = $("#reportTableHeader");
    headerRow.innerHTML = `<th>#</th>
      <th>Student Name</th>
      <th class="text-end">Raw Score</th>
      <th class="text-end">Percentage</th>
      <th class="text-center">Status</th>` +
      (room.questions || []).map((_, i) => `<th class="text-center">Q${i + 1}</th>`).join("");

    // Build Table Body
    const tbody = $("#reportTableBody");
    tbody.innerHTML = studentResults.length ? studentResults.map((r, i) => {
      const qCells = r.questionBreakdown.map(item => {
        if (item.status === "correct") {
          return '<td class="text-center matrix-check"><i class="fa-solid fa-check"></i></td>';
        } else if (item.status === "wrong") {
          return '<td class="text-center matrix-cross"><i class="fa-solid fa-xmark"></i></td>';
        } else {
          return '<td class="text-center text-muted">-</td>';
        }
      }).join("");

      return `<tr>
        <td class="text-muted small">${i + 1}</td>
        <td class="fw-bold">${esc(r.name)}</td>
        <td class="text-end font-monospace">${r.score}/${r.total}</td>
        <td class="text-end fw-bold">${r.percent}%</td>
        <td class="text-center"><span class="badge ${r.passed ? "text-bg-success" : "text-bg-danger"}">${r.passed ? "Passed" : "Failed"}</span></td>
        ${qCells}
      </tr>`;
    }).join("") : '<tr><td colspan="10" class="text-center text-muted py-5">No participants joined this session.</td></tr>';
  }

  // Export Results as CSV
  $("#exportHostCsvBtn").addEventListener("click", () => {
    if (!currentRoom) return;
    const { studentResults } = RoomSync.computeResults(currentRoom);
    if (!studentResults.length) return toast("No student results to export.", "warning");

    const questions = currentRoom.questions || [];
    const qHeaders = questions.map((_, i) => `Q${i + 1}`);
    const header = ["Rank", "Student Name", "Score", "Total", "Percent", "Passed", ...qHeaders];

    const lines = studentResults.map((r, i) => {
      const qValues = r.questionBreakdown.map(item => item.status === "correct" ? "1" : "0");
      return [
        i + 1,
        `"${r.name.replace(/"/g, '""')}"`,
        r.score,
        r.total,
        `${r.percent}%`,
        r.passed ? "Passed" : "Failed",
        ...qValues
      ].join(",");
    });

    const csvContent = [header.join(","), ...lines].join("\n");
    download(`live-class-report-${currentRoom.code}.csv`, csvContent, "text/csv");
  });

})();
