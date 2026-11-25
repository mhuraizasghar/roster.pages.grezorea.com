function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Cache-Control": "no-store"
  };
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      submitted_at INTEGER NOT NULL
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
        "SELECT payload FROM attempts ORDER BY submitted_at DESC"
      ).all();
      const attempts = (results || []).map(row => {
        try { return JSON.parse(row.payload); } catch (e) { return null; }
      }).filter(Boolean);
      return Response.json({ attempts }, { headers });
    }

    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 262144) {
        return Response.json({ error: "Payload too large" }, { status: 413, headers });
      }
      const body = raw ? JSON.parse(raw) : {};
      const attempt = body && body.attempt;
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const email = String(attempt && attempt.email || "").trim().toLowerCase();
      if (!attempt || !attempt.id || !attempt.quizId || !EMAIL_RE.test(email)) {
        return Response.json({ error: "Invalid attempt" }, { status: 400, headers });
      }

      await env.DB.prepare(
        "INSERT OR REPLACE INTO attempts (id, quiz_id, email, name, payload, submitted_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(
        String(attempt.id).slice(0, 80),
        String(attempt.quizId).slice(0, 80),
        email,
        String(attempt.name || "").replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 80),
        JSON.stringify(attempt),
        Number(attempt.submittedAt || Date.now())
      ).run();

      return Response.json({ ok: true }, { headers });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  } catch (err) {
    return Response.json({ ok: false, error: err && err.message ? err.message : "Database error" }, { status: 500, headers });
  }
}
