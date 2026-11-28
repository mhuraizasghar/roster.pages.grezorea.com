import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import {
  createOtpEntry,
  createSessionToken,
  extractBearerToken,
  generateRoomCode,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from './auth.js';
import {
  buildCsvReport,
  gradeQuestion,
  isValidEmail,
  normalizeEmail,
  parseBulkRoster,
  recalculateAttemptScore,
  sanitizeQuestionForStudent,
} from './grading.js';

export function createRosterApp(db, { broadcastRoom = () => {}, mailer = null } = {}) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  const noopMailer = {
    isConfigured: () => false,
    getStatus: () => ({ configured: false, fromEmail: 'noreply@pages.grezorea.com', appUrl: 'https://roster.pages.grezorea.com' }),
    sendTeacherVerification: async () => ({ sent: false, skipped: true }),
    sendStudentOtp: async () => ({ sent: false, skipped: true }),
    sendPasswordReset: async () => ({ sent: false, skipped: true }),
    sendAttemptResult: async () => ({ sent: false, skipped: true }),
    sendAssignmentPublished: async () => ({ sent: false, skipped: true }),
    sendGradeUpdated: async () => ({ sent: false, skipped: true }),
  };
  const activeMailer = mailer || noopMailer;

  const revokedSet = () => new Set(db.state.revokedSids || []);

  function verifyToken(token) {
    return verifySessionToken(token, revokedSet());
  }

  function requireAuth(expectedRole = null) {
    return (req, res, next) => {
      const token = extractBearerToken(req);
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: 'Authentication required. Please sign in.' });
      }
      const user = db.state.users.find((u) => u.id === decoded.sub);
      if (!user) {
        return res.status(401).json({ error: 'Account no longer exists.' });
      }
      if (expectedRole && user.role !== expectedRole) {
        const redirectPath = user.role === 'teacher' ? '/teacher/login' : '/student/login';
        return res.status(403).json({
          errorCode: 'WRONG_PORTAL',
          actualRole: user.role,
          expectedRole,
          redirectPath,
          error: `This account is registered as a ${user.role}. Please use the ${user.role} portal instead.`,
        });
      }
      req.user = user;
      req.sessionSid = decoded.sid;
      next();
    };
  }

  function checkRateLimit(key, maxAttempts = 12, windowMs = 60_000) {
    const now = Date.now();
    const rec = db.state.rateLimits[key];
    if (!rec || now - rec.windowStart > windowMs) {
      db.state.rateLimits[key] = { windowStart: now, attempts: 1 };
      return { allowed: true, remaining: maxAttempts - 1 };
    }
    rec.attempts += 1;
    if (rec.attempts > maxAttempts) {
      return { allowed: false, retryAfterSec: Math.ceil((rec.windowStart + windowMs - now) / 1000) };
    }
    return { allowed: true, remaining: maxAttempts - rec.attempts };
  }

  function publicUser(u) {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      displayName: u.displayName,
      institutionName: u.institutionName || '',
      authProvider: u.authProvider,
      emailVerified: Boolean(u.emailVerified),
    };
  }

  function getRoomQuestions(room) {
    if (room.mode === 'quick_question' && room.quickQuestionPayload) {
      return [room.quickQuestionPayload];
    }
    const qv = db.getVersion(room.quizVersionId);
    return qv ? qv.questions : [];
  }

  function buildRoomViewForUser(room, user) {
    const questions = getRoomQuestions(room);
    const isTeacherOwner = user && user.role === 'teacher' && room.teacherId === user.id;
    const isEnded = room.status === 'ended';

    // Never leak correct answers to students before question reveal or room end
    const visibleQuestions = questions.map((q, idx) => {
      if (isTeacherOwner || isEnded) return q;
      const revealThis = room.revealedCurrent && idx === room.currentQuestionIdx;
      return sanitizeQuestionForStudent(q, revealThis);
    });

    // Build response counts per question (safe aggregate distribution)
    const distributions = {};
    questions.forEach((q, idx) => {
      const counts = {};
      Object.values(room.responses || {}).forEach((pResp) => {
        const ans = pResp[q.id];
        if (ans !== undefined && ans !== null) {
          const key = String(ans.response);
          counts[key] = (counts[key] || 0) + 1;
        }
      });
      distributions[idx] = counts;
    });

    const leaderboard = [...(room.participants || [])]
      .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
      .map((p, idx) => ({
        rank: idx + 1,
        studentId: p.studentId,
        displayName: p.displayName,
        totalScore: p.totalScore || 0,
      }));

    const teacher = db.state.users.find((u) => u.id === room.teacherId);

    const view = {
      id: room.id,
      code: room.code,
      title: room.title,
      teacherName: teacher ? teacher.displayName : 'Instructor',
      mode: room.mode,
      status: room.status,
      currentQuestionIdx: room.currentQuestionIdx,
      revealedCurrent: Boolean(room.revealedCurrent),
      openJoin: Boolean(room.openJoin),
      questionStartedAt: room.questionStartedAt,
      settings: room.settings || {},
      questionsCount: visibleQuestions.length,
      questions: visibleQuestions,
      participantsCount: (room.participants || []).length,
      participants: isTeacherOwner
        ? room.participants
        : (room.participants || []).map((p) => ({
            studentId: p.studentId,
            displayName: p.displayName,
            totalScore: p.totalScore || 0,
          })),
      distributions: isTeacherOwner || room.revealedCurrent || isEnded ? distributions : {},
      leaderboard,
      createdAt: room.createdAt,
      endedAt: room.endedAt,
    };

    if (isTeacherOwner) {
      view.responses = room.responses || {};
    } else if (user) {
      view.myResponses = (room.responses || {})[user.id] || {};
    }

    return view;
  }

  function activateStudentRosterLinks(studentUser) {
    const norm = normalizeEmail(studentUser.email);
    let changed = false;
    for (const entry of db.state.rosterEntries) {
      if (normalizeEmail(entry.studentEmail) === norm) {
        if (entry.status !== 'active' || entry.studentUserId !== studentUser.id) {
          entry.status = 'active';
          entry.studentUserId = studentUser.id;
          entry.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
    }
    if (changed) db.save();
  }

  // Healthcheck & Mailer status
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'eval-api',
      mailerConfigured: activeMailer.isConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/mailer/status', (_req, res) => {
    res.json({ ok: true, mailer: activeMailer.getStatus() });
  });

  // =========================================================================
  // 1. AUTHENTICATION & DUAL PORTAL ENTRY POINTS
  // =========================================================================

  app.post('/api/auth/teacher/signup', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim().slice(0, 80);
    const institutionName = String(req.body?.institutionName || '').trim().slice(0, 120);

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (displayName.length < 2) return res.status(400).json({ error: 'Display name is required (at least 2 characters).' });

    const existing = db.state.users.find((u) => normalizeEmail(u.email) === email);
    if (existing) {
      if (existing.role === 'student') {
        return res.status(409).json({
          errorCode: 'WRONG_PORTAL',
          actualRole: 'student',
          redirectPath: '/student/login',
          error: 'This email is already used by a Student account. Students sign in via the Student Portal; use a separate email for a Teacher account.',
        });
      }
      return res.status(409).json({ error: 'A teacher account with this email already exists.' });
    }

    const user = {
      id: `t_${crypto.randomUUID().slice(0, 10)}`,
      email,
      role: 'teacher',
      displayName,
      institutionName,
      authProvider: 'email',
      emailVerified: false,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.state.users.push(user);

    const verifyTokenValue = crypto.randomBytes(20).toString('hex');
    db.state.verificationTokens[verifyTokenValue] = {
      userId: user.id,
      email,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    db.save();

    const mailRes = await activeMailer.sendTeacherVerification({
      to: email,
      displayName,
      token: verifyTokenValue,
    });

    return res.status(201).json({
      ok: true,
      requiresVerification: true,
      emailSent: Boolean(mailRes.sent),
      message: mailRes.sent
        ? `Account created. Check ${email} for your verification link.`
        : 'Teacher account created. Verify your email before signing in.',
      ...(mailRes.sent ? {} : { devVerificationToken: verifyTokenValue }),
    });
  });

  app.post('/api/auth/teacher/resend-verification', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const user = db.state.users.find((u) => normalizeEmail(u.email) === email && u.role === 'teacher');
    if (!user) {
      return res.json({ ok: true, message: 'If that unverified account exists, a new confirmation email has been sent.' });
    }
    if (user.emailVerified) {
      return res.json({ ok: true, message: 'This email address is already verified. You can sign in.' });
    }
    const verifyTokenValue = crypto.randomBytes(20).toString('hex');
    db.state.verificationTokens[verifyTokenValue] = {
      userId: user.id,
      email,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    db.save();

    const mailRes = await activeMailer.sendTeacherVerification({
      to: email,
      displayName: user.displayName,
      token: verifyTokenValue,
    });
    return res.json({
      ok: true,
      emailSent: Boolean(mailRes.sent),
      message: mailRes.sent ? `Confirmation email re-sent to ${email}.` : 'Verification token refreshed.',
      ...(mailRes.sent ? {} : { devVerificationToken: verifyTokenValue }),
    });
  });

  app.post('/api/auth/teacher/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const record = db.state.verificationTokens[token];
    if (!record || Date.now() > record.expiresAt) {
      return res.status(400).json({ error: 'Verification link is invalid or expired.' });
    }
    const user = db.state.users.find((u) => u.id === record.userId);
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    user.emailVerified = true;
    delete db.state.verificationTokens[token];
    const session = createSessionToken({ userId: user.id, role: user.role, email: user.email });
    db.save();

    return res.json({ ok: true, token: session.token, user: publicUser(user) });
  });

  app.post('/api/auth/teacher/login', (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    const user = db.state.users.find((u) => normalizeEmail(u.email) === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (user.role !== 'teacher') {
      return res.status(403).json({
        errorCode: 'WRONG_PORTAL',
        actualRole: user.role,
        expectedRole: 'teacher',
        redirectPath: '/student/login',
        error: 'This email belongs to a Student account. Please sign in through the Student Portal.',
      });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.emailVerified) {
      return res.status(403).json({
        errorCode: 'EMAIL_NOT_VERIFIED',
        error: 'Please verify your email address before signing in.',
      });
    }

    const session = createSessionToken({ userId: user.id, role: user.role, email: user.email });
    return res.json({ ok: true, token: session.token, user: publicUser(user) });
  });

  app.post('/api/auth/teacher/reset-password/request', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const user = db.state.users.find((u) => normalizeEmail(u.email) === email && u.role === 'teacher');
    if (!user) {
      return res.json({ ok: true, message: 'If that teacher account exists, a recovery link has been sent.' });
    }
    const token = crypto.randomBytes(16).toString('hex');
    db.state.resetTokens[token] = { userId: user.id, expiresAt: Date.now() + 30 * 60 * 1000 };
    db.save();
    const mailRes = await activeMailer.sendPasswordReset({
      to: user.email,
      displayName: user.displayName,
      token,
    });
    return res.json({
      ok: true,
      emailSent: Boolean(mailRes.sent),
      message: mailRes.sent
        ? `Password recovery instructions sent to ${user.email}.`
        : 'Password reset token generated.',
      ...(mailRes.sent ? {} : { devResetToken: token }),
    });
  });

  app.post('/api/auth/teacher/reset-password/confirm', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

    const rec = db.state.resetTokens[token];
    if (!rec || Date.now() > rec.expiresAt) return res.status(400).json({ error: 'Reset token is invalid or expired.' });

    const user = db.state.users.find((u) => u.id === rec.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.passwordHash = hashPassword(newPassword);
    user.emailVerified = true;
    delete db.state.resetTokens[token];
    db.save();
    return res.json({ ok: true, message: 'Password updated. You can now sign in.' });
  });

  // Student OTP Login (No open sign-up!)
  app.post('/api/auth/student/request-otp', async (req, res) => {
    const ip = req.ip || 'local';
    const rl = checkRateLimit(`otp:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return res.status(429).json({ error: `Too many requests. Please try again in ${rl.retryAfterSec}s.` });
    }

    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const existingUser = db.state.users.find((u) => normalizeEmail(u.email) === email);
    if (existingUser && existingUser.role === 'teacher') {
      return res.status(403).json({
        errorCode: 'WRONG_PORTAL',
        actualRole: 'teacher',
        expectedRole: 'student',
        redirectPath: '/teacher/login',
        error: 'This email is registered as a Teacher account. Please sign in on the Teacher Portal instead.',
      });
    }

    const otp = createOtpEntry(email);
    db.state.otps[email] = otp;
    db.save();

    const mailRes = await activeMailer.sendStudentOtp({ to: email, code: otp.code });

    return res.json({
      ok: true,
      emailSent: Boolean(mailRes.sent),
      message: `Verification code sent to ${email}.`,
      ...(mailRes.sent ? {} : { devOtp: otp.code }),
    });
  });

  app.post('/api/auth/student/verify-otp', (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const displayNameInput = String(req.body?.displayName || '').trim().slice(0, 80);

    const otp = db.state.otps[email];
    if (!otp || Date.now() > otp.expiresAt) {
      return res.status(400).json({ error: 'One-time code expired or not requested. Request a new code.' });
    }
    otp.attempts += 1;
    if (otp.attempts > 5) {
      delete db.state.otps[email];
      db.save();
      return res.status(429).json({ error: 'Too many invalid attempts. Please request a new code.' });
    }
    if (otp.code !== code) {
      db.save();
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }

    delete db.state.otps[email];

    const rosterLinks = db.getTeachersForStudentEmail(email);

    let user = db.state.users.find((u) => normalizeEmail(u.email) === email);
    if (user && user.role !== 'student') {
      return res.status(403).json({
        errorCode: 'WRONG_PORTAL',
        actualRole: user.role,
        expectedRole: 'student',
        redirectPath: '/teacher/login',
        error: 'This email belongs to a Teacher account. Please use the Teacher Portal.',
      });
    }

    if (!user) {
      const rosterName = rosterLinks.find((r) => r.displayName)?.displayName || email.split('@')[0];
      user = {
        id: `s_${crypto.randomUUID().slice(0, 10)}`,
        email,
        role: 'student',
        displayName: displayNameInput || rosterName,
        institutionName: '',
        authProvider: 'otp',
        emailVerified: true,
        passwordHash: null,
        createdAt: new Date().toISOString(),
      };
      db.state.users.push(user);
    }

    activateStudentRosterLinks(user);
    const session = createSessionToken({ userId: user.id, role: user.role, email: user.email });
    db.save();

    return res.json({ ok: true, token: session.token, user: publicUser(user) });
  });

  // Google OAuth callback: verify the Supabase access token before creating a Roster session.
  app.post('/api/auth/google/token', async (req, res) => {
    const portalRole = req.body?.portalRole;
    const accessToken = String(req.body?.accessToken || '').trim();
    const institutionName = String(req.body?.institutionName || '').trim().slice(0, 120);

    if (portalRole !== 'teacher' && portalRole !== 'student') {
      return res.status(400).json({ error: 'Invalid portal role.' });
    }
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing Google sign-in token.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({ error: 'Google sign-in is not configured on the server.' });
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data?.user) {
        return res.status(401).json({ error: 'Google sign-in session is invalid or expired.' });
      }

      const email = normalizeEmail(data.user.email);
      const displayName = String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || '').trim().slice(0, 80);
      const emailVerified = Boolean(data.user.email_confirmed_at || data.user.user_metadata?.email_verified);

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Google account has no valid email address.' });
      }
      if (!emailVerified) {
        return res.status(403).json({ error: 'Google account email must be verified before signing in.' });
      }

      let user = db.state.users.find((u) => normalizeEmail(u.email) === email);
      if (user && user.role !== portalRole) {
        const targetPortal = user.role === 'teacher' ? '/teacher/login' : '/student/login';
        return res.status(403).json({
          errorCode: 'WRONG_PORTAL',
          actualRole: user.role,
          expectedRole: portalRole,
          redirectPath: targetPortal,
          error: `This Google email is registered as a ${user.role}. Please sign in via the ${user.role} portal.`,
        });
      }

      if (portalRole === 'student') {
        const rosterLinks = db.getTeachersForStudentEmail(email);
        if (!user) {
          const rosterName = rosterLinks.find((r) => r.displayName)?.displayName || email.split('@')[0];
          user = {
            id: `s_${crypto.randomUUID().slice(0, 10)}`,
            email,
            role: 'student',
            displayName: displayName || rosterName,
            institutionName: '',
            authProvider: 'google',
            emailVerified: true,
            passwordHash: null,
            createdAt: new Date().toISOString(),
          };
          db.state.users.push(user);
        }
        activateStudentRosterLinks(user);
      } else if (!user) {
        user = {
          id: `t_${crypto.randomUUID().slice(0, 10)}`,
          email,
          role: 'teacher',
          displayName: displayName || email.split('@')[0],
          institutionName,
          authProvider: 'google',
          emailVerified: true,
          passwordHash: null,
          createdAt: new Date().toISOString(),
        };
        db.state.users.push(user);
      }

      const session = createSessionToken({ userId: user.id, role: user.role, email: user.email });
      db.save();
      return res.json({ ok: true, token: session.token, user: publicUser(user) });
    } catch {
      return res.status(401).json({ error: 'Could not verify Google sign-in session.' });
    }
  });

  app.get('/api/auth/me', requireAuth(), (req, res) => {
    if (req.user.role === 'student') {
      // Automatically activate any newly added roster links for this student on reload
      activateStudentRosterLinks(req.user);
    }
    res.json({ ok: true, user: publicUser(req.user) });
  });

  app.post('/api/auth/logout', requireAuth(), (req, res) => {
    db.state.revokedSids.push(req.sessionSid);
    db.save();

    res.json({ ok: true });
  });

  // =========================================================================
  // 2. TEACHER ROSTER & GROUPS
  // =========================================================================

  app.get('/api/roster', requireAuth('teacher'), (req, res) => {
    const entries = db.state.rosterEntries
      .filter((r) => r.teacherId === req.user.id)
      .sort((a, b) => a.studentEmail.localeCompare(b.studentEmail));
    const groups = db.state.groups.filter((g) => g.teacherId === req.user.id);
    res.json({ ok: true, entries, groups });
  });

  app.post('/api/groups', requireAuth('teacher'), (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Group name is required.' });
    const exists = db.state.groups.find(
      (g) => g.teacherId === req.user.id && g.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return res.status(409).json({ error: 'Group already exists.' });
    const group = {
      id: `grp_${crypto.randomUUID().slice(0, 8)}`,
      teacherId: req.user.id,
      name,
      description: String(req.body?.description || '').trim().slice(0, 300),
      createdAt: new Date().toISOString(),
    };
    db.state.groups.push(group);
    db.save();
    res.status(201).json({ ok: true, group });
  });

  app.patch('/api/groups/:id', requireAuth('teacher'), (req, res) => {
    const group = db.state.groups.find((g) => g.id === req.params.id && g.teacherId === req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Group name is required.' });
    const duplicate = db.state.groups.find(
      (g) => g.id !== req.params.id && g.teacherId === req.user.id && g.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return res.status(409).json({ error: 'Group already exists.' });

    group.name = name;
    if (req.body?.description !== undefined) group.description = String(req.body.description || '').trim().slice(0, 300);
    group.updatedAt = new Date().toISOString();
    db.save();
    res.json({ ok: true, group });
  });

  app.delete('/api/groups/:id', requireAuth('teacher'), (req, res) => {
    const idx = db.state.groups.findIndex((g) => g.id === req.params.id && g.teacherId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Group not found.' });
    db.state.groups.splice(idx, 1);
    db.state.rosterEntries.forEach((r) => {
      if (r.teacherId === req.user.id && r.groupId === req.params.id) r.groupId = null;
    });
    db.save();

    res.json({ ok: true });
  });

  app.post('/api/roster', requireAuth('teacher'), (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const displayName = String(req.body?.displayName || '').trim().slice(0, 80);
    const groupId = req.body?.groupId || null;

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid student email address.' });

    const duplicate = db.state.rosterEntries.find(
      (r) => r.teacherId === req.user.id && normalizeEmail(r.studentEmail) === email
    );
    if (duplicate) return res.status(409).json({ error: `${email} is already on your roster.` });

    const existingStudent = db.state.users.find((u) => normalizeEmail(u.email) === email && u.role === 'student');
    const now = new Date().toISOString();
    const entry = {
      id: `ros_${crypto.randomUUID().slice(0, 10)}`,
      teacherId: req.user.id,
      studentEmail: email,
      displayName: displayName || (existingStudent ? existingStudent.displayName : ''),
      groupId: groupId && db.state.groups.some((g) => g.id === groupId && g.teacherId === req.user.id) ? groupId : null,
      status: existingStudent ? 'active' : 'pending',
      studentUserId: existingStudent ? existingStudent.id : null,
      createdAt: now,
      updatedAt: now,
    };
    db.state.rosterEntries.push(entry);
    db.save();
    res.status(201).json({ ok: true, entry });
  });

  app.post('/api/roster/bulk', requireAuth('teacher'), (req, res) => {
    const rawText = String(req.body?.text || '');
    const defaultGroupId = req.body?.groupId || null;
    const existingSet = new Set(
      db.state.rosterEntries
        .filter((r) => r.teacherId === req.user.id)
        .map((r) => normalizeEmail(r.studentEmail))
    );

    const { validEntries, duplicates, invalid } = parseBulkRoster(rawText, existingSet);
    const added = [];
    const now = new Date().toISOString();

    for (const item of validEntries) {
      let resolvedGroupId = defaultGroupId;
      if (item.groupName) {
        let grp = db.state.groups.find(
          (g) => g.teacherId === req.user.id && g.name.toLowerCase() === item.groupName.toLowerCase()
        );
        if (!grp) {
          grp = {
            id: `grp_${crypto.randomUUID().slice(0, 8)}`,
            teacherId: req.user.id,
            name: item.groupName,
            createdAt: now,
          };
          db.state.groups.push(grp);
        }
        resolvedGroupId = grp.id;
      }

      const existingStudent = db.state.users.find(
        (u) => normalizeEmail(u.email) === item.email && u.role === 'student'
      );
      const entry = {
        id: `ros_${crypto.randomUUID().slice(0, 10)}`,
        teacherId: req.user.id,
        studentEmail: item.email,
        displayName: item.displayName || (existingStudent ? existingStudent.displayName : ''),
        groupId: resolvedGroupId,
        status: existingStudent ? 'active' : 'pending',
        studentUserId: existingStudent ? existingStudent.id : null,
        createdAt: now,
        updatedAt: now,
      };
      db.state.rosterEntries.push(entry);
      added.push(entry);
    }

    db.save();
    res.status(201).json({
      ok: true,
      importedCount: added.length,
      duplicateCount: duplicates.length,
      invalidCount: invalid.length,
      added,
      duplicates,
      invalid,
    });
  });

  app.patch('/api/roster/:id', requireAuth('teacher'), (req, res) => {
    const entry = db.state.rosterEntries.find((r) => r.id === req.params.id && r.teacherId === req.user.id);
    if (!entry) return res.status(404).json({ error: 'Roster entry not found.' });
    if (req.body?.displayName !== undefined) {
      entry.displayName = String(req.body.displayName).trim().slice(0, 80);
    }
    if (req.body?.studentEmail !== undefined) {
      const newEmail = normalizeEmail(req.body.studentEmail);
      if (!isValidEmail(newEmail)) return res.status(400).json({ error: 'Valid email address required.' });
      const duplicate = db.state.rosterEntries.find(
        (r) => r.id !== entry.id && r.teacherId === req.user.id && normalizeEmail(r.studentEmail) === newEmail
      );
      if (duplicate) return res.status(409).json({ error: 'That email is already on your roster.' });
      entry.studentEmail = newEmail;
    }
    if (req.body?.groupId !== undefined) {
      entry.groupId = req.body.groupId || null;
    }
    entry.updatedAt = new Date().toISOString();
    db.save();

    res.json({ ok: true, entry });
  });

  app.delete('/api/roster/:id', requireAuth('teacher'), (req, res) => {
    const idx = db.state.rosterEntries.findIndex((r) => r.id === req.params.id && r.teacherId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Roster entry not found.' });
    // Remove roster access only; historical attempts & scores stay intact
    db.state.rosterEntries.splice(idx, 1);
    db.save();

    res.json({ ok: true });
  });

  // =========================================================================
  // 3. TEACHER QUIZ LIBRARY (Subjects, Nested Folders, Soft Delete & Trash)
  // =========================================================================

  app.get('/api/library', requireAuth('teacher'), (req, res) => {
    const myFolders = db.state.folders.filter((f) => f.ownerId === req.user.id);
    const myQuizzes = db.state.quizzes.filter((q) => q.ownerId === req.user.id);
    res.json({
      ok: true,
      folders: myFolders.filter((f) => !f.deletedAt),
      quizzes: myQuizzes.filter((q) => !q.deletedAt),
      trashFolders: myFolders.filter((f) => Boolean(f.deletedAt)),
      trashQuizzes: myQuizzes.filter((q) => Boolean(q.deletedAt)),
    });
  });

  app.post('/api/library/folders', requireAuth('teacher'), (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const parentId = req.body?.parentId || null;
    const isSubject = Boolean(req.body?.isSubject) && !parentId;
    if (!name) return res.status(400).json({ error: 'Folder name is required.' });
    if (parentId) {
      const parent = db.state.folders.find((f) => f.id === parentId && f.ownerId === req.user.id && !f.deletedAt);
      if (!parent) return res.status(404).json({ error: 'Parent folder not found.' });
    }
    const now = new Date().toISOString();
    const folder = {
      id: `fld_${crypto.randomUUID().slice(0, 8)}`,
      ownerId: req.user.id,
      parentId,
      name,
      isSubject,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.state.folders.push(folder);
    db.save();
    res.status(201).json({ ok: true, folder });
  });

  app.patch('/api/library/folders/:id', requireAuth('teacher'), (req, res) => {
    const folder = db.state.folders.find((f) => f.id === req.params.id && f.ownerId === req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    if (req.body?.name !== undefined) {
      const clean = String(req.body.name).trim().slice(0, 80);
      if (!clean) return res.status(400).json({ error: 'Folder name cannot be empty.' });
      folder.name = clean;
    }
    if (req.body?.parentId !== undefined) {
      if (req.body.parentId === folder.id) return res.status(400).json({ error: 'Cannot move a folder into itself.' });
      folder.parentId = req.body.parentId || null;
    }
    folder.updatedAt = new Date().toISOString();
    db.save();

    res.json({ ok: true, folder });
  });

  app.delete('/api/library/folders/:id', requireAuth('teacher'), (req, res) => {
    const folder = db.state.folders.find((f) => f.id === req.params.id && f.ownerId === req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    const now = new Date().toISOString();

    if (req.query.permanent === 'true') {
      const removeIds = new Set([folder.id]);
      let added = true;
      while (added) {
        added = false;
        for (const f of db.state.folders) {
          if (f.ownerId === req.user.id && removeIds.has(f.parentId) && !removeIds.has(f.id)) {
            removeIds.add(f.id);
            added = true;
          }
        }
      }
      db.state.folders = db.state.folders.filter((f) => !removeIds.has(f.id));
      db.state.quizzes = db.state.quizzes.filter((q) => !(q.ownerId === req.user.id && removeIds.has(q.folderId)));
      db.save();
      return res.json({ ok: true });
    }

    folder.deletedAt = now;
    db.state.quizzes.forEach((q) => {
      if (q.ownerId === req.user.id && q.folderId === folder.id && !q.deletedAt) q.deletedAt = now;
    });
    db.save();

    res.json({ ok: true, folder });
  });

  app.post('/api/library/folders/:id/restore', requireAuth('teacher'), (req, res) => {
    const folder = db.state.folders.find((f) => f.id === req.params.id && f.ownerId === req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    folder.deletedAt = null;
    folder.updatedAt = new Date().toISOString();
    db.state.quizzes.forEach((q) => {
      if (q.ownerId === req.user.id && q.folderId === folder.id) q.deletedAt = null;
    });
    db.save();

    res.json({ ok: true, folder });
  });

  app.post('/api/library/quizzes', requireAuth('teacher'), (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: 'Quiz title is required.' });
    const now = new Date().toISOString();
    const quiz = {
      id: `quiz_${crypto.randomUUID().slice(0, 10)}`,
      ownerId: req.user.id,
      folderId: req.body?.folderId || null,
      title,
      subject: String(req.body?.subject || 'General').trim().slice(0, 80),
      description: String(req.body?.description || '').trim().slice(0, 400),
      currentVersionId: null,
      draftQuestions: Array.isArray(req.body?.draftQuestions)
        ? req.body.draftQuestions.map((q, idx) => ({ ...q, id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`, position: idx }))
        : [],
      settings: req.body?.settings || { passMark: 50, shuffleOptions: false },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.state.quizzes.push(quiz);
    db.save();
    res.status(201).json({ ok: true, quiz });
  });

  app.patch('/api/library/quizzes/:id', requireAuth('teacher'), (req, res) => {
    const quiz = db.state.quizzes.find((q) => q.id === req.params.id && q.ownerId === req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    if (req.body?.title !== undefined) {
      const t = String(req.body.title).trim().slice(0, 120);
      if (!t) return res.status(400).json({ error: 'Quiz title cannot be empty.' });
      quiz.title = t;
    }
    if (req.body?.subject !== undefined) quiz.subject = String(req.body.subject).trim().slice(0, 80);
    if (req.body?.description !== undefined) quiz.description = String(req.body.description).trim().slice(0, 400);
    if (req.body?.folderId !== undefined) quiz.folderId = req.body.folderId || null;
    if (req.body?.settings !== undefined) quiz.settings = { ...quiz.settings, ...req.body.settings };
    if (Array.isArray(req.body?.draftQuestions)) {
      quiz.draftQuestions = req.body.draftQuestions.map((q, idx) => ({
        ...q,
        id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`,
        position: idx,
        points: Math.max(1, Number(q.points || 1)),
        timeLimitSec: Math.max(5, Number(q.timeLimitSec || 20)),
      }));
    }
    quiz.updatedAt = new Date().toISOString();
    db.save();

    res.json({ ok: true, quiz });
  });

  app.post('/api/library/quizzes/:id/duplicate', requireAuth('teacher'), (req, res) => {
    const orig = db.state.quizzes.find((q) => q.id === req.params.id && q.ownerId === req.user.id);
    if (!orig) return res.status(404).json({ error: 'Quiz not found.' });
    const now = new Date().toISOString();
    const copy = {
      ...JSON.parse(JSON.stringify(orig)),
      id: `quiz_${crypto.randomUUID().slice(0, 10)}`,
      title: `${orig.title} (Copy)`,
      currentVersionId: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    copy.draftQuestions = copy.draftQuestions.map((q, idx) => ({
      ...q,
      id: `q_${crypto.randomUUID().slice(0, 8)}`,
      position: idx,
    }));
    db.state.quizzes.push(copy);
    db.save();
    res.status(201).json({ ok: true, quiz: copy });
  });

  app.delete('/api/library/quizzes/:id', requireAuth('teacher'), (req, res) => {
    const idx = db.state.quizzes.findIndex((q) => q.id === req.params.id && q.ownerId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Quiz not found.' });
    if (req.query.permanent === 'true') {
      db.state.quizzes.splice(idx, 1);
      db.save();
      return res.json({ ok: true });
    }
    db.state.quizzes[idx].deletedAt = new Date().toISOString();
    db.save();

    res.json({ ok: true, quiz: db.state.quizzes[idx] });
  });

  app.post('/api/library/quizzes/:id/restore', requireAuth('teacher'), (req, res) => {
    const quiz = db.state.quizzes.find((q) => q.id === req.params.id && q.ownerId === req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    quiz.deletedAt = null;
    quiz.updatedAt = new Date().toISOString();
    db.save();

    res.json({ ok: true, quiz });
  });

  // =========================================================================
  // 4. ASSIGNMENTS (Immutable Snapshot) & STUDENT ATTEMPTS
  // =========================================================================

  app.get('/api/assignments', requireAuth('teacher'), (req, res) => {
    const myAssignments = db.state.assignments
      .filter((a) => a.teacherId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const myRoster = db.state.rosterEntries.filter((r) => r.teacherId === req.user.id);

    const enriched = myAssignments.map((asg) => {
      const version = db.getVersion(asg.quizVersionId);
      const targets = myRoster.filter((r) => db.isStudentTargetedByAssignment(asg, r.studentEmail));
      const studentStatuses = targets.map((r) => {
        const studentAttempts = db.state.attempts.filter(
          (att) => att.assignmentId === asg.id && normalizeEmail(att.studentEmail) === normalizeEmail(r.studentEmail)
        );
        const override = db.state.assignmentOverrides.find(
          (ov) => ov.assignmentId === asg.id && normalizeEmail(ov.studentEmail) === normalizeEmail(r.studentEmail)
        );
        let status = 'not_started';
        if (studentAttempts.some((a) => a.status === 'submitted')) status = 'submitted';
        else if (studentAttempts.some((a) => a.status === 'late')) status = 'late';
        else if (studentAttempts.some((a) => a.status === 'in_progress')) status = 'in_progress';

        const bestScore = studentAttempts.length
          ? Math.max(...studentAttempts.map((a) => a.percent || 0))
          : null;

        return {
          studentEmail: r.studentEmail,
          displayName: r.displayName || r.studentEmail,
          status,
          attemptsCount: studentAttempts.length,
          bestPercent: bestScore,
          override: override || null,
        };
      });

      return {
        ...asg,
        quizTitle: version ? version.title : asg.title,
        subject: version ? version.subject : 'General',
        questionsCount: version ? version.questions.length : 0,
        studentStatuses,
      };
    });

    res.json({ ok: true, assignments: enriched });
  });

  app.post('/api/assignments', requireAuth('teacher'), (req, res) => {
    const quiz = db.state.quizzes.find((q) => q.id === req.body?.quizId && q.ownerId === req.user.id && !q.deletedAt);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    if (!quiz.draftQuestions || quiz.draftQuestions.length === 0) {
      return res.status(400).json({ error: 'Add at least one question before assigning this quiz.' });
    }

    // Create immutable snapshot so future library edits never affect this assignment
    const snapshot = db.createSnapshot(quiz, req.user.id);

    const targetType = ['students', 'groups', 'all_roster'].includes(req.body?.targetType)
      ? req.body.targetType
      : 'all_roster';
    const targetEmails = Array.isArray(req.body?.targetEmails) ? req.body.targetEmails.map(normalizeEmail) : [];
    const targetGroupIds = Array.isArray(req.body?.targetGroupIds) ? req.body.targetGroupIds : [];

    const asg = {
      id: `asg_${crypto.randomUUID().slice(0, 10)}`,
      teacherId: req.user.id,
      quizVersionId: snapshot.id,
      title: String(req.body?.title || quiz.title).trim().slice(0, 120),
      targetType,
      targetEmails,
      targetGroupIds,
      dueAt: req.body?.dueAt || null,
      settings: {
        timeLimitMin: Math.max(0, Number(req.body?.settings?.timeLimitMin || 0)),
        maxAttempts: Math.max(0, Number(req.body?.settings?.maxAttempts ?? 1)),
        showAnswersAfterSubmit: req.body?.settings?.showAnswersAfterSubmit !== false,
        shuffleQuestions: Boolean(req.body?.settings?.shuffleQuestions),
        allowSaveProgress: req.body?.settings?.allowSaveProgress !== false,
      },
      createdAt: new Date().toISOString(),
    };

    db.state.assignments.push(asg);
    db.save();

    if (activeMailer.isConfigured()) {
      const targets = db.state.rosterEntries.filter(
        (r) => r.teacherId === req.user.id && db.isStudentTargetedByAssignment(asg, r.studentEmail)
      );
      Promise.allSettled(
        targets.map((entry) =>
          activeMailer.sendAssignmentPublished({
            to: entry.studentEmail,
            studentName: entry.displayName,
            teacherName: req.user.displayName,
            title: asg.title,
            subject: snapshot.subject || 'General',
            dueAt: asg.dueAt,
            assignmentId: asg.id,
          })
        )
      ).catch(() => {});
    }

    res.status(201).json({ ok: true, assignment: asg, snapshot });
  });

  app.post('/api/assignments/:id/override', requireAuth('teacher'), (req, res) => {
    const asg = db.state.assignments.find((a) => a.id === req.params.id && a.teacherId === req.user.id);
    if (!asg) return res.status(404).json({ error: 'Assignment not found.' });

    const studentEmail = normalizeEmail(req.body?.studentEmail);
    if (!isValidEmail(studentEmail)) return res.status(400).json({ error: 'Valid student email required.' });

    let ov = db.state.assignmentOverrides.find(
      (o) => o.assignmentId === asg.id && normalizeEmail(o.studentEmail) === studentEmail
    );
    if (!ov) {
      ov = {
        assignmentId: asg.id,
        studentEmail,
        extendedDueAt: null,
        extraAttempts: 0,
        reopened: false,
      };
      db.state.assignmentOverrides.push(ov);
    }
    if (req.body?.extendedDueAt !== undefined) ov.extendedDueAt = req.body.extendedDueAt || null;
    if (req.body?.extraAttempts !== undefined) ov.extraAttempts = Math.max(0, Number(req.body.extraAttempts || 0));
    if (req.body?.reopened !== undefined) ov.reopened = Boolean(req.body.reopened);

    db.save();

    res.json({ ok: true, override: ov });
  });

  // Student Dashboard (only content from teachers whose roster currently includes this student)
  app.get('/api/student/dashboard', requireAuth('student'), (req, res) => {
    const email = normalizeEmail(req.user.email);
    activateStudentRosterLinks(req.user);

    const rosterLinks = db.getTeachersForStudentEmail(email);
    const teacherIds = new Set(rosterLinks.map((r) => r.teacherId));

    // Active live rooms from rostered teachers (or openJoin rooms)
    const liveRooms = db.state.rooms
      .filter((r) => r.status !== 'ended' && teacherIds.has(r.teacherId))
      .map((r) => {
        const teacher = db.state.users.find((u) => u.id === r.teacherId);
        return {
          id: r.id,
          code: r.code,
          title: r.title,
          mode: r.mode,
          status: r.status,
          teacherName: teacher ? teacher.displayName : 'Instructor',
          participantsCount: (r.participants || []).length,
        };
      });

    // Assignments where student is currently on roster and targeted
    const assignments = db.state.assignments
      .filter((asg) => teacherIds.has(asg.teacherId) && db.isStudentTargetedByAssignment(asg, email))
      .map((asg) => {
        const version = db.getVersion(asg.quizVersionId);
        const teacher = db.state.users.find((u) => u.id === asg.teacherId);
        const myAttempts = db.state.attempts.filter(
          (att) => att.assignmentId === asg.id && normalizeEmail(att.studentEmail) === email
        );
        const ov = db.state.assignmentOverrides.find(
          (o) => o.assignmentId === asg.id && normalizeEmail(o.studentEmail) === email
        );
        const effectiveDue = ov?.extendedDueAt || asg.dueAt;
        const maxAllowed = (asg.settings?.maxAttempts || 0) > 0
          ? asg.settings.maxAttempts + (ov?.extraAttempts || 0)
          : 0;
        const inProgress = myAttempts.find((a) => a.status === 'in_progress');
        const completed = myAttempts.filter((a) => a.status !== 'in_progress');

        let status = 'not_started';
        if (inProgress) status = 'in_progress';
        else if (completed.some((a) => a.status === 'submitted')) status = 'submitted';
        else if (completed.some((a) => a.status === 'late')) status = 'late';
        else if (effectiveDue && Date.now() > new Date(effectiveDue).getTime()) status = 'past_due';

        return {
          id: asg.id,
          title: asg.title,
          subject: version ? version.subject : 'General',
          teacherName: teacher ? teacher.displayName : 'Instructor',
          questionsCount: version ? version.questions.length : 0,
          dueAt: effectiveDue,
          settings: asg.settings,
          maxAllowedAttempts: maxAllowed,
          attemptsUsed: completed.length,
          hasInProgress: Boolean(inProgress),
          inProgressAttemptId: inProgress ? inProgress.id : null,
          status,
          canStart: Boolean(inProgress) || maxAllowed === 0 || completed.length < maxAllowed || Boolean(ov?.reopened),
        };
      });

    // Past results belonging to this student
    const results = db.state.attempts
      .filter((att) => att.studentId === req.user.id && att.status !== 'in_progress')
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .map((att) => {
        const version = db.getVersion(att.quizVersionId);
        const teacher = db.state.users.find((u) => u.id === att.teacherId);
        const room = att.roomId ? db.state.rooms.find((r) => r.id === att.roomId) : null;
        return {
          id: att.id,
          title: version ? version.title : (room ? room.title : 'Assessment'),
          subject: version ? version.subject : 'General',
          teacherName: teacher ? teacher.displayName : 'Instructor',
          source: att.roomId ? 'Live Room' : 'Assignment',
          status: att.status,
          score: att.score,
          maxScore: att.maxScore,
          percent: att.percent,
          submittedAt: att.submittedAt,
        };
      });

    res.json({ ok: true, liveRooms, assignments, results });
  });

  app.post('/api/attempts/start', requireAuth('student'), (req, res) => {
    const email = normalizeEmail(req.user.email);
    const asg = db.state.assignments.find((a) => a.id === req.body?.assignmentId);
    if (!asg) return res.status(404).json({ error: 'Assignment not found.' });

    if (!db.isStudentTargetedByAssignment(asg, email)) {
      return res.status(403).json({
        error: 'You are not enrolled on this teacher\'s roster for this assignment.',
      });
    }

    const version = db.getVersion(asg.quizVersionId);
    if (!version) return res.status(404).json({ error: 'Quiz version snapshot missing.' });

    const myAttempts = db.state.attempts.filter(
      (a) => a.assignmentId === asg.id && normalizeEmail(a.studentEmail) === email
    );

    // Resume existing in_progress attempt across devices/dropped connections
    let attempt = myAttempts.find((a) => a.status === 'in_progress');
    if (!attempt) {
      const ov = db.state.assignmentOverrides.find(
        (o) => o.assignmentId === asg.id && normalizeEmail(o.studentEmail) === email
      );
      const completedCount = myAttempts.filter((a) => a.status !== 'in_progress').length;
      const maxAllowed = (asg.settings?.maxAttempts || 0) > 0
        ? asg.settings.maxAttempts + (ov?.extraAttempts || 0)
        : 0;
      if (maxAllowed > 0 && completedCount >= maxAllowed && !ov?.reopened) {
        return res.status(403).json({ error: 'You have reached the maximum allowed attempts for this assignment.' });
      }
      if (ov?.reopened) {
        ov.reopened = false;
      }

      let order = version.questions.map((q) => q.id);
      if (asg.settings?.shuffleQuestions) {
        order = [...order].sort(() => Math.random() - 0.5);
      }

      attempt = {
        id: `att_${crypto.randomUUID().slice(0, 10)}`,
        studentId: req.user.id,
        studentEmail: email,
        teacherId: asg.teacherId,
        quizVersionId: version.id,
        assignmentId: asg.id,
        roomId: null,
        status: 'in_progress',
        questionOrder: order,
        startedAt: new Date().toISOString(),
        submittedAt: null,
        score: 0,
        maxScore: version.questions.reduce((s, q) => s + Math.max(1, Number(q.points || 1)), 0),
        percent: 0,
        answers: [],
      };
      db.state.attempts.push(attempt);
      db.save();
    }

    const qById = new Map(version.questions.map((q) => [q.id, q]));
    const orderedQuestions = attempt.questionOrder
      .map((id) => qById.get(id))
      .filter(Boolean)
      .map((q) => sanitizeQuestionForStudent(q, false));

    const ov = db.state.assignmentOverrides.find(
      (o) => o.assignmentId === asg.id && normalizeEmail(o.studentEmail) === email
    );

    res.json({
      ok: true,
      attempt: {
        id: attempt.id,
        assignmentId: asg.id,
        title: asg.title,
        subject: version.subject,
        startedAt: attempt.startedAt,
        dueAt: ov?.extendedDueAt || asg.dueAt,
        timeLimitMin: asg.settings?.timeLimitMin || 0,
        allowSaveProgress: asg.settings?.allowSaveProgress !== false,
        answers: attempt.answers.map((a) => ({ questionId: a.questionId, response: a.response })),
      },
      questions: orderedQuestions,
    });
  });

  app.put('/api/attempts/:id/answer', requireAuth('student'), (req, res) => {
    const attempt = db.state.attempts.find((a) => a.id === req.params.id && a.studentId === req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ error: 'This attempt has already been submitted.' });
    }
    if (!db.isEmailOnTeacherRoster(attempt.teacherId, req.user.email)) {
      return res.status(403).json({
        error: 'Access revoked: you were removed from this teacher\'s roster.',
      });
    }

    const questionId = String(req.body?.questionId || '');
    const response = req.body?.response;
    const now = new Date().toISOString();

    const existing = attempt.answers.find((a) => a.questionId === questionId);
    if (existing) {
      existing.response = response;
      existing.answeredAt = now;
    } else {
      attempt.answers.push({
        id: `ans_${crypto.randomUUID().slice(0, 8)}`,
        questionId,
        response,
        isCorrect: null,
        awardedPoints: 0,
        gradedBy: 'auto',
        answeredAt: now,
      });
    }
    db.save();

    res.json({ ok: true, savedAt: now });
  });

  app.post('/api/attempts/:id/submit', requireAuth('student'), (req, res) => {
    const attempt = db.state.attempts.find((a) => a.id === req.params.id && a.studentId === req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (attempt.status !== 'in_progress') {
      return res.json({ ok: true, attemptId: attempt.id, status: attempt.status });
    }
    if (!db.isEmailOnTeacherRoster(attempt.teacherId, req.user.email)) {
      return res.status(403).json({
        error: 'Access revoked: you were removed from this teacher\'s roster.',
      });
    }

    // Accept final answers map if submitted together
    if (req.body?.answers && typeof req.body.answers === 'object') {
      const now = new Date().toISOString();
      for (const [qId, resp] of Object.entries(req.body.answers)) {
        const existing = attempt.answers.find((a) => a.questionId === qId);
        if (existing) {
          existing.response = resp;
          existing.answeredAt = now;
        } else {
          attempt.answers.push({
            id: `ans_${crypto.randomUUID().slice(0, 8)}`,
            questionId: qId,
            response: resp,
            isCorrect: null,
            awardedPoints: 0,
            gradedBy: 'auto',
            answeredAt: now,
          });
        }
      }
    }

    const version = db.getVersion(attempt.quizVersionId);
    const asg = db.state.assignments.find((a) => a.id === attempt.assignmentId);
    const ov = asg
      ? db.state.assignmentOverrides.find(
          (o) => o.assignmentId === asg.id && normalizeEmail(o.studentEmail) === normalizeEmail(req.user.email)
        )
      : null;

    const qById = new Map((version?.questions || []).map((q) => [q.id, q]));

    // Ensure every question has an answer row for grading & review
    for (const qId of attempt.questionOrder) {
      if (!attempt.answers.some((a) => a.questionId === qId)) {
        attempt.answers.push({
          id: `ans_${crypto.randomUUID().slice(0, 8)}`,
          questionId: qId,
          response: null,
          isCorrect: false,
          awardedPoints: 0,
          gradedBy: 'auto',
          answeredAt: new Date().toISOString(),
        });
      }
    }

    for (const ans of attempt.answers) {
      const q = qById.get(ans.questionId);
      if (!q) continue;
      const graded = gradeQuestion(q, ans.response);
      ans.isCorrect = graded.isCorrect;
      ans.awardedPoints = graded.awardedPoints;
      ans.gradedBy = 'auto';
    }

    const totals = recalculateAttemptScore(version?.questions || [], attempt.answers);
    attempt.score = totals.score;
    attempt.maxScore = totals.maxScore;
    attempt.percent = totals.percent;
    attempt.submittedAt = new Date().toISOString();

    const effectiveDue = ov?.extendedDueAt || asg?.dueAt;
    const isLate = effectiveDue && new Date(attempt.submittedAt).getTime() > new Date(effectiveDue).getTime();
    attempt.status = isLate ? 'late' : 'submitted';

    db.save();

    if (activeMailer.isConfigured()) {
      activeMailer
        .sendAttemptResult({
          to: req.user.email,
          studentName: req.user.displayName,
          title: version?.title || asg?.title || 'Assessment',
          sourceLabel: 'Assignment',
          score: attempt.score,
          maxScore: attempt.maxScore,
          percent: attempt.percent,
          attemptId: attempt.id,
          showAnswers: !asg || asg.settings?.showAnswersAfterSubmit !== false,
        })
        .catch(() => {});
    }

    res.json({
      ok: true,
      attemptId: attempt.id,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
    });
  });

  app.get('/api/attempts/:id/review', requireAuth(), (req, res) => {
    const attempt = db.state.attempts.find((a) => a.id === req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

    const isOwnerStudent = req.user.role === 'student' && attempt.studentId === req.user.id;
    const isOwnerTeacher = req.user.role === 'teacher' && attempt.teacherId === req.user.id;
    if (!isOwnerStudent && !isOwnerTeacher) {
      return res.status(403).json({ error: 'You do not have permission to view this attempt.' });
    }

    const version = db.getVersion(attempt.quizVersionId);
    const asg = attempt.assignmentId ? db.state.assignments.find((a) => a.id === attempt.assignmentId) : null;
    const showAnswers = isOwnerTeacher || !asg || asg.settings?.showAnswersAfterSubmit !== false;

    const questions = (version?.questions || []).map((q) => sanitizeQuestionForStudent(q, showAnswers));
    const qById = new Map(questions.map((q) => [q.id, q]));

    const items = attempt.questionOrder.map((qId) => {
      const q = qById.get(qId);
      const ans = attempt.answers.find((a) => a.questionId === qId);
      return {
        question: q,
        response: ans ? ans.response : null,
        isCorrect: showAnswers ? (ans ? ans.isCorrect : false) : null,
        awardedPoints: ans ? ans.awardedPoints : 0,
        gradedBy: ans ? ans.gradedBy : 'auto',
        answerId: ans ? ans.id : null,
      };
    });

    res.json({
      ok: true,
      showAnswers,
      attempt: {
        id: attempt.id,
        title: version?.title || 'Assessment',
        subject: version?.subject || 'General',
        studentEmail: attempt.studentEmail,
        status: attempt.status,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percent: attempt.percent,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      items,
    });
  });

  // =========================================================================
  // 5. LIVE ROOMS (Teacher-Paced, Student-Paced, Challenge, Quick Question)
  // =========================================================================

  app.get('/api/rooms', requireAuth('teacher'), (req, res) => {
    const rooms = db.state.rooms
      .filter((r) => r.teacherId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => buildRoomViewForUser(r, req.user));
    res.json({ ok: true, rooms });
  });

  app.post('/api/rooms', requireAuth('teacher'), (req, res) => {
    const mode = ['teacher_paced', 'student_paced', 'challenge', 'quick_question'].includes(req.body?.mode)
      ? req.body.mode
      : 'teacher_paced';

    let code = generateRoomCode();
    while (db.state.rooms.some((r) => r.code === code && r.status !== 'ended')) {
      code = generateRoomCode();
    }

    let quizVersionId = null;
    let title = String(req.body?.title || '').trim().slice(0, 120);
    let quickQuestionPayload = null;

    if (mode === 'quick_question') {
      const qq = req.body?.quickQuestion;
      if (!qq || !String(qq.prompt || '').trim()) {
        return res.status(400).json({ error: 'Quick question prompt is required.' });
      }
      quickQuestionPayload = {
        id: `qq_${crypto.randomUUID().slice(0, 8)}`,
        position: 0,
        type: ['mcq', 'tf', 'short_answer'].includes(qq.type) ? qq.type : 'mcq',
        prompt: String(qq.prompt).trim(),
        options: Array.isArray(qq.options) ? qq.options : (qq.type === 'tf' ? ['True', 'False'] : []),
        correctAnswer: qq.correctAnswer ?? null,
        acceptedAnswers: Array.isArray(qq.acceptedAnswers) ? qq.acceptedAnswers : [],
        matchOptions: qq.matchOptions || { caseSensitive: false, ignoreSpaces: true, allowMinorSpelling: true },
        points: Math.max(1, Number(qq.points || 1)),
        timeLimitSec: Math.max(5, Number(qq.timeLimitSec || 30)),
        explanation: String(qq.explanation || ''),
        imageUrl: String(qq.imageUrl || ''),
      };
      title = title || 'Quick Question';
    } else {
      const quiz = db.state.quizzes.find((q) => q.id === req.body?.quizId && q.ownerId === req.user.id && !q.deletedAt);
      if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
      if (!quiz.draftQuestions?.length) return res.status(400).json({ error: 'Quiz must have at least one question.' });
      const snapshot = db.createSnapshot(quiz, req.user.id);
      quizVersionId = snapshot.id;
      title = title || snapshot.title;
    }

    const room = {
      id: `room_${crypto.randomUUID().slice(0, 10)}`,
      teacherId: req.user.id,
      quizVersionId,
      code,
      title,
      mode,
      status: mode === 'quick_question' ? 'active' : 'lobby',
      currentQuestionIdx: 0,
      revealedCurrent: false,
      openJoin: Boolean(req.body?.openJoin),
      questionStartedAt: mode === 'quick_question' ? new Date().toISOString() : null,
      quickQuestionPayload,
      settings: {
        showFeedbackImmediately: Boolean(req.body?.settings?.showFeedbackImmediately),
      },
      participants: [],
      responses: {},
      createdAt: new Date().toISOString(),
      endedAt: null,
    };

    db.state.rooms.push(room);
    db.save();
    res.status(201).json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  app.post('/api/rooms/:code/join', requireAuth('student'), (req, res) => {
    const ip = req.ip || 'local';
    const rl = checkRateLimit(`roomjoin:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return res.status(429).json({ error: `Too many room join attempts. Wait ${rl.retryAfterSec}s.` });
    }

    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found. Double-check the room code.' });
    }
    if (room.status === 'ended') {
      return res.status(409).json({ error: 'This live room has already ended.' });
    }
    if (!room.openJoin && !db.isEmailOnTeacherRoster(room.teacherId, req.user.email)) {
      return res.status(403).json({
        error: 'Access denied: your verified email is not on this teacher\'s roster.',
      });
    }

    const now = new Date().toISOString();
    let participant = (room.participants || []).find((p) => p.studentId === req.user.id);
    if (!participant) {
      participant = {
        studentId: req.user.id,
        studentEmail: req.user.email,
        displayName: req.user.displayName,
        totalScore: 0,
        joinedAt: now,
        lastSeenAt: now,
      };
      room.participants.push(participant);
    } else {
      participant.lastSeenAt = now;
    }
    db.save();
    broadcastRoom(room.code, 'room:update');
    res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  app.get('/api/rooms/:code/state', requireAuth(), (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const isTeacherOwner = req.user.role === 'teacher' && room.teacherId === req.user.id;
    const isAllowedStudent =
      req.user.role === 'student' &&
      (room.openJoin || db.isEmailOnTeacherRoster(room.teacherId, req.user.email));

    if (!isTeacherOwner && !isAllowedStudent) {
      return res.status(403).json({ error: 'You do not have access to this room.' });
    }
    res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  app.post('/api/rooms/:code/navigate', requireAuth('teacher'), (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code && r.teacherId === req.user.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.status === 'ended') return res.status(409).json({ error: 'Room has already ended.' });

    const questions = getRoomQuestions(room);
    const nextIdx = Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(req.body?.questionIndex ?? room.currentQuestionIdx)));
    room.status = 'active';
    room.currentQuestionIdx = nextIdx;
    room.revealedCurrent = false;
    room.questionStartedAt = new Date().toISOString();

    db.save();
    broadcastRoom(room.code, 'room:update');
    res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  app.post('/api/rooms/:code/reveal', requireAuth('teacher'), (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code && r.teacherId === req.user.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.revealedCurrent = req.body?.revealed !== undefined ? Boolean(req.body.revealed) : !room.revealedCurrent;
    db.save();
    broadcastRoom(room.code, 'room:update');
    res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  app.post('/api/rooms/:code/answer', requireAuth('student'), (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.status !== 'active') return res.status(409).json({ error: 'Room is not currently active.' });
    if (!room.openJoin && !db.isEmailOnTeacherRoster(room.teacherId, req.user.email)) {
      return res.status(403).json({ error: 'Access revoked: you are no longer on this teacher\'s roster.' });
    }

    const participant = (room.participants || []).find((p) => p.studentId === req.user.id);
    if (!participant) return res.status(403).json({ error: 'Join the room before submitting answers.' });

    const questions = getRoomQuestions(room);
    const qIdx = room.mode === 'student_paced'
      ? Number(req.body?.questionIndex ?? 0)
      : room.currentQuestionIdx;
    const question = questions[qIdx];
    if (!question) return res.status(400).json({ error: 'Invalid question index.' });

    room.responses[req.user.id] = room.responses[req.user.id] || {};
    if (room.responses[req.user.id][question.id]) {
      return res.status(409).json({ error: 'Answer already submitted for this question.' });
    }

    const elapsedSec = room.questionStartedAt
      ? (Date.now() - new Date(room.questionStartedAt).getTime()) / 1000
      : null;

    const graded =
      question.correctAnswer === null || question.correctAnswer === undefined
        ? { isCorrect: null, awardedPoints: 0 }
        : gradeQuestion(question, req.body?.response, { elapsedSec });

    room.responses[req.user.id][question.id] = {
      response: req.body?.response,
      isCorrect: graded.isCorrect,
      awardedPoints: graded.awardedPoints,
      gradedBy: 'auto',
      answeredAt: new Date().toISOString(),
    };

    participant.totalScore = Object.values(room.responses[req.user.id]).reduce(
      (sum, r) => sum + Number(r.awardedPoints || 0),
      0
    );
    participant.lastSeenAt = new Date().toISOString();

    db.save();
    broadcastRoom(room.code, 'room:update');

    const immediateFeedback = Boolean(room.settings?.showFeedbackImmediately);
    res.json({
      ok: true,
      feedback: immediateFeedback
        ? {
            isCorrect: graded.isCorrect,
            awardedPoints: graded.awardedPoints,
            explanation: question.explanation || '',
          }
        : null,
      room: buildRoomViewForUser(room, req.user),
    });
  });

  app.post('/api/rooms/:code/end', requireAuth('teacher'), (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.state.rooms.find((r) => r.code === code && r.teacherId === req.user.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.status === 'ended') {
      return res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
    }

    room.status = 'ended';
    room.endedAt = new Date().toISOString();
    const questions = getRoomQuestions(room);

    // Automatically persist each participant's responses as an Attempt record
    for (const p of room.participants || []) {
      const pResp = room.responses[p.studentId] || {};
      const answers = questions.map((q) => {
        const saved = pResp[q.id];
        return {
          id: `ans_${crypto.randomUUID().slice(0, 8)}`,
          questionId: q.id,
          response: saved ? saved.response : null,
          isCorrect: saved ? saved.isCorrect : false,
          awardedPoints: saved ? saved.awardedPoints : 0,
          gradedBy: saved ? saved.gradedBy : 'auto',
          answeredAt: saved ? saved.answeredAt : room.endedAt,
        };
      });
      const totals = recalculateAttemptScore(questions, answers);
      db.state.attempts.push({
        id: `att_${crypto.randomUUID().slice(0, 10)}`,
        studentId: p.studentId,
        studentEmail: p.studentEmail,
        teacherId: room.teacherId,
        quizVersionId: room.quizVersionId,
        assignmentId: null,
        roomId: room.id,
        status: 'submitted',
        questionOrder: questions.map((q) => q.id),
        startedAt: p.joinedAt || room.createdAt,
        submittedAt: room.endedAt,
        score: totals.score,
        maxScore: totals.maxScore,
        percent: totals.percent,
        answers,
      });
    }

    db.save();
    broadcastRoom(room.code, 'room:ended');

    if (activeMailer.isConfigured()) {
      const roomAttempts = db.state.attempts.filter((a) => a.roomId === room.id);
      Promise.allSettled(
        roomAttempts.map((att) =>
          activeMailer.sendAttemptResult({
            to: att.studentEmail,
            studentName: room.participants?.find((p) => p.studentId === att.studentId)?.displayName || att.studentEmail,
            title: room.title,
            sourceLabel: 'Live Classroom',
            score: att.score,
            maxScore: att.maxScore,
            percent: att.percent,
            attemptId: att.id,
            showAnswers: true,
          })
        )
      ).catch(() => {});
    }

    res.json({ ok: true, room: buildRoomViewForUser(room, req.user) });
  });

  // =========================================================================
  // 6. REPORTING, ANALYTICS, MANUAL GRADING OVERRIDE & CSV EXPORT
  // =========================================================================

  app.get('/api/reports/overview', requireAuth('teacher'), (req, res) => {
    const myAttempts = db.state.attempts.filter((a) => a.teacherId === req.user.id && a.status !== 'in_progress');
    const myAssignments = db.state.assignments.filter((a) => a.teacherId === req.user.id);
    const myRooms = db.state.rooms.filter((r) => r.teacherId === req.user.id && r.status === 'ended');

    const assignmentReports = myAssignments.map((asg) => {
      const atts = myAttempts.filter((a) => a.assignmentId === asg.id);
      const version = db.getVersion(asg.quizVersionId);
      const avg = atts.length ? Math.round((atts.reduce((s, a) => s + a.percent, 0) / atts.length) * 10) / 10 : 0;
      return {
        type: 'assignment',
        id: asg.id,
        title: asg.title,
        subject: version?.subject || 'General',
        submissions: atts.length,
        averagePercent: avg,
        createdAt: asg.createdAt,
      };
    });

    const roomReports = myRooms.map((rm) => {
      const atts = myAttempts.filter((a) => a.roomId === rm.id);
      const avg = atts.length ? Math.round((atts.reduce((s, a) => s + a.percent, 0) / atts.length) * 10) / 10 : 0;
      return {
        type: 'room',
        id: rm.id,
        code: rm.code,
        title: rm.title,
        mode: rm.mode,
        submissions: atts.length,
        averagePercent: avg,
        createdAt: rm.endedAt || rm.createdAt,
      };
    });

    res.json({ ok: true, assignmentReports, roomReports });
  });

  function getReportDataForTeacher(teacherId, type, id) {
    let title = 'Assessment Report';
    let questions = [];
    let attempts = [];

    if (type === 'assignment') {
      const asg = db.state.assignments.find((a) => a.id === id && a.teacherId === teacherId);
      if (!asg) return null;
      title = asg.title;
      const version = db.getVersion(asg.quizVersionId);
      questions = version?.questions || [];
      attempts = db.state.attempts.filter((a) => a.assignmentId === asg.id && a.status !== 'in_progress');
    } else if (type === 'room') {
      const room = db.state.rooms.find((r) => r.id === id && r.teacherId === teacherId);
      if (!room) return null;
      title = `${room.title} (${room.code})`;
      questions = getRoomQuestions(room);
      attempts = db.state.attempts.filter((a) => a.roomId === room.id);
    } else {
      return null;
    }

    const questionStats = questions.map((q, idx) => {
      let answered = 0;
      let correct = 0;
      for (const att of attempts) {
        const ans = att.answers.find((a) => a.questionId === q.id);
        if (ans && ans.response !== null && ans.response !== undefined && ans.response !== '') {
          answered += 1;
        }
        if (ans && ans.isCorrect) correct += 1;
      }
      const accuracy = attempts.length ? Math.round((correct / attempts.length) * 100) : 0;
      return {
        index: idx + 1,
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        answeredCount: answered,
        correctCount: correct,
        accuracyPercent: accuracy,
      };
    });

    const mostMissed = [...questionStats]
      .sort((a, b) => a.accuracyPercent - b.accuracyPercent)
      .slice(0, 3);

    const studentRows = attempts.map((att) => {
      const rosterMatch = db.state.rosterEntries.find(
        (r) => r.teacherId === teacherId && normalizeEmail(r.studentEmail) === normalizeEmail(att.studentEmail)
      );
      const userMatch = db.state.users.find((u) => u.id === att.studentId);
      return {
        attemptId: att.id,
        studentEmail: att.studentEmail,
        displayName: rosterMatch?.displayName || userMatch?.displayName || att.studentEmail,
        status: att.status,
        score: att.score,
        maxScore: att.maxScore,
        percent: att.percent,
        submittedAt: att.submittedAt,
        answers: att.answers,
      };
    });

    return { title, questions, questionStats, mostMissed, studentRows };
  }

  app.get('/api/reports/detail', requireAuth('teacher'), (req, res) => {
    const data = getReportDataForTeacher(req.user.id, req.query.type, req.query.id);
    if (!data) return res.status(404).json({ error: 'Report not found.' });
    res.json({ ok: true, report: data });
  });

  app.post('/api/reports/override-grade', requireAuth('teacher'), (req, res) => {
    const attempt = db.state.attempts.find(
      (a) => a.id === req.body?.attemptId && a.teacherId === req.user.id
    );
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

    const ans = attempt.answers.find(
      (a) => a.id === req.body?.answerId || a.questionId === req.body?.questionId
    );
    if (!ans) return res.status(404).json({ error: 'Answer record not found.' });

    let questions = [];
    if (attempt.quizVersionId) {
      questions = db.getVersion(attempt.quizVersionId)?.questions || [];
    } else if (attempt.roomId) {
      const rm = db.state.rooms.find((r) => r.id === attempt.roomId);
      if (rm) questions = getRoomQuestions(rm);
    }

    const q = questions.find((item) => item.id === ans.questionId);
    const maxPts = Math.max(1, Number(q?.points || 1));

    const isCorrect = Boolean(req.body?.isCorrect);
    const awardedPoints =
      req.body?.awardedPoints !== undefined
        ? Math.max(0, Math.min(maxPts * 2, Number(req.body.awardedPoints)))
        : (isCorrect ? maxPts : 0);

    ans.isCorrect = isCorrect;
    ans.awardedPoints = awardedPoints;
    ans.gradedBy = 'teacher';

    const totals = recalculateAttemptScore(questions, attempt.answers);
    attempt.score = totals.score;
    attempt.maxScore = totals.maxScore;
    attempt.percent = totals.percent;

    // Also update room participant score if linked to a room
    if (attempt.roomId) {
      const rm = db.state.rooms.find((r) => r.id === attempt.roomId);
      const p = rm?.participants?.find((x) => x.studentId === attempt.studentId);
      if (p) p.totalScore = attempt.score;
    }

    db.save();

    if (activeMailer.isConfigured()) {
      const version = attempt.quizVersionId ? db.getVersion(attempt.quizVersionId) : null;
      const studentUser = db.state.users.find((u) => u.id === attempt.studentId);
      activeMailer
        .sendGradeUpdated({
          to: attempt.studentEmail,
          studentName: studentUser?.displayName || attempt.studentEmail,
          title: version?.title || 'Assessment',
          score: attempt.score,
          maxScore: attempt.maxScore,
          percent: attempt.percent,
          attemptId: attempt.id,
        })
        .catch(() => {});
    }

    res.json({
      ok: true,
      attempt: {
        id: attempt.id,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percent: attempt.percent,
      },
      answer: ans,
    });
  });

  app.get('/api/reports/export.csv', requireAuth('teacher'), (req, res) => {
    const data = getReportDataForTeacher(req.user.id, req.query.type, req.query.id);
    if (!data) return res.status(404).json({ error: 'Report not found.' });

    const headers = [
      'Student Name',
      'Student Email',
      'Status',
      'Score',
      'Max Score',
      'Percent',
      'Submitted At',
      ...data.questions.map((q, i) => `Q${i + 1}: ${q.prompt.slice(0, 40)}`),
    ];
    const rows = data.studentRows.map((row) => [
      row.displayName,
      row.studentEmail,
      row.status,
      row.score,
      row.maxScore,
      `${row.percent}%`,
      row.submittedAt || '',
      ...data.questions.map((q) => {
        const ans = row.answers.find((a) => a.questionId === q.id);
        if (!ans) return '0';
        return `${ans.awardedPoints} (${ans.isCorrect ? 'Correct' : 'Incorrect'})`;
      }),
    ]);

    const csv = buildCsvReport(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roster-report-${req.query.id}.csv"`);
    res.send(csv);
  });

  return { app, verifyToken, buildRoomViewForUser };
}
