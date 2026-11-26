function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifySessionToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, suppliedSignature] = token.split('.');
  const secret = env.SESSION_SECRET || 'eval-dev-session-secret-change-in-production';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  const expectedSignature = base64UrlEncode(new Uint8Array(signature));

  if (suppliedSignature !== expectedSignature) return null;

  try {
    const bytes = base64UrlDecode(encoded);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data.sid || !data.sub || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'GET') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers });
  }

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const data = await verifySessionToken(env, token);
  if (!data) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers });
  }

  return Response.json({
    ok: true,
    user: {
      id: data.sub,
      email: data.email,
      role: data.role,
      displayName: data.email.split('@')[0],
      institutionName: '',
      authProvider: 'google',
      emailVerified: true,
    },
  }, { headers });
}
