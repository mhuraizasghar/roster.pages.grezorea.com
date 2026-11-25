const allowedOrigins = new Set([
  "https://quiz-project.students.pages.grezorea.com",
  "https://quiz-project-students.pages.dev",
  "http://localhost:8000",
  "null"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Cache-Control": "no-store"
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT quiz_id, name, email, score, total, percent, time_taken, submitted_at, attempt_id FROM scores ORDER BY percent DESC, time_taken ASC, submitted_at ASC"
    ).all();

    const scores = {};
    for (const row of results) {
      const quizId = row.quiz_id;
      if (!scores[quizId]) scores[quizId] = [];
      scores[quizId].push({
        attemptId: row.attempt_id,
        email: row.email,
        name: row.name,
        score: row.score,
        total: row.total,
        percent: row.percent,
        timeTaken: row.time_taken,
        submittedAt: row.submitted_at
      });
    }

    for (const quizId of Object.keys(scores)) scores[quizId] = scores[quizId].slice(0, 10);
    return Response.json({ scores }, { headers });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { quizId, score } = body || {};
    if (!quizId || !score || !score.email) {
      return Response.json({ error: "Invalid score" }, { status: 400 });
    }

    await env.DB.prepare(
      "INSERT INTO scores (quiz_id, email, name, score, total, percent, time_taken, submitted_at, attempt_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT (quiz_id, email) DO UPDATE SET name=excluded.name, score=excluded.score, total=excluded.total, percent=excluded.percent, " +
      "time_taken=excluded.time_taken, submitted_at=excluded.submitted_at, attempt_id=excluded.attempt_id " +
      "WHERE excluded.percent > scores.percent OR (excluded.percent = scores.percent AND excluded.time_taken < scores.time_taken)"
    ).bind(
      String(quizId),
      String(score.email).toLowerCase(),
      String(score.name || ""),
      Number(score.score || 0),
      Number(score.total || 0),
      Number(score.percent || 0),
      Number(score.timeTaken || 0),
      Number(score.submittedAt || Date.now()),
      String(score.attemptId || "")
    ).run();

    return Response.json({ ok: true }, { headers });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers });
}
