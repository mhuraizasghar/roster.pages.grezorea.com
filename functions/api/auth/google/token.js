function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(value) {
  const bytes = new TextEncoder().encode(value);
  return base64UrlEncode(bytes);
}

async function signHmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function createSessionToken(env, payload) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error('Roster session signing is not configured.');
  const sid = crypto.randomUUID();
  const data = {
    sid,
    sub: payload.userId,
    role: payload.role,
    email: payload.email,
    authProvider: payload.authProvider || 'google',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = base64UrlFromString(JSON.stringify(data));
  const signature = await signHmac(secret, encoded);
  return `${encoded}.${signature}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    const body = await request.json();
    const portalRole = body.portalRole;
    const accessToken = String(body.accessToken || '').trim();

    if (portalRole !== 'teacher' && portalRole !== 'student') {
      return Response.json({ ok: false, error: 'Invalid portal role.' }, { status: 400, headers });
    }
    if (!accessToken) {
      return Response.json({ ok: false, error: 'Missing Google sign-in token.' }, { status: 400, headers });
    }

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ ok: false, error: 'Supabase authentication is not configured.' }, { status: 503, headers });
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return Response.json({ ok: false, error: 'Roster session signing is not configured.' }, { status: 503, headers });

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userResponse.ok) {
      return Response.json({ ok: false, error: 'Google sign-in session is invalid or expired.' }, { status: 401, headers });
    }

    const googleUser = await userResponse.json();
    const authProvider = googleUser.app_metadata?.provider === 'google' ? 'google' : 'email';
    const email = normalizeEmail(googleUser.email);
    const displayName = String(
      googleUser.user_metadata?.full_name ||
      googleUser.user_metadata?.name ||
      email.split('@')[0]
    ).trim().slice(0, 80);
    const emailVerified = Boolean(
      googleUser.email_confirmed_at || googleUser.user_metadata?.email_verified
    );

    if (!isValidEmail(email)) {
      return Response.json({ ok: false, error: 'Google account has no valid email address.' }, { status: 400, headers });
    }
    if (!emailVerified) {
      return Response.json({ ok: false, error: 'Your account email must be verified.' }, { status: 403, headers });
    }

    if (portalRole === 'student') {
      const rosterResponse = await fetch(
        `${supabaseUrl}/rest/v1/roster_entries?select=student_email&student_email=eq.${encodeURIComponent(email)}`,
        { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` } },
      );
      if (!rosterResponse.ok) return Response.json({ ok: false, error: 'Could not verify the student roster.' }, { status: 403, headers });
      const rosterEntries = await rosterResponse.json();
      if (!Array.isArray(rosterEntries) || rosterEntries.length === 0) {
        return Response.json({ ok: false, errorCode: 'NOT_ON_ROSTER', error: "Your email hasn't been added by a teacher yet. Ask your teacher to add this address." }, { status: 403, headers });
      }
    }

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/users_profile`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        auth_uid: googleUser.id,
        email,
        role: portalRole,
        display_name: displayName,
        institution_name: String(body.institutionName || '').trim().slice(0, 120),
        auth_provider: authProvider,
        email_verified: true,
      }),
    });
    if (!profileResponse.ok) {
      return Response.json({ ok: false, error: 'Could not create the Roster profile.' }, { status: 503, headers });
    }

    const userId = `${portalRole === 'teacher' ? 't' : 's'}_${googleUser.id.slice(0, 10)}`;
    const user = {
      id: userId,
      email,
      role: portalRole,
      displayName,
      institutionName: String(body.institutionName || '').trim().slice(0, 120),
      authProvider,
      emailVerified: true,
    };

    const token = await createSessionToken(env, {
      userId,
      role: portalRole,
      email,
      authProvider,
    });

    return Response.json({ ok: true, token, user }, { headers });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error?.message || 'Could not complete Google sign-in.',
    }, { status: 500, headers });
  }
}
