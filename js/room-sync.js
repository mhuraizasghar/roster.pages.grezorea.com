/**
 * QuizHub Live Room Real-Time Synchronization Engine
 * Socrative-style teacher-paced classroom synchronization.
 * Supports BroadcastChannel (0ms local tabs), localStorage events, and /api/room network sync.
 */
const RoomSync = (() => {
  "use strict";

  const PREFIX = "qh.live.room.";
  const INDEX_KEY = "qh.live.active_index";
  const REPORTS_KEY = "qh.live.reports";
  const PARTICIPANT_KEY = "qh.live.participant";
  const CLOUD_API_ORIGIN = "https://quiz-project-students.pages.dev";
  const isCloudflarePages = typeof location !== "undefined" && Boolean(location.hostname) &&
    location.hostname.endsWith(".pages.dev");
  let API_URL = typeof location === "undefined"
    ? "/api/room"
    : (isCloudflarePages ? "/api/room" : `${CLOUD_API_ORIGIN}/api/room`);
  const getApiUrl = () => API_URL;

  const roomListeners = new Map();
  const mutationSeq = new Map();

  function getSeq(code) {
    return mutationSeq.get(code) || 0;
  }

  function bumpSeq(code) {
    const next = (mutationSeq.get(code) || 0) + 1;
    mutationSeq.set(code, next);
    return next;
  }

  function notifyListeners(code, roomData) {
    const set = roomListeners.get(code);
    if (!set || !roomData) return;
    set.forEach(fn => {
      try { fn(roomData); } catch (e) {}
    });
  }

  // Check if BroadcastChannel is available
  function getChannel(code) {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        return new BroadcastChannel(`qh_live_room_${code}`);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function readLocal(code) {
    try {
      const raw = localStorage.getItem(PREFIX + code);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal(code, roomData, notifySameTab = false) {
    try {
      localStorage.setItem(PREFIX + code, JSON.stringify(roomData));
      trackActiveCode(code);
      // Notify same-tab subscribers instantaneously (0ms)
      if (notifySameTab) {
        notifyListeners(code, roomData);
      }
      // Notify other tabs via BroadcastChannel
      const ch = getChannel(code);
      if (ch) {
        ch.postMessage({ type: "SYNC", code, room: roomData, ts: Date.now() });
        ch.close();
      }
      return true;
    } catch (e) {
      console.error("Local room save failed:", e);
      return false;
    }
  }

  function trackActiveCode(code) {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const set = new Set(raw ? JSON.parse(raw) : []);
      set.add(code);
      localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  function untrackActiveCode(code) {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const set = new Set(raw ? JSON.parse(raw) : []);
      set.delete(code);
      localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  // Generate random 4-6 char room code (e.g. AU-4821)
  function generateRoomCode(prefix = "AU") {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  }

  // ----------------------------------------------------
  // Core Sync API Methods
  // ----------------------------------------------------

  async function createRoom(quiz, customCode) {
    const code = (customCode || generateRoomCode()).toUpperCase().trim();
    const now = Date.now();

    const room = {
      code,
      quizId: quiz.id || "live_quiz",
      subject: quiz.subject || "General",
      title: quiz.title || "Live Assessment",
      description: quiz.description || "",
      status: "lobby", // 'lobby' | 'active' | 'finished'
      currentIndex: 0,
      questions: quiz.questions || [],
      passMark: quiz.passMark || 50,
      participants: [], // [ { id, name, joinedAt } ]
      responses: {},    // { [participantId]: { [questionIndex]: answerIndex } }
      createdAt: now,
      updatedAt: now
    };

    writeLocal(code, room);

    // CRITICAL: Retry API until D1 confirms — required for cross-device access
    let apiOk = false;
    for (let attempt = 0; attempt < 4 && !apiOk; attempt++) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", code, quiz })
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            apiOk = true;
            break;
          }
        } else if (res.status === 404 && API_URL === "/api/room") {
          // Static host (e.g. custom domain without Pages Functions) -> switch to Cloudflare Pages API
          API_URL = `${CLOUD_API_ORIGIN}/api/room`;
        }
      } catch (err) {}
      if (!apiOk && attempt < 3) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      }
    }

    room._syncedToCloud = apiOk;
    writeLocal(code, room);
    return room;
  }

  async function getRoom(code, expectedSeq, role) {
    const cleanCode = String(code || "").toUpperCase().trim();
    if (!cleanCode) return null;

    // ALWAYS try the API first — this is the source of truth for cross-device access
    let apiRoom = null;
    try {
      const sep = API_URL.includes("?") ? "&" : "?";
      const roleParam = role === "host" ? "&role=host" : "";
      const res = await fetch(`${API_URL}${sep}code=${encodeURIComponent(cleanCode)}${roleParam}&_t=${Date.now()}`, {
        cache: "no-store"
      });
      // Discard stale in-flight GET if a newer local mutation started while fetching
      if (expectedSeq !== undefined && getSeq(cleanCode) !== expectedSeq) {
        return readLocal(cleanCode);
      }
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.room) {
          apiRoom = { ...data.room, _syncedToCloud: true };
          writeLocal(cleanCode, apiRoom);
        }
      } else if (res.status === 404) {
        // Authoritatively deleted or does not exist on server
        const local = readLocal(cleanCode);
        if (local && local._syncedToCloud) {
          untrackActiveCode(cleanCode);
          try { localStorage.removeItem(PREFIX + cleanCode); } catch (e) {}
          return { code: cleanCode, status: "deleted", updatedAt: Date.now() };
        }
      }
    } catch (e) {}

    if (apiRoom) return apiRoom;

    // Fallback to localStorage if API unavailable (offline / unit tests)
    return readLocal(cleanCode);
  }

  // Switch Quiz / Subject in a room
  async function switchQuiz(code, newQuiz) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

    bumpSeq(cleanCode);
    const now = Date.now();
    room.quizId = newQuiz.id || "live_quiz";
    room.subject = newQuiz.subject || "General";
    room.title = newQuiz.title || "Live Assessment";
    room.description = newQuiz.description || "";
    room.questions = newQuiz.questions || [];
    room.currentIndex = 0;
    room.responses = {}; // Reset responses for new subject
    room.updatedAt = now;

    writeLocal(cleanCode, room, true);

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_quiz", code: cleanCode, quiz: newQuiz })
      });
    } catch (e) {}

    return room;
  }

  // List all currently active rooms (merges local index + cloud API)
  async function getActiveRooms() {
    const roomMap = new Map();

    // 1. Read from local index
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const codes = raw ? JSON.parse(raw) : [];
      codes.forEach(c => {
        const r = readLocal(c);
        if (r && r.status !== "deleted") {
          roomMap.set(r.code, {
            code: r.code,
            quizId: r.quizId,
            subject: r.subject,
            title: r.title,
            status: r.status,
            currentIndex: r.currentIndex || 0,
            totalQuestions: (r.questions || []).length,
            participantsCount: (r.participants || []).length,
            updatedAt: r.updatedAt,
            _syncedToCloud: Boolean(r._syncedToCloud)
          });
        }
      });
    } catch (e) {}

    // 2. Fetch from cloud API
    try {
      const res = await fetch(`${API_URL}?action=list&_t=${Date.now()}`, {
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.rooms)) {
          // Keep cloud rooms as source of truth alongside unsynced local-only rooms
          const cloudCodes = new Set(data.rooms.map(r => r.code));
          for (const [k, v] of roomMap.entries()) {
            if (!cloudCodes.has(k) && (v._syncedToCloud || v.status !== "lobby")) {
              roomMap.delete(k);
              untrackActiveCode(k);
            }
          }
          data.rooms.forEach(r => {
            if (r.status === "lobby" || r.status === "active") {
              roomMap.set(r.code, {
                code: r.code,
                quizId: r.quizId,
                subject: r.subject,
                title: r.title,
                status: r.status,
                currentIndex: r.currentIndex || 0,
                totalQuestions: r.questionsCount || (r.questions ? r.questions.length : 0),
                participantsCount: r.participantsCount || (r.participants ? r.participants.length : 0),
                updatedAt: r.updatedAt
              });
              trackActiveCode(r.code);
            }
          });
        }
      }
    } catch (e) {}

    const list = Array.from(roomMap.values()).filter(r => r.status === "lobby" || r.status === "active");
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }

  async function closeRoom(code) {
    const cleanCode = String(code || "").toUpperCase().trim();
    bumpSeq(cleanCode);
    let room = readLocal(cleanCode);
    if (room) {
      room.status = "deleted";
      room.updatedAt = Date.now();
      writeLocal(cleanCode, room, true);
    }
    untrackActiveCode(cleanCode);

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", code: cleanCode })
      });
    } catch (e) {}
  }

  async function leaveRoom(code, participantId, isUnload = false) {
    const cleanCode = String(code || "").toUpperCase().trim();
    if (!cleanCode || !participantId) {
      clearStoredParticipant();
      return;
    }

    bumpSeq(cleanCode);
    // Update local: remove participant from list immediately
    let room = readLocal(cleanCode);
    if (room && room.participants) {
      room.participants = room.participants.filter(p => p.id !== participantId);
      room.updatedAt = Date.now();
      writeLocal(cleanCode, room, true);
    }
    clearStoredParticipant();

    const payload = JSON.stringify({ action: "leave", code: cleanCode, participantId });
    try {
      if (isUnload) {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(API_URL, new Blob([payload], { type: "text/plain" }));
        } else {
          fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: payload, keepalive: true }).catch(() => {});
        }
      } else {
        await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      }
    } catch (e) {}
  }

  async function joinRoom(code, studentName) {
    const cleanCode = String(code || "").toUpperCase().trim();
    const name = String(studentName || "").trim();
    if (!cleanCode || !name) throw new Error("Room code and student name are required");

    let room = await getRoom(cleanCode);
    if (!room || room.status === "deleted") {
      throw new Error("Room not found or has ended. Check the room code or QR code and try again.");
    }

    // Retrieve or create a stable participant identity for this session
    let participant = getStoredParticipant();
    const normInput = name.toLowerCase();
    if (!participant || participant.name.trim().toLowerCase() !== normInput || participant.code !== cleanCode) {
      participant = {
        id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: name,
        code: cleanCode
      };
      setStoredParticipant(participant);
    }

    bumpSeq(cleanCode);
    const now = Date.now();

    // Deduplicate locally: match by participant ID first, then by case-insensitive name
    const existingById = (room.participants || []).find(p => p.id === participant.id);
    const existingByName = !existingById && (room.participants || []).find(
      p => String(p.name || "").trim().toLowerCase() === normInput
    );

    if (existingByName) {
      participant = { ...participant, id: existingByName.id, name: name };
      existingByName.name = name;
      existingByName.joinedAt = now;
      setStoredParticipant(participant);
    } else if (!existingById) {
      room.participants = room.participants || [];
      room.participants.push({
        id: participant.id,
        name: participant.name,
        joinedAt: now,
        active: true
      });
    }
    room.updatedAt = now;
    writeLocal(cleanCode, room, true);

    // Sync join to cloud API and accept authoritative participant list back
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: cleanCode,
          studentName: participant.name,
          participantId: participant.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (data.participantId && data.participantId !== participant.id) {
            participant.id = data.participantId;
            setStoredParticipant(participant);
          }
          if (Array.isArray(data.participants)) {
            room.participants = data.participants;
            room.updatedAt = data.updatedAt || Date.now();
            writeLocal(cleanCode, room, true);
          }
        }
      }
    } catch (e) {}

    return { room, participant };
  }

  async function navigate(code, questionIndex, status = "active") {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

    bumpSeq(cleanCode);
    const idx = Math.max(0, Math.min(room.questions.length - 1, Number(questionIndex)));
    room.currentIndex = idx;
    room.status = status;
    room.updatedAt = Date.now();

    writeLocal(cleanCode, room, true);

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "navigate",
          code: cleanCode,
          currentIndex: idx,
          status
        })
      });
    } catch (e) {}

    return room;
  }

  async function submitAnswer(code, participantId, questionIndex, answerIndex) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return false;

    bumpSeq(cleanCode);
    room.responses = room.responses || {};
    if (!room.responses[participantId]) {
      room.responses[participantId] = {};
    }
    room.responses[participantId][questionIndex] = Number(answerIndex);
    room.updatedAt = Date.now();

    writeLocal(cleanCode, room, true);

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          code: cleanCode,
          participantId,
          questionIndex,
          answerIndex
        })
      });
    } catch (e) {}

    return true;
  }

  function saveReport(report) {
    try {
      const raw = localStorage.getItem(REPORTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(r => r.id === report.id || r.roomCode === report.roomCode);
      if (idx >= 0) list[idx] = report;
      else list.unshift(report);
      localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getReports() {
    try {
      const raw = localStorage.getItem(REPORTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
      return list;
    } catch (e) {
      return [];
    }
  }

  async function fetchReports() {
    const localList = getReports();
    try {
      const res = await fetch(`${API_URL}?action=reports&_t=${Date.now()}`, {
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.reports)) {
          const map = new Map();
          localList.forEach(r => map.set(r.id || r.roomCode, r));
          data.reports.forEach(r => {
            if (r && (r.id || r.roomCode)) {
              map.set(r.id || r.roomCode, r);
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
          localStorage.setItem(REPORTS_KEY, JSON.stringify(merged));
          return merged;
        }
      }
    } catch (e) {}
    return localList;
  }

  function getReport(idOrCode) {
    const list = getReports();
    return list.find(r => r.id === idOrCode || r.roomCode === idOrCode) || null;
  }

  function deleteReport(idOrCode) {
    try {
      let list = getReports();
      const target = list.find(r => r.id === idOrCode || r.roomCode === idOrCode);
      list = list.filter(r => r.id !== idOrCode && r.roomCode !== idOrCode);
      localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
      // Sync deletion to cloud
      try {
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_report", id: target ? target.id : idOrCode })
        }).catch(() => {});
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  async function finishRoom(code) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

    bumpSeq(cleanCode);
    room.status = "finished";
    room.updatedAt = Date.now();

    // Permanently calculate and store the evaluation report!
    const results = computeResults(room);
    const report = {
      id: `rep_${cleanCode}_${Date.now()}`,
      roomCode: cleanCode,
      quizId: room.quizId,
      subject: room.subject,
      title: room.title,
      finishedAt: Date.now(),
      summary: results.summary,
      studentResults: results.studentResults
    };
    room.report = report;
    saveReport(report);

    writeLocal(cleanCode, room, true);

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", code: cleanCode, report })
      });
    } catch (e) {}

    return room;
  }

  // ----------------------------------------------------
  // Real-Time Subscription
  // ----------------------------------------------------
  function subscribe(code, onUpdate, options = {}) {
    const cleanCode = String(code || "").toUpperCase().trim();
    const role = options && options.role === "host" ? "host" : undefined;
    let active = true;
    let pollTimer = null;
    let inFlight = false;

    if (!roomListeners.has(cleanCode)) {
      roomListeners.set(cleanCode, new Set());
    }
    roomListeners.get(cleanCode).add(onUpdate);

    const channel = getChannel(cleanCode);
    if (channel) {
      channel.onmessage = (event) => {
        if (!active) return;
        if (event.data && event.data.room) {
          onUpdate(event.data.room);
        }
      };
    }

    const storageHandler = (e) => {
      if (!active) return;
      if (e.key === PREFIX + cleanCode && e.newValue) {
        try {
          const room = JSON.parse(e.newValue);
          onUpdate(room);
        } catch (err) {}
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", storageHandler);
    }

    async function pollOnce() {
      if (!active || inFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;
      const reqSeq = getSeq(cleanCode);
      try {
        const room = await getRoom(cleanCode, reqSeq, role);
        if (room && active && getSeq(cleanCode) === reqSeq) {
          onUpdate(room);
        }
      } catch (e) {
      } finally {
        inFlight = false;
      }
    }

    function scheduleNext() {
      if (!active) return;
      pollTimer = setTimeout(async () => {
        await pollOnce();
        scheduleNext();
      }, 600);
    }

    const wakeHandler = () => {
      if (!active) return;
      if (typeof document === "undefined" || !document.hidden) {
        pollOnce();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", wakeHandler);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", wakeHandler);
    }

    scheduleNext();

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      const set = roomListeners.get(cleanCode);
      if (set) {
        set.delete(onUpdate);
        if (!set.size) roomListeners.delete(cleanCode);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", storageHandler);
        window.removeEventListener("online", wakeHandler);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", wakeHandler);
      }
      if (channel) {
        channel.close();
      }
    };
  }

  // ----------------------------------------------------
  // Participant Storage Helpers
  // ----------------------------------------------------
  function getStoredParticipant() {
    try {
      const raw = sessionStorage.getItem(PARTICIPANT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setStoredParticipant(p) {
    try {
      sessionStorage.setItem(PARTICIPANT_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function clearStoredParticipant() {
    try {
      sessionStorage.removeItem(PARTICIPANT_KEY);
    } catch (e) {}
  }

  // ----------------------------------------------------
  // Analytics & Results Calculation
  // ----------------------------------------------------
  function computeResults(room) {
    if (!room || !room.questions) return { studentResults: [], summary: {} };

    const questions = room.questions;
    const participants = room.participants || [];
    const responses = room.responses || {};
    const totalQ = questions.length;

    const studentResults = participants.map(p => {
      const pResponses = responses[p.id] || {};
      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;

      const questionBreakdown = questions.map((q, idx) => {
        const chosen = pResponses[idx];
        const isAnswered = chosen !== undefined && chosen !== null;
        const isCorrect = isAnswered && chosen === q.correct;

        if (!isAnswered) skippedCount++;
        else if (isCorrect) correctCount++;
        else wrongCount++;

        return {
          questionIndex: idx,
          questionText: q.text,
          chosenIndex: chosen,
          correctIndex: q.correct,
          isCorrect: isCorrect,
          status: !isAnswered ? "skipped" : (isCorrect ? "correct" : "wrong")
        };
      });

      const percent = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
      const passed = percent >= (room.passMark || 50);

      return {
        id: p.id,
        name: p.name,
        score: correctCount,
        total: totalQ,
        percent: percent,
        passed: passed,
        wrongCount,
        skippedCount,
        questionBreakdown
      };
    });

    studentResults.sort((a, b) => b.percent - a.percent);

    const avgPercent = studentResults.length
      ? Math.round(studentResults.reduce((sum, r) => sum + r.percent, 0) / studentResults.length)
      : 0;

    const passCount = studentResults.filter(r => r.passed).length;
    const passRate = studentResults.length
      ? Math.round((passCount / studentResults.length) * 100)
      : 0;

    return {
      studentResults,
      summary: {
        totalJoined: participants.length,
        averagePercent: avgPercent,
        passRatePercent: passRate,
        passedStudents: passCount,
        totalQuestions: totalQ
      }
    };
  }

  return {
    getApiUrl,
    createRoom,
    getRoom,
    switchQuiz,
    getActiveRooms,
    closeRoom,
    leaveRoom,
    joinRoom,
    navigate,
    submitAnswer,
    finishRoom,
    subscribe,
    getStoredParticipant,
    setStoredParticipant,
    clearStoredParticipant,
    computeResults,
    saveReport,
    getReports,
    fetchReports,
    getReport,
    deleteReport
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RoomSync;
}
