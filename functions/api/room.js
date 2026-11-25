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
    if (!code) {
      return Response.json({ error: "Room code required" }, { status: 400, headers });
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

    return Response.json({
      ok: true,
      room: {
        code: row.code,
        quizId: row.quiz_id,
        subject: row.subject,
        title: row.title,
        status: row.status, // 'lobby' | 'active' | 'finished'
        currentIndex: row.current_index,
        questionsCount: payload.questions ? payload.questions.length : 0,
        questions: payload.questions || [],
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
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }

    const action = body.action;
    const code = String(body.code || "").trim().toUpperCase();

    // 1. CREATE LIVE ROOM
    if (action === "create") {
      const quiz = body.quiz || {};
      const newCode = code || `AU-${Math.floor(1000 + Math.random() * 9000)}`;
      const now = Date.now();

      await env.DB.prepare(`
        INSERT OR REPLACE INTO live_rooms (code, quiz_id, subject, title, status, current_index, payload, participants, responses, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'lobby', 0, ?, '[]', '{}', ?, ?)
      `).bind(
        newCode,
        String(quiz.id || "live_quiz"),
        String(quiz.subject || "General"),
        String(quiz.title || "Live Assessment"),
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
      const repId = String(body.id || "");
      if (repId) {
        await env.DB.prepare("DELETE FROM live_reports WHERE id = ?").bind(repId).run();
      }
      return Response.json({ ok: true, deleted: repId }, { headers });
    }

    // 3. JOIN ROOM (CAS retry loop to avoid lost joins on simultaneous scans)
    if (action === "join") {
      const studentName = String(body.studentName || "").trim();
      if (!studentName) {
        return Response.json({ error: "Student name required" }, { status: 400, headers });
      }
      const normName = studentName.toLowerCase();

      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
        if (!row) {
          return Response.json({ error: "Room not found" }, { status: 404, headers });
        }

        const participants = safeJson(row.participants, []);
        const prevUpdatedAt = Number(row.updated_at || 0);
        const nextNow = Math.max(Date.now(), prevUpdatedAt + 1);
        let participantId = String(body.participantId || `p_${nextNow.toString(36)}_${Math.random().toString(36).slice(2, 6)}`);

        const existingById = participants.find(p => p.id === participantId);
        const existingByName = !existingById && participants.find(
          p => String(p.name || "").trim().toLowerCase() === normName
        );

        if (existingById) {
          return Response.json({ ok: true, participantId, studentName, code, participants, updatedAt: prevUpdatedAt }, { headers });
        }

        if (existingByName) {
          participantId = existingByName.id;
          existingByName.name = studentName;
          existingByName.joinedAt = nextNow;
          existingByName.active = true;
        } else {
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
      const { participantId } = body;
      if (!participantId) {
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

    // 5. SUBMIT ANSWER FOR CURRENT QUESTION (CAS retry loop to avoid lost student answers)
    if (action === "answer") {
      const { participantId, questionIndex, answerIndex } = body;
      if (!participantId || questionIndex === undefined || answerIndex === undefined) {
        return Response.json({ error: "Missing answer parameters" }, { status: 400, headers });
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT * FROM live_rooms WHERE code = ?").bind(code).first();
        if (!row) {
          return Response.json({ error: "Room not found" }, { status: 404, headers });
        }

        const responses = safeJson(row.responses, {});
        if (!responses[participantId]) {
          responses[participantId] = {};
        }
        responses[participantId][questionIndex] = Number(answerIndex);

        const prevUpdatedAt = Number(row.updated_at || 0);
        const nextNow = Math.max(Date.now(), prevUpdatedAt + 1);

        const res = await env.DB.prepare(
          "UPDATE live_rooms SET responses = ?, updated_at = ? WHERE code = ? AND updated_at = ?"
        ).bind(JSON.stringify(responses), nextNow, code, prevUpdatedAt).run();

        if (res && res.meta && res.meta.changes > 0) {
          return Response.json({ ok: true, questionIndex, answerIndex, updatedAt: nextNow }, { headers });
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
        String(newQuiz.id || "live_quiz"),
        String(newQuiz.subject || "General"),
        String(newQuiz.title || "Live Assessment"),
        JSON.stringify(newQuiz),
        now,
        code
      ).run();

      return Response.json({ ok: true, code, quizId: newQuiz.id, updatedAt: now }, { headers });
    }

    // 4. START OR NAVIGATE QUESTIONS (Admin teacher-paced control)
    if (action === "navigate") {
      const nextIndex = Number(body.currentIndex || 0);
      const newStatus = body.status || "active";

      await env.DB.prepare(
        "UPDATE live_rooms SET current_index = ?, status = ?, updated_at = ? WHERE code = ?"
      ).bind(nextIndex, newStatus, now, code).run();

      return Response.json({ ok: true, currentIndex: nextIndex, status: newStatus, updatedAt: now }, { headers });
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
