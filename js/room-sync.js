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
  const API_URL = "/api/room";

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

  function writeLocal(code, roomData) {
    try {
      localStorage.setItem(PREFIX + code, JSON.stringify(roomData));
      trackActiveCode(code);
      // Notify via BroadcastChannel
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

    // Try cloud API in background
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", code, quiz })
      });
    } catch (err) {}

    return room;
  }

  async function getRoom(code) {
    const cleanCode = String(code || "").toUpperCase().trim();
    if (!cleanCode) return null;

    let room = readLocal(cleanCode);

    try {
      const res = await fetch(`${API_URL}?code=${encodeURIComponent(cleanCode)}`, {
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.room) {
          if (!room || (data.room.updatedAt && data.room.updatedAt >= (room.updatedAt || 0))) {
            room = { ...room, ...data.room };
            writeLocal(cleanCode, room);
          }
        }
      }
    } catch (e) {}

    return room;
  }

  // Switch Quiz / Subject in a room
  async function switchQuiz(code, newQuiz) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

    const now = Date.now();
    room.quizId = newQuiz.id || "live_quiz";
    room.subject = newQuiz.subject || "General";
    room.title = newQuiz.title || "Live Assessment";
    room.description = newQuiz.description || "";
    room.questions = newQuiz.questions || [];
    room.currentIndex = 0;
    room.responses = {}; // Reset responses for new subject
    room.updatedAt = now;

    writeLocal(cleanCode, room);

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
            updatedAt: r.updatedAt
          });
        }
      });
    } catch (e) {}

    // 2. Fetch from cloud API
    try {
      const res = await fetch(`${API_URL}?action=list`, {
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.rooms)) {
          data.rooms.forEach(r => {
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
          });
        }
      }
    } catch (e) {}

    const list = Array.from(roomMap.values());
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }

  async function closeRoom(code) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode);
    if (room) {
      room.status = "deleted";
      room.updatedAt = Date.now();
      writeLocal(cleanCode, room);
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

  async function joinRoom(code, studentName) {
    const cleanCode = String(code || "").toUpperCase().trim();
    const name = String(studentName || "").trim();
    if (!cleanCode || !name) throw new Error("Room code and student name are required");

    let participant = getStoredParticipant();
    if (!participant || participant.name !== name) {
      participant = {
        id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: name,
        code: cleanCode
      };
      setStoredParticipant(participant);
    }

    let room = await getRoom(cleanCode);
    if (!room) throw new Error("Room not found. Check the room code or QR code.");

    const now = Date.now();
    const existing = (room.participants || []).find(p => p.id === participant.id);
    if (!existing) {
      room.participants = room.participants || [];
      room.participants.push({
        id: participant.id,
        name: participant.name,
        joinedAt: now
      });
      room.updatedAt = now;
      writeLocal(cleanCode, room);
    }

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: cleanCode,
          studentName: participant.name,
          participantId: participant.id
        })
      });
    } catch (e) {}

    return { room, participant };
  }

  async function navigate(code, questionIndex, status = "active") {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

    const idx = Math.max(0, Math.min(room.questions.length - 1, Number(questionIndex)));
    room.currentIndex = idx;
    room.status = status;
    room.updatedAt = Date.now();

    writeLocal(cleanCode, room);

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

    room.responses = room.responses || {};
    if (!room.responses[participantId]) {
      room.responses[participantId] = {};
    }
    room.responses[participantId][questionIndex] = Number(answerIndex);
    room.updatedAt = Date.now();

    writeLocal(cleanCode, room);

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

  function getReport(idOrCode) {
    const list = getReports();
    return list.find(r => r.id === idOrCode || r.roomCode === idOrCode) || null;
  }

  function deleteReport(idOrCode) {
    try {
      let list = getReports();
      list = list.filter(r => r.id !== idOrCode && r.roomCode !== idOrCode);
      localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function finishRoom(code) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let room = readLocal(cleanCode) || await getRoom(cleanCode);
    if (!room) return null;

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

    writeLocal(cleanCode, room);

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
  function subscribe(code, onUpdate) {
    const cleanCode = String(code || "").toUpperCase().trim();
    let active = true;

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
    window.addEventListener("storage", storageHandler);

    const intervalId = setInterval(async () => {
      if (!active) return;
      try {
        const room = await getRoom(cleanCode);
        if (room && active) {
          onUpdate(room);
        }
      } catch (e) {}
    }, 850);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener("storage", storageHandler);
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
    createRoom,
    getRoom,
    switchQuiz,
    getActiveRooms,
    closeRoom,
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
    getReport,
    deleteReport
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RoomSync;
}
