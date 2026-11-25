const test = require("node:test");
const assert = require("node:assert/strict");

function fakeStorage() {
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  };
}

globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.fetch = async () => { throw new Error("offline"); };

const RoomSync = require("../js/room-sync.js");

const sampleQuiz = {
  id: "quiz-test",
  title: "Test Live Quiz",
  subject: "Computer Science",
  passMark: 50,
  questions: [
    {
      id: "q1",
      text: "What is 2 + 2?",
      options: ["3", "4", "5", "6"],
      correct: 1,
      explanation: "2 + 2 equals 4"
    },
    {
      id: "q2",
      text: "What is the capital of France?",
      options: ["London", "Berlin", "Paris", "Madrid"],
      correct: 2,
      explanation: "Paris is the capital of France"
    }
  ]
};

test("RoomSync: create room, verify code and initial state", async () => {
  const room = await RoomSync.createRoom(sampleQuiz, "TEST-1001");
  assert.equal(room.code, "TEST-1001");
  assert.equal(room.status, "lobby");
  assert.equal(room.currentIndex, 0);
  assert.equal(room.questions.length, 2);
  assert.equal(room.participants.length, 0);
});

test("RoomSync: student joins room with name only (no auth)", async () => {
  const { room, participant } = await RoomSync.joinRoom("TEST-1001", "Ali Hassan");
  assert.equal(participant.name, "Ali Hassan");
  assert.ok(participant.id);
  assert.equal(room.participants.length, 1);
  assert.equal(room.participants[0].name, "Ali Hassan");
});

test("RoomSync: teacher-paced navigation", async () => {
  // Start quiz -> question 0
  let room = await RoomSync.navigate("TEST-1001", 0, "active");
  assert.equal(room.status, "active");
  assert.equal(room.currentIndex, 0);

  // Advance to question 1
  room = await RoomSync.navigate("TEST-1001", 1, "active");
  assert.equal(room.currentIndex, 1);

  // Previous to question 0
  room = await RoomSync.navigate("TEST-1001", 0, "active");
  assert.equal(room.currentIndex, 0);
});

test("RoomSync: student submits answers and computeResults calculates accuracy", async () => {
  const participant = RoomSync.getStoredParticipant();

  // Student answers Q1 with Option 1 (4 - correct)
  await RoomSync.submitAnswer("TEST-1001", participant.id, 0, 1);

  // Student answers Q2 with Option 0 (London - wrong)
  await RoomSync.submitAnswer("TEST-1001", participant.id, 1, 0);

  // Teacher finishes room
  const finished = await RoomSync.finishRoom("TEST-1001");
  assert.equal(finished.status, "finished");

  const results = RoomSync.computeResults(finished);
  assert.equal(results.summary.totalJoined, 1);
  assert.equal(results.studentResults.length, 1);

  const student = results.studentResults[0];
  assert.equal(student.name, "Ali Hassan");
  assert.equal(student.score, 1);
  assert.equal(student.total, 2);
  assert.equal(student.percent, 50);
  assert.equal(student.passed, true);
  assert.equal(student.wrongCount, 1);

  assert.equal(student.questionBreakdown[0].isCorrect, true);
  assert.equal(student.questionBreakdown[1].isCorrect, false);
});

test("RoomSync: mid-exam leaveRoom removes student and rejoin prevents duplicates", async () => {
  await RoomSync.createRoom(sampleQuiz, "EXIT-2026");

  // Join two students
  const { participant: p1 } = await RoomSync.joinRoom("EXIT-2026", "Sara Khan");
  await RoomSync.joinRoom("EXIT-2026", "Bilal Ahmed");
  let room = await RoomSync.getRoom("EXIT-2026");
  assert.equal(room.participants.length, 2);

  // Sara rejoins with different casing (without leaving first) -> no duplicate
  await RoomSync.joinRoom("EXIT-2026", "sara khan");
  room = await RoomSync.getRoom("EXIT-2026");
  assert.equal(room.participants.length, 2);

  // Sara exits mid-exam -> removed from participant list
  await RoomSync.leaveRoom("EXIT-2026", p1.id);
  room = await RoomSync.getRoom("EXIT-2026");
  assert.equal(room.participants.length, 1);
  assert.equal(room.participants[0].name, "Bilal Ahmed");
  assert.equal(RoomSync.getStoredParticipant(), null);

  // Sara rejoins again -> added back cleanly once (total 2, no duplicate)
  await RoomSync.joinRoom("EXIT-2026", "Sara Khan");
  room = await RoomSync.getRoom("EXIT-2026");
  assert.equal(room.participants.length, 2);
});

test("RoomSync: custom static domain (Vercel grezorea) routes API calls to Cloudflare Pages backend", async () => {
  const prevLocation = globalThis.location;
  const prevFetch = globalThis.fetch;
  try {
    globalThis.location = { hostname: "quiz-project.students.pages.grezorea.com", origin: "https://quiz-project.students.pages.grezorea.com" };
    delete require.cache[require.resolve("../js/room-sync.js")];
    const grezoreaRoomSync = require("../js/room-sync.js");
    assert.equal(grezoreaRoomSync.getApiUrl(), "https://quiz-project-students.pages.dev/api/room");

    let calledUrl = null;
    globalThis.fetch = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ ok: true, code: "SYNC-1001" }) };
    };
    const room = await grezoreaRoomSync.createRoom(sampleQuiz, "SYNC-1001");
    assert.equal(calledUrl, "https://quiz-project-students.pages.dev/api/room");
    assert.equal(room._syncedToCloud, true);
  } finally {
    globalThis.location = prevLocation;
    globalThis.fetch = prevFetch;
    delete require.cache[require.resolve("../js/room-sync.js")];
  }
});

test("RoomSync: subscribe dispatches instant local updates and 404 cloud deletion", async () => {
  const prevFetch = globalThis.fetch;
  try {
    let serverDeleted = false;
    globalThis.fetch = async (url, opts) => {
      if (opts && opts.method === "POST") {
        const body = JSON.parse(opts.body);
        if (body.action === "delete") serverDeleted = true;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (serverDeleted) {
        return { ok: false, status: 404, json: async () => ({ error: "Room not found" }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          room: {
            code: "RT-5555",
            quizId: "quiz-test",
            subject: "CS",
            title: "RT Quiz",
            status: "lobby",
            currentIndex: 0,
            questions: sampleQuiz.questions,
            participants: [],
            responses: {},
            updatedAt: Date.now()
          }
        })
      };
    };

    delete require.cache[require.resolve("../js/room-sync.js")];
    const rtSync = require("../js/room-sync.js");
    await rtSync.createRoom(sampleQuiz, "RT-5555");

    const updates = [];
    const unsub = rtSync.subscribe("RT-5555", room => updates.push(room));

    // Same-tab navigate should notify listener immediately (0ms)
    await rtSync.navigate("RT-5555", 1, "active");
    assert.ok(updates.some(r => r.status === "active" && r.currentIndex === 1));

    // Simulate cloud deletion on host -> getRoom returns deleted status
    serverDeleted = true;
    const afterDelete = await rtSync.getRoom("RT-5555");
    assert.equal(afterDelete.status, "deleted");

    unsub();
  } finally {
    globalThis.fetch = prevFetch;
    delete require.cache[require.resolve("../js/room-sync.js")];
  }
});

test("Security: live room API rejects SQLi room codes, XSS/prototype keys, answer tampering & hides answers for students", async () => {
  const { onRequest } = await import("../functions/api/room.js");

  // Minimal in-memory D1 mock supporting prepared statements
  const rooms = new Map();
  const mockDb = {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async run() {
          if (sql.includes("INSERT OR REPLACE INTO live_rooms")) {
            rooms.set(args[0], {
              code: args[0], quiz_id: args[1], subject: args[2], title: args[3],
              status: "lobby", current_index: 0, payload: args[4],
              participants: "[]", responses: "{}", created_at: args[5], updated_at: args[6]
            });
          } else if (sql.includes("UPDATE live_rooms SET participants = ?, updated_at = ? WHERE code = ? AND updated_at = ?")) {
            const row = rooms.get(args[2]);
            if (row && row.updated_at === args[3]) {
              row.participants = args[0]; row.updated_at = args[1];
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          } else if (sql.includes("UPDATE live_rooms SET current_index = ?, status = ?, updated_at = ? WHERE code = ?")) {
            const row = rooms.get(args[3]);
            if (row) { row.current_index = args[0]; row.status = args[1]; row.updated_at = args[2]; }
          } else if (sql.includes("UPDATE live_rooms SET responses = ?, updated_at = ? WHERE code = ? AND updated_at = ?")) {
            const row = rooms.get(args[2]);
            if (row && row.updated_at === args[3]) {
              row.responses = args[0]; row.updated_at = args[1];
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes("FROM live_rooms WHERE code = ?")) return rooms.get(args[0]) || null;
          return null;
        },
        async all() { return { results: [] }; }
      };
    }
  };

  const makeReq = (url, method = "GET", body = null) => new Request(url, {
    method,
    headers: { "Origin": "https://quiz-project.students.pages.grezorea.com", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  // 1. SQL injection room code rejected with 400
  const sqliRes = await onRequest({ request: makeReq("https://x.test/api/room?code=' OR 1=1--"), env: { DB: mockDb } });
  assert.equal(sqliRes.status, 400);

  // 2. Create valid room and test student GET strips correct answers & explanation
  await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "create", code: "SEC-101", quiz: sampleQuiz }), env: { DB: mockDb } });
  const studentGet = await (await onRequest({ request: makeReq("https://x.test/api/room?code=SEC-101"), env: { DB: mockDb } })).json();
  assert.equal(studentGet.room.questions[0].correct, undefined);
  assert.equal(studentGet.room.questions[0].explanation, undefined);

  // Host GET includes answers
  const hostGet = await (await onRequest({ request: makeReq("https://x.test/api/room?code=SEC-101&role=host"), env: { DB: mockDb } })).json();
  assert.equal(hostGet.room.questions[0].correct, 1);

  // 3. Unregistered / prototype-pollution participant cannot submit answers
  await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "navigate", code: "SEC-101", currentIndex: 0, status: "active" }), env: { DB: mockDb } });
  const protoAns = await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "answer", code: "SEC-101", participantId: "__proto__", questionIndex: 0, answerIndex: 1 }), env: { DB: mockDb } });
  assert.equal(protoAns.status, 400);

  const fakeUserAns = await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "answer", code: "SEC-101", participantId: "p_attacker_999", questionIndex: 0, answerIndex: 1 }), env: { DB: mockDb } });
  assert.equal(fakeUserAns.status, 403);

  // 4. Valid student joins, submits once, and cannot tamper/overwrite locked answer
  const joinRes = await (await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "join", code: "SEC-101", studentName: "Valid Student" }), env: { DB: mockDb } })).json();
  const pid = joinRes.participantId;
  await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "answer", code: "SEC-101", participantId: pid, questionIndex: 0, answerIndex: 0 }), env: { DB: mockDb } });
  const tamperRes = await (await onRequest({ request: makeReq("https://x.test/api/room", "POST", { action: "answer", code: "SEC-101", participantId: pid, questionIndex: 0, answerIndex: 1 }), env: { DB: mockDb } })).json();
  assert.equal(tamperRes.locked, true);
  assert.equal(tamperRes.answerIndex, 0);
});
