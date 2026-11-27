const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = new Set([
  'https://roster.pages.grezorea.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function createSessionToken(secret, user) {
  const payload = Buffer.from(JSON.stringify({
    sid: crypto.randomUUID(),
    sub: user.id,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    institutionName: user.institutionName,
    authProvider: user.authProvider,
    avatarUrl: user.avatarUrl,
    emailVerified: true,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function jwtPayload(token) {
  try {
    const encoded = String(token || '').split('.')[1];
    if (!encoded) return null;
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function configuredSupabase(accessToken) {
  const configs = [
    { url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY },
    { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY },
  ].filter((config) => config.url && config.key);
  const claims = jwtPayload(accessToken);
  const issuerOrigin = (() => {
    try { return claims?.iss ? new URL(claims.iss).origin : ''; } catch { return ''; }
  })();
  if (issuerOrigin) {
    const matchingProject = configs.filter((config) => {
      try { return new URL(config.url).origin === issuerOrigin; } catch { return false; }
    });
    const matchingKeys = matchingProject.filter((config) => {
      try {
        const urlRef = new URL(config.url).hostname.split('.')[0];
        const keyRef = jwtPayload(config.key)?.ref;
        return !keyRef || keyRef === urlRef;
      } catch { return false; }
    });
    if (matchingKeys.length) return matchingKeys;
    if (matchingProject.length) {
      console.error('Roster Supabase API key does not match the sign-in project.');
    }
    return null;
  }
  return configs.length ? configs : null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const portalRole = body.portalRole;
  const accessToken = String(body.accessToken || '').trim();
  const institutionName = String(body.institutionName || '').trim().slice(0, 120);

  if (!['teacher', 'student'].includes(portalRole)) return res.status(400).json({ error: 'Invalid portal role.' });
  if (!accessToken) return res.status(400).json({ error: 'Missing Supabase access token.' });

  const selectedConfig = configuredSupabase(accessToken);
  const sessionSecret = process.env.SESSION_SECRET;
  if (!selectedConfig || !sessionSecret || sessionSecret.length < 32) {
    console.error('Roster auth configuration is incomplete:', JSON.stringify({
      supabaseConfig: Boolean(selectedConfig),
      sessionSecret: Boolean(sessionSecret && sessionSecret.length >= 32),
    }));
    return res.status(503).json({ errorCode: 'AUTH_CONFIGURATION', error: 'Sign-in is temporarily unavailable. Please try again later.' });
  }

  try {
    const configs = Array.isArray(selectedConfig) ? selectedConfig : [selectedConfig];
    let supabaseConfig = null;
    let authBody = null;
    let lastAuthResponse = null;
    for (const config of configs) {
      const authResponse = await fetch(`${config.url.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const responseBody = await authResponse.json().catch(() => ({}));
      if (authResponse.ok && responseBody?.id) {
        supabaseConfig = config;
        authBody = responseBody;
        break;
      }
      const authCode = String(responseBody.code || responseBody.error_code || '');
      const authMessage = String(responseBody.msg || responseBody.message || '');
      lastAuthResponse = { status: authResponse.status, code: authCode, message: authMessage };
      if (/invalid api key|api key.*invalid/i.test(authMessage)) {
        continue;
      }
      console.error('Supabase token check failed:', authResponse.status, authCode || authMessage.slice(0, 100));
      return res.status(401).json({ error: 'Google did not return a valid sign-in session. Please try again.' });
    }
    if (!supabaseConfig || !authBody) {
      console.error('Supabase rejected all configured API keys:', lastAuthResponse?.status, lastAuthResponse?.code || lastAuthResponse?.message?.slice(0, 100));
      return res.status(503).json({ errorCode: 'SUPABASE_API_KEY', error: 'Sign-in is temporarily unavailable. Please try again later.' });
    }

    const supabase = createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const authUser = authBody;
    const authProvider = authUser.app_metadata?.provider === 'google' ? 'google' : 'email';
    const email = String(authUser.email || '').trim().toLowerCase();
    const emailVerified = Boolean(authUser.email_confirmed_at || authUser.user_metadata?.email_verified);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Google account has no valid email address.' });
    if (!emailVerified) return res.status(403).json({ error: 'Your account email must be verified.' });

    const [{ data: profile, error: profileLookupError }, { data: rosterEntries, error: rosterLookupError }] = await Promise.all([
      supabase.from('users_profile').select('id,role').eq('auth_uid', authUser.id).maybeSingle(),
      supabase.from('roster_entries').select('id').eq('student_email', email).limit(1),
    ]);
    if (profileLookupError) {
      console.error('Roster profile lookup failed:', profileLookupError.code || profileLookupError.message);
      return res.status(503).json({ error: 'We could not load your account. Please try again or contact support.' });
    }
    if (rosterLookupError) {
      console.error('Student roster lookup failed:', rosterLookupError.code || rosterLookupError.message);
      return res.status(503).json({ error: 'We could not verify your student invitation. Please try again or contact your instructor.' });
    }

    const onRoster = Array.isArray(rosterEntries) && rosterEntries.length > 0;
    if (portalRole === 'student') {
      if (profile?.role === 'teacher') return res.status(403).json({ errorCode: 'WRONG_PORTAL', actualRole: 'teacher', expectedRole: 'student', redirectPath: '/teacher/login', error: 'This account is registered as a teacher. Use the Teacher Portal.' });
      if (!onRoster) return res.status(403).json({ errorCode: 'NOT_ON_ROSTER', error: "Your email hasn't been added by a teacher yet. Ask your teacher to add this address." });
    } else if (profile?.role === 'student' && onRoster) {
      return res.status(403).json({ errorCode: 'WRONG_PORTAL', actualRole: 'student', expectedRole: 'teacher', redirectPath: '/student/login', error: 'This account is registered as a student. Use the Student Portal.' });
    }

    const user = {
      id: `${portalRole === 'teacher' ? 't' : 's'}_${authUser.id.slice(0, 10)}`,
      email,
      role: portalRole,
      displayName: String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0]).trim().slice(0, 80),
      institutionName,
      authProvider,
      avatarUrl: String(authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '').trim().slice(0, 500),
      emailVerified: true,
    };

    const { error: profileWriteError } = await supabase.from('users_profile').upsert({
      auth_uid: authUser.id,
      email,
      role: portalRole,
      display_name: user.displayName,
      institution_name: institutionName,
      auth_provider: authProvider,
      email_verified: true,
    }, { onConflict: 'auth_uid' });
    if (profileWriteError) {
      console.error('Roster profile save failed:', profileWriteError.code || profileWriteError.message);
      return res.status(503).json({ error: 'We could not finish setting up your account. Please try again or contact support.' });
    }

    return res.status(200).json({ ok: true, token: createSessionToken(sessionSecret, user), user });
  } catch (error) {
    console.error('Roster auth exchange failed:', error?.message || 'Unknown error');
    return res.status(503).json({ errorCode: 'SUPABASE_AUTH_UNAVAILABLE', error: 'Sign-in is temporarily unavailable. Please try again later.' });
  }
};
