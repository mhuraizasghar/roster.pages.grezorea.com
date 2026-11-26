import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'eval-dev-session-secret-change-in-production';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function createSessionToken(payload) {
  const sid = crypto.randomUUID();
  const data = {
    sid,
    sub: payload.userId,
    role: payload.role,
    email: payload.email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, sid, exp: data.exp };
}

export function verifySessionToken(token, revokedSids = new Set()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data || !data.sid || !data.sub || !data.exp || Date.now() > data.exp) {
      return null;
    }
    if (revokedSids.has(data.sid)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 999999));
}

export function generateRoomCode() {
  // Unambiguous uppercase alphanumeric 6-char code (e.g. EV-K7M9P2 -> 32^6 = 1B+ combos)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return suffix;
}

export function createOtpEntry(email) {
  return {
    email,
    code: generateOtpCode(),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };
}

export function extractBearerToken(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookieHeader = req.headers?.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)eval_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
