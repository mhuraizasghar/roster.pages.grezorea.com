(async function() {
  "use strict";

  const { $: $, $$: $$, esc: esc } = U;

  const joinView = $("#joinView");
  const lobbyView = $("#lobbyView");
  const questionView = $("#questionView");
  const finishedView = $("#finishedView");
  const joinAlert = $("#joinAlert");
  const joinForm = $("#joinForm");

  let currentRoom = null;
  let currentParticipant = null;
  let unsubscribeSync = null;
  let selectedOption = null;
  let displayedQuestionIndex = -1;

  // Read URL parameters (e.g. ?room=AU-2026)
  const urlParams = new URLSearchParams(location.search);
  const initialRoomCode = (urlParams.get("room") || "").trim().toUpperCase();
  if (initialRoomCode) {
    $("#roomCodeInput").value = initialRoomCode;
    $("#studentNameInput").focus();
  }

  // Load active rooms list on student join screen
  loadActiveRoomsForStudent();

  // Check if participant was already joined in this session
  const storedParticipant = RoomSync.getStoredParticipant();
  if (storedParticipant && storedParticipant.code) {
    connectToRoom(storedParticipant.code, storedParticipant.name);
  }

  async function loadActiveRoomsForStudent() {
    try {
      const rooms = await RoomSync.getActiveRooms();
      const card = $("#activeRoomsStudentCard");
      const list = $("#activeRoomsStudentList");
      if (!card || !list) return;

      const activeOnly = rooms.filter(r => r.status === "lobby" || r.status === "active");
      if (!activeOnly.length) {
        card.classList.add("d-none");
        return;
      }

      $("#activeRoomsCountBadge").textContent = `${activeOnly.length} Active`;
      list.innerHTML = activeOnly.map(r => {
        const isLive = r.status === "active";
        return `<div class="p-2 border rounded bg-white d-flex align-items-center justify-content-between gap-2">
          <div>
            <div class="fw-bold font-monospace text-primary">${esc(r.code)}</div>
            <div class="small text-muted">${esc(r.subject)} · ${esc(r.title)}</div>
          </div>
          <button type="button" class="btn btn-outline-primary btn-sm flex-none join-active-room-btn" data-code="${esc(r.code)}">
            <i class="fa-solid fa-arrow-right-to-bracket me-1"></i>Join Room
          </button>
        </div>`;
      }).join("");

      $$(".join-active-room-btn", list).forEach(btn => {
        btn.addEventListener("click", () => {
          $("#roomCodeInput").value = btn.dataset.code;
          $("#studentNameInput").focus();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });

      card.classList.remove("d-none");
    } catch (e) {}
  }

  // ----------------------------------------------------
  // Join Room Handler
  // ----------------------------------------------------
  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    joinAlert.classList.add("d-none");

    const code = $("#roomCodeInput").value.trim().toUpperCase();
    const name = $("#studentNameInput").value.trim();

    if (!code) {
      joinAlert.textContent = "Please enter a valid room code.";
      joinAlert.classList.remove("d-none");
      return;
    }
    if (!name || name.length < 2) {
      joinAlert.textContent = "Please enter your name (at least 2 characters).";
      joinAlert.classList.remove("d-none");
      return;
    }

    $("#joinSubmitBtn").disabled = true;
    $("#joinSubmitBtn").innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Connecting...';

    await connectToRoom(code, name);
    $("#joinSubmitBtn").disabled = false;
    $("#joinSubmitBtn").innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket me-1"></i>Enter Live Room';
  });

  async function connectToRoom(code, name) {
    try {
      const res = await RoomSync.joinRoom(code, name);
      currentRoom = res.room;
      currentParticipant = res.participant;

      // Update Nav Bar
      $("#navLiveRoomCode").textContent = currentRoom.code;
      $("#navLiveRoomCode").classList.remove("d-none");
      $("#navStudentName").textContent = currentParticipant.name;
      $("#navStudentName").classList.remove("d-none");
      $("#leaveRoomBtn").classList.remove("d-none");

      // Subscribe to real-time events
      if (unsubscribeSync) unsubscribeSync();
      unsubscribeSync = RoomSync.subscribe(currentRoom.code, handleLiveRoomUpdate);

      // Handle current state
      handleLiveRoomUpdate(currentRoom);
    } catch (err) {
      joinAlert.textContent = err.message || "Failed to join room. Please check the code.";
      joinAlert.classList.remove("d-none");
    }
  }

  // ----------------------------------------------------
  // Real-Time Room State Dispatcher
  // ----------------------------------------------------
  function handleLiveRoomUpdate(room) {
    if (!room) return;
    currentRoom = room;

    if (room.status === "lobby") {
      showView("lobby");
      renderLobby(room);
    } else if (room.status === "active") {
      showView("question");
      renderActiveQuestion(room);
    } else if (room.status === "finished") {
      showView("finished");
      renderFinished(room);
    }
  }

  function showView(viewName) {
    joinView.classList.toggle("d-none", viewName !== "join");
    lobbyView.classList.toggle("d-none", viewName !== "lobby");
    questionView.classList.toggle("d-none", viewName !== "question");
    finishedView.classList.toggle("d-none", viewName !== "finished");
  }

  // ----------------------------------------------------
  // View 1: Lobby
  // ----------------------------------------------------
  function renderLobby(room) {
    $("#lobbyRoomBadge").textContent = room.code;
    $("#lobbySubjectTitle").textContent = `${room.subject} · ${room.title}`;
    $("#lobbyStudentName").textContent = currentParticipant.name;
    $("#lobbyParticipantsCount").textContent = (room.participants || []).length;
  }

  // ----------------------------------------------------
  // View 2: Active Question (Teacher-Paced)
  // ----------------------------------------------------
  function renderActiveQuestion(room) {
    const questions = room.questions || [];
    const qIndex = room.currentIndex || 0;
    const q = questions[qIndex];
    if (!q) return;

    // Check if participant already answered this question
    const pResponses = (room.responses || {})[currentParticipant.id] || {};
    const recordedAnswer = pResponses[qIndex];
    const isLocked = recordedAnswer !== undefined;

    // Check if question changed
    const questionChanged = displayedQuestionIndex !== qIndex;
    displayedQuestionIndex = qIndex;

    $("#qCurrentBadge").textContent = `Question ${qIndex + 1} of ${questions.length}`;
    $("#qSubjectBadge").textContent = room.subject || "Live Session";
    $("#qText").textContent = q.text;

    if (questionChanged) {
      selectedOption = isLocked ? recordedAnswer : null;

      // Render options
      const optionsContainer = $("#qOptionsList");
      optionsContainer.innerHTML = (q.options || []).map((optText, i) => {
        const isSelected = selectedOption === i;
        const key = String.fromCharCode(65 + i);
        return `<div class="opt ${isSelected ? "selected" : ""} ${isLocked ? "locked" : ""}" data-idx="${i}" tabindex="${isLocked ? "-1" : "0"}" role="radio" aria-checked="${isSelected}">
          <span class="opt-key">${key}</span>
          <span class="opt-text">${esc(optText)}</span>
        </div>`;
      }).join("");

      // Attach option click handlers only if not locked
      if (!isLocked) {
        $$(".opt", optionsContainer).forEach(optEl => {
          optEl.addEventListener("click", () => {
            // Check again if locked in memory
            if (isAnswerLocked()) return;
            const idx = Number(optEl.dataset.idx);
            selectedOption = idx;
            $$(".opt", optionsContainer).forEach(el => el.classList.remove("selected"));
            optEl.classList.add("selected");
            $("#submitAnswerBtn").disabled = false;
          });
        });
      }
    }

    // Update submission status bar
    const statusBox = $("#qAnswerStatus");
    const submitBtn = $("#submitAnswerBtn");

    if (isLocked) {
      const key = String.fromCharCode(65 + recordedAnswer);
      statusBox.innerHTML = `<span class="text-success fw-bold"><i class="fa-solid fa-lock me-1"></i>Answer Locked (Option ${key})</span> · Submitted successfully. Waiting for instructor to advance...`;
      submitBtn.disabled = true;
      submitBtn.className = "btn btn-secondary btn-sm px-4";
      submitBtn.innerHTML = '<i class="fa-solid fa-lock me-1"></i>Answer Locked';
    } else {
      statusBox.innerHTML = '<i class="fa-solid fa-circle-info me-1"></i>Select an option and submit your response.';
      submitBtn.disabled = selectedOption === null;
      submitBtn.className = "btn btn-primary btn-sm px-4";
      submitBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Submit Answer';
    }
  }

  function isAnswerLocked() {
    if (!currentRoom || !currentParticipant) return false;
    const qIndex = currentRoom.currentIndex || 0;
    const pResponses = (currentRoom.responses || {})[currentParticipant.id] || {};
    return pResponses[qIndex] !== undefined;
  }

  // Submit Answer Button Handler (ONE-TIME SUBMIT ONLY - CANNOT UPDATE)
  $("#submitAnswerBtn").addEventListener("click", async () => {
    if (selectedOption === null || !currentRoom || !currentParticipant) return;
    if (isAnswerLocked()) return; // Prevent updating

    const btn = $("#submitAnswerBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Submitting...';

    const qIndex = currentRoom.currentIndex || 0;
    await RoomSync.submitAnswer(currentRoom.code, currentParticipant.id, qIndex, selectedOption);

    // Lock options immediately on screen
    $$(".opt", $("#qOptionsList")).forEach(optEl => {
      optEl.classList.add("locked");
    });

    const key = String.fromCharCode(65 + selectedOption);
    $("#qAnswerStatus").innerHTML = `<span class="text-success fw-bold"><i class="fa-solid fa-lock me-1"></i>Answer Locked (Option ${key})!</span> Submitted successfully. Waiting for instructor to advance...`;
    btn.className = "btn btn-secondary btn-sm px-4";
    btn.innerHTML = '<i class="fa-solid fa-lock me-1"></i>Answer Locked';
  });

  // ----------------------------------------------------
  // View 3: Finished Session & Personal Results
  // ----------------------------------------------------
  function renderFinished(room) {
    const results = RoomSync.computeResults(room);
    const myResult = results.studentResults.find(r => r.id === currentParticipant.id) || {
      score: 0,
      total: room.questions.length,
      percent: 0,
      passed: false,
      wrongCount: 0,
      skippedCount: 0,
      questionBreakdown: []
    };

    $("#resScore").textContent = `${myResult.score}/${myResult.total}`;
    $("#resPercent").textContent = `${myResult.percent}%`;
    $("#resCorrect").textContent = myResult.score;
    $("#resWrong").textContent = myResult.wrongCount;

    $("#resPassBadge").innerHTML = myResult.passed
      ? '<span class="badge bg-success px-3 py-2 fs-6"><i class="fa-solid fa-circle-check me-1"></i>Congratulations! You Passed</span>'
      : '<span class="badge bg-danger px-3 py-2 fs-6"><i class="fa-solid fa-triangle-exclamation me-1"></i>Needs Improvement (Failed)</span>';

    // Render detailed questions review
    const reviewList = $("#reviewList");
    reviewList.innerHTML = (myResult.questionBreakdown || []).map((item, idx) => {
      const q = room.questions[item.questionIndex];
      const statusIcon = item.status === "correct"
        ? '<span class="text-success fw-bold"><i class="fa-solid fa-circle-check me-1"></i>Correct</span>'
        : (item.status === "skipped"
          ? '<span class="text-warning fw-bold"><i class="fa-solid fa-clock me-1"></i>Skipped</span>'
          : '<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i>Incorrect</span>');

      const optionsHtml = (q.options || []).map((optText, oIdx) => {
        let optClass = "rev-opt";
        if (oIdx === item.correctIndex) optClass += " correct";
        else if (oIdx === item.chosenIndex && item.status === "wrong") optClass += " wrong";

        const key = String.fromCharCode(65 + oIdx);
        return `<div class="${optClass}">
          <span class="rev-key">${key}</span>
          <span class="rev-text">${esc(optText)}</span>
          ${oIdx === item.correctIndex ? '<span class="badge bg-success-subtle text-success ms-auto small">Correct Answer</span>' : ''}
          ${oIdx === item.chosenIndex && item.status === "wrong" ? '<span class="badge bg-danger-subtle text-danger ms-auto small">Your Choice</span>' : ''}
        </div>`;
      }).join("");

      return `<div class="card qh-card mb-3 rev-card p-3" data-status="${item.status}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-bold small text-muted">Question ${idx + 1}</span>
          ${statusIcon}
        </div>
        <div class="fw-semibold mb-3">${esc(item.questionText)}</div>
        <div class="mb-2">${optionsHtml}</div>
        ${q.explanation ? `<div class="explain mt-2"><i class="fa-solid fa-lightbulb text-warning me-1"></i>${esc(q.explanation)}</div>` : ''}
      </div>`;
    }).join("");
  }

  // ----------------------------------------------------
  // Leave Room Handler
  // ----------------------------------------------------
  $("#leaveRoomBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to exit the live room?")) {
      if (unsubscribeSync) unsubscribeSync();
      RoomSync.clearStoredParticipant();
      currentRoom = null;
      currentParticipant = null;

      $("#navLiveRoomCode").classList.add("d-none");
      $("#navStudentName").classList.add("d-none");
      $("#leaveRoomBtn").classList.add("d-none");

      loadActiveRoomsForStudent();
      showView("join");
    }
  });

})();
