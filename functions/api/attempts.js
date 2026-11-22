const allowedOrigins = new Set([
  "https://quiz-project.students.pages.grezorea.com",
  "https://quiz-project-students.pages.dev",
  "http://localhost:8000",
  "null"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "null";
  const allowed = allowedOrigins.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
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
      "SELECT payload FROM attempts ORDER BY submitted_at DESC"
    ).all();
    return Response.json({ attempts: results.map(row => JSON.parse(row.payload)) }, { headers });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const attempt = body && body.attempt;
    if (!attempt || !attempt.id || !attempt.quizId || !attempt.email) {
      return Response.json({ error: "Invalid attempt" }, { status: 400 });
    }

    await env.DB.prepare(
      "INSERT OR REPLACE INTO attempts (id, quiz_id, email, name, payload, submitted_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      String(attempt.id),
      String(attempt.quizId),
      String(attempt.email).toLowerCase(),
      String(attempt.name || ""),
      JSON.stringify(attempt),
      Number(attempt.submittedAt || Date.now())
    ).run();

    return Response.json({ ok: true }, { headers });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers });
}
