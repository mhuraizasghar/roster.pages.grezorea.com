const crypto = require('node:crypto');

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({ error: 'Roster session signing is not configured.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return res.status(401).json({ error: 'Authentication required. Please sign in.' });

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return res.status(401).json({ error: 'Session is invalid. Please sign in again.' });

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.sub || !['teacher', 'student'].includes(session.role) || !Number.isFinite(session.exp) || session.exp <= Date.now()) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return res.status(200).json({ user: {
      id: session.sub,
      email: session.email,
      role: session.role,
      displayName: session.displayName,
      institutionName: session.institutionName || '',
      avatarUrl: session.avatarUrl || '',
      authProvider: session.authProvider || 'google',
      emailVerified: Boolean(session.emailVerified),
    } });
  } catch {
    return res.status(401).json({ error: 'Session is invalid. Please sign in again.' });
  }
};
