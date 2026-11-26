export async function onRequest(context) {
  const origin = context.request.headers.get('Origin') || '*';
  return Response.json({
    ok: true,
    service: 'roster-pages-api',
  }, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
