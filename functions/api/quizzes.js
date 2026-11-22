const allowedOrigins = new Set([
  "https://quiz-project.students.pages.grezorea.com",
  "https://quiz-project-students.pages.dev",
  "http://localhost:8000",
  "null"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
      "SELECT payload FROM quizzes ORDER BY updated_at ASC"
    ).all();
    return Response.json({ quizzes: results.map(row => JSON.parse(row.payload)) }, { headers });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const quizzes = Array.isArray(body && body.quizzes) ? body.quizzes : [];

    await env.DB.prepare("DELETE FROM quizzes").run();
    for (const quiz of quizzes) {
      await env.DB.prepare(
        "INSERT INTO quizzes (id, payload, updated_at) VALUES (?, ?, ?)"
      ).bind(String(quiz.id), JSON.stringify(quiz), Number(quiz.updatedAt || Date.now())).run();
    }

    return Response.json({ ok: true, count: quizzes.length }, { headers });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers });
}
