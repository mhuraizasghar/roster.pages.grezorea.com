export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT payload FROM attempts ORDER BY submitted_at DESC"
    ).all();
    return Response.json({ attempts: results.map(row => JSON.parse(row.payload)) });
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

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
