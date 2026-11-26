function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };
}

async function ensureTable(env) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS live_rooms (
        code TEXT PRIMARY KEY,
        quiz_id TEXT,
        subject TEXT,
        title TEXT,
        status TEXT,
        current_index INTEGER DEFAULT 0,
        payload TEXT,
        participants TEXT,
        responses TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS live_reports (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        quiz_id TEXT,
        subject TEXT,
        title TEXT,
        payload TEXT NOT NULL,
        finished_at INTEGER NOT NULL
      )
    `).run();
  } catch (err) {
    console.error("ensureTable error:", err);
  }
}

function safeJson(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Fallback if D1 is not bound in local environment
  if (!env || !env.DB) {
    return Response.json({ ok: false, error: "Database binding unavailable. Local fallback active." }, { status: 503, headers });
  }

  try {
  await ensureTable(env);
  const url = new URL(request.url);

  // ----------------------------------------------------
  // GET REQUESTS: Fetch Room State or List Active Rooms
  // ----------------------------------------------------
  if (request.method === "GET") {
    const action = url.searchParams.get("action");

    // List all running / active rooms
    if (action === "list") {
      const { results } = await env.DB.prepare(
        "SELECT code, quiz_id, subject, title, status, current_index, payload, participants, created_at, updated_at FROM live_rooms WHERE status IN ('lobby', 'active') ORDER BY updated_at DESC LIMIT 20"
      ).all();

      const rooms = (results || []).map(row => {
        const participants = safeJson(row.participants, []);
        const payload = safeJson(row.payload, {});
        const questionsCount = Array.isArray(payload.questions) ? payload.questions.length : 0;
        return {
          code: row.code,
          quizId: row.quiz_id,
          subject: row.subject,
          title: row.title,
          status: row.status,
          currentIndex: row.current_index,
          questionsCount,
          participantsCount: participants.length,
          participants: participants,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });

      return Response.json({ ok: true, rooms }, { headers });
    }

    // List saved live reports
    if (action === "reports") {
      const { results } = await env.DB.prepare(
        "SELECT id, room_code, quiz_id, subject, title, payload, finished_at FROM live_reports ORDER BY finished_at DESC LIMIT 50"
      ).all();

      const reports = (results || []).map(r => {
        return safeJson(r.payload, {
          id: r.id,
          roomCode: r.room_code,
          quizId: r.quiz_id,
          subject: r.subject,
          title: r.title,
          finishedAt: r.finished_at
        });
      });
      return Response.json({ ok: true, reports }, { headers });
    }

    // Single room state
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code || !/^[A-Z0-9_-]{2,24}$/.test(code)) {
      return Response.json({ error: "Valid room code required" }, { status: 400, headers });
    }

    const row = await env.DB.prepare(
      "SELECT * FROM live_rooms WHERE code = ?"
    ).bind(code).first();

    if (!row) {
      return Response.json({ error: "Room not found" }, { status: 404, headers });
    }

    const payload = safeJson(row.payload, {});
    const participants = safeJson(row.participants, []);
    const responses = safeJson(row.responses, {});
    const isHostRequest = url.searchParams.get("role") === "host";
    const includeAnswers = isHostRequest || row.status === "finished";
    const questions = Array.isArray(payload.questions)
      ? payload.questions.map(q => includeAnswers
        ? q
        : { id: q.id, text: q.text, options: q.options || [] })
      : [];

    return Response.json({
      ok: true,
      room: {
        code: row.code,
        quizId: row.quiz_id,
        subject: row.subject,
        title: row.title,
        status: row.status, // 'lobby' | 'active' | 'finished'
        currentIndex: row.current_index,
        revealedCurrent: payload.revealedCurrent === true,
        questionsCount: questions.length,
        questions: questions,
        passMark: payload.passMark || 50,
        description: payload.description || "",
        participants: participants,
        responses: responses,
        updatedAt: row.updated_at
      }
    }, { headers });
  }

  // ----------------------------------------------------
  // POST REQUESTS: Room Operations
  // ----------------------------------------------------
  if (request.method === "POST") {
    let body = {};
    try {
      const raw = await request.text();
      if (raw.length > 524288) {
        return Response.json({ error: "Payload too large" }, { status: 413, headers });
      }
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }

    const CODE_RE = /^[A-Z0-9_-]{2,24}$/;
    const SAFE_ID_RE = /^[a-zA-Z0-9_-]{3,48}$/;
    const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const cleanText = (v, max = 120) => String(v || "").replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, max);

    const action = body.action;
    const code = String(body.code || "").trim().toUpperCase();

    if (action !== "create" && action !== "delete_report" && (!code || !CODE_RE.test(code))) {
      return Response.json({ error: "Invalid room code format" }, { status: 400, headers });
    }

    // 1. CREATE LIVE ROOM
    if (action === "create") {
      const quiz = body.quiz || {};
      const newCode = (code && CODE_RE.test(code)) ? code : `AU-${Math.floor(1000 + Math.random() * 9000)}`;
      const now = Date.now();

      await env.DB.prepare(`
        INSERT OR REPLACE INTO live_rooms (code, quiz_id, subject, title, status, current_index, payload, participants, responses, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'lobby', 0, ?, '[]', '{}', ?, ?)
      `).bind(
        newCode,
        cleanText(quiz.id || "live_quiz", 80),
        cleanText(quiz.subject || "General", 80),
        cleanText(quiz.title || "Live Assessment", 160),
        JSON.stringify(quiz),
        now,
        now
      ).run();

      return Response.json({ ok: true, code: newCode, updatedAt: now }, { headers });
    }

    // 7. DELETE / CLOSE ROOM (idempotent — runs before room lookup)
    if (action === "delete") {
      if (code) {
        await env.DB.prepare("DELETE FROM live_rooms WHERE code = ?").bind(code).run();
      }
      return Response.json({ ok: true, deleted: code }, { headers });
    }

    // 8. DELETE SAVED REPORT (does not require room to still exist)
    if (action === "delete_report") {
      const repId = cleanText(body.id || "", 80);
      if (repId) {
        await env.DB.prepare("DELETE FROM live_reports WHERE id = ?").bind(repId).run();
      }
      return Response.json({ ok: true, deleted: repId }, { headers });
    }

    // 3. JOIN ROOM (CAS retry loop to avoid lost joins on simultaneous scans)
    if (action === "join") {
      const studentName = cleanText(body.studentName || "", 80);
      if (studentName.length < 2) {
        return Response.json({ error: "Student name must be at least 2 characters" }, { status: 400, headers });
      }
      const normName = studentName.toLowerCase();

      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
        if (!row) {
          return Response.json({ error: "Room not found" }, { status: 404, headers });
        }
        if (row.status !== "lobby" && row.status !== "active") {
          return Response.json({ error: "Session has already ended" }, { status: 409, headers });
        }

        const participants = safeJson(row.participants, []);
        const prevUpdatedAt = Number(row.updated_at || 0);
        const nextNow = Math.max(Date.now(), prevUpdatedAt + 1);
        const reqPid = body.participantId ? String(body.participantId).trim() : "";
        let participantId = (reqPid && SAFE_ID_RE.test(reqPid) && !RESERVED_KEYS.has(reqPid))
          ? reqPid
          : `p_${nextNow.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

        const existingById = participants.find(p => p.id === participantId);
        const existingByName = !existingById && participants.find(
          p => String(p.name || "").trim().toLowerCase() === normName
        );

        if (existingById) {
          return Response.json({ ok: true, participantId, studentName: existingById.name, code, participants, updatedAt: prevUpdatedAt }, { headers });
        }

        if (existingByName) {
          participantId = existingByName.id;
          existingByName.name = studentName;
          existingByName.joinedAt = nextNow;
          existingByName.active = true;
        } else {
          if (participants.length >= 500) {
            return Response.json({ error: "Room capacity reached" }, { status: 429, headers });
          }
          participants.push({
            id: participantId,
            name: studentName,
            joinedAt: nextNow,
            active: true
          });
        }

        const res = await env.DB.prepare(
          "UPDATE live_rooms SET participants = ?, updated_at = ? WHERE code = ? AND updated_at = ?"
        ).bind(JSON.stringify(participants), nextNow, code, prevUpdatedAt).run();

        if (res && res.meta && res.meta.changes > 0) {
          return Response.json({ ok: true, participantId, studentName, code, participants, updatedAt: nextNow }, { headers });
        }
      }
      return Response.json({ error: "Concurrent update conflict, please retry" }, { status: 409, headers });
    }

    // 3b. LEAVE ROOM (CAS retry loop)
    if (action === "leave") {
      const participantId = String(body.participantId || "").trim();
      if (!participantId || !SAFE_ID_RE.test(participantId) || RESERVED_KEYS.has(participantId)) {
        return Response.json({ ok: true }, { headers });
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
        if (!row) {
          return Response.json({ ok: true, participants: [] }, { headers });
        }
        const participants = safeJson(row.participants, []);
        const updated = participants.filter(p => p.id !== participantId);
        const prevUpdatedAt = Number(row.updated_at || 0);
        const nextNow = Math.max(Date.now(), prevUpdatedAt + 1);

        const res = await env.DB.prepare(
          "UPDATE live_rooms SET participants = ?, updated_at = ? WHERE code = ? AND updated_at = ?"
        ).bind(JSON.stringify(updated), nextNow, code, prevUpdatedAt).run();

        if (res && res.meta && res.meta.changes > 0) {
          return Response.json({ ok: true, participants: updated, updatedAt: nextNow }, { headers });
        }
      }
      return Response.json({ error: "Concurrent update conflict" }, { status: 409, headers });
    }

    // 5. SUBMIT ANSWER FOR CURRENT QUESTION (CAS retry loop + one-time answer lock + bounds validation)
    if (action === "answer") {
      const participantId = String(body.participantId || "").trim();
      const qIdx = Number(body.questionIndex);
      const aIdx = Number(body.answerIndex);
      if (!participantId || !SAFE_ID_RE.test(participantId) || RESERVED_KEYS.has(participantId) || !Number.isInteger(qIdx) || !Number.isInteger(aIdx) || qIdx < 0 || aIdx < 0) {
        return Response.json({ error: "Invalid answer parameters" }, { status: 400, headers });
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
        if (!row) {
          return Response.json({ error: "Room not found" }, { status: 404, headers });
        }
        if (row.status !== "active") {
          return Response.json({ error: "Exam is not currently active" }, { status: 409, headers });
        }

        const participants = safeJson(row.participants, []);
        if (!participants.some(p => p.id === participantId)) {
          return Response.json({ error: "Participant not registered in room" }, { status: 403, headers });
        }

        const payload = safeJson(row.payload, {});
        const questions = Array.isArray(payload.questions) ? payload.questions : [];
        const q = questions[qIdx];
        if (!q || !Array.isArray(q.options) || aIdx >= q.options.length) {
          return Response.json({ error: "Answer option out of bounds" }, { status: 400, headers });
        }

        const responses = safeJson(row.responses, {});
        if (!Object.prototype.hasOwnProperty.call(responses, participantId)) {
          responses[participantId] = {};
        }
        // Enforce one-time submission lock on server
        if (responses[participantId][qIdx] !== undefined) {
          return Response.json({ ok: true, locked: true, questionIndex: qIdx, answerIndex: responses[participantId][qIdx] }, { headers });
        }
        responses[participantId][qIdx] = aIdx;

        const prevUpdatedAt = Number(row.updated_at || 0);
        const nextNow = Math.max(Date.now(), prevUpdatedAt + 1);

        const res = await env.DB.prepare(
          "UPDATE live_rooms SET responses = ?, updated_at = ? WHERE code = ? AND updated_at = ?"
        ).bind(JSON.stringify(responses), nextNow, code, prevUpdatedAt).run();

        if (res && res.meta && res.meta.changes > 0) {
          return Response.json({ ok: true, questionIndex: qIdx, answerIndex: aIdx, updatedAt: nextNow }, { headers });
        }
      }
      return Response.json({ error: "Concurrent update conflict, please retry" }, { status: 409, headers });
    }

    // Load existing room for instructor actions
    const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
    if (!row) {
      return Response.json({ error: "Room not found" }, { status: 404, headers });
    }
    const now = Math.max(Date.now(), Number(row.updated_at || 0) + 1);

    // 2. SWITCH QUIZ / SUBJECT IN ROOM (Before or during session)
    if (action === "switch_quiz") {
      const newQuiz = body.quiz || {};
      await env.DB.prepare(`
        UPDATE live_rooms 
        SET quiz_id = ?, subject = ?, title = ?, payload = ?, current_index = 0, responses = '{}', updated_at = ?
        WHERE code = ?
      `).bind(
        cleanText(newQuiz.id || "live_quiz", 80),
        cleanText(newQuiz.subject || "General", 80),
        cleanText(newQuiz.title || "Live Assessment", 160),
        JSON.stringify(newQuiz),
        now,
        code
      ).run();

      return Response.json({ ok: true, code, quizId: newQuiz.id, updatedAt: now }, { headers });
    }

    // 4. START OR NAVIGATE QUESTIONS (Admin teacher-paced control)
    if (action === "navigate") {
      const payload = safeJson(row.payload, {});
      const qCount = Array.isArray(payload.questions) ? payload.questions.length : 1;
      const rawIdx = Number(body.currentIndex || 0);
      const nextIndex = Number.isFinite(rawIdx) ? Math.max(0, Math.min(Math.max(0, qCount - 1), Math.trunc(rawIdx))) : 0;
      const ALLOWED_STATUS = new Set(["lobby", "active", "finished"]);
      const newStatus = ALLOWED_STATUS.has(body.status) ? body.status : "active";

      await env.DB.prepare(
        "UPDATE live_rooms SET current_index = ?, status = ?, updated_at = ? WHERE code = ?"
      ).bind(nextIndex, newStatus, now, code).run();

      return Response.json({ ok: true, currentIndex: nextIndex, status: newStatus, updatedAt: now }, { headers });
    }

    // 5b. REVEAL CURRENT ANSWER
    if (action === "reveal") {
      const payload = safeJson(row.payload, {});
      payload.revealedCurrent = body.revealed === true;
      await env.DB.prepare(
        "UPDATE live_rooms SET payload = ?, updated_at = ? WHERE code = ?"
      ).bind(JSON.stringify(payload), now, code).run();
      return Response.json({ ok: true, revealed: payload.revealedCurrent, updatedAt: now }, { headers });
    }

    // 6. FINISH & SUBMIT LIVE QUIZ
    if (action === "finish") {
      await env.DB.prepare(
        "UPDATE live_rooms SET status = 'finished', updated_at = ? WHERE code = ?"
      ).bind(now, code).run();

      if (body.report) {
        const report = body.report;
        const repId = report.id || `rep_${code}_${now}`;
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO live_reports (id, room_code, quiz_id, subject, title, payload, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            repId,
            code,
            report.quizId || "",
            report.subject || "",
            report.title || "",
            JSON.stringify(report),
            Number(report.finishedAt || now)
          ).run();
        } catch (e) {
          console.error("Failed to save live report to D1:", e);
        }
      }

      return Response.json({ ok: true, status: "finished", updatedAt: now }, { headers });
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  } catch (err) {
    return Response.json({ ok: false, error: err && err.message ? err.message : "Database error" }, { status: 500, headers });
  }
}
