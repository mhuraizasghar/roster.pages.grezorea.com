function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Cache-Control": "no-store"
  };
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (!env || !env.DB) {
    return Response.json({ ok: false, error: "Database binding unavailable" }, { status: 503, headers });
  }

  try {
    await ensureTable(env);

    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT payload FROM quizzes ORDER BY updated_at ASC"
      ).all();
      const quizzes = (results || []).map(row => {
        try { return JSON.parse(row.payload); } catch (e) { return null; }
      }).filter(Boolean);
      return Response.json({ quizzes }, { headers });
    }

    if (request.method === "POST") {
      const raw = await request.text();
      const body = raw ? JSON.parse(raw) : {};
      const quizzes = Array.isArray(body && body.quizzes) ? body.quizzes : [];

      const stmts = [env.DB.prepare("DELETE FROM quizzes")];
      const seenIds = new Set();
      for (const quiz of quizzes) {
        if (!quiz || !quiz.id) continue;
        const qId = String(quiz.id);
        if (seenIds.has(qId)) continue;
        seenIds.add(qId);
        stmts.push(
          env.DB.prepare("INSERT OR REPLACE INTO quizzes (id, payload, updated_at) VALUES (?, ?, ?)")
            .bind(qId, JSON.stringify(quiz), Number(quiz.updatedAt || Date.now()))
        );
      }
      await env.DB.batch(stmts);

      return Response.json({ ok: true, count: seenIds.size }, { headers });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  } catch (err) {
    return Response.json({ ok: false, error: err && err.message ? err.message : "Database error" }, { status: 500, headers });
  }
}
