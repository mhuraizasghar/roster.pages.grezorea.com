/**
 * Roster Transactional Mailer (Resend REST API)
 * Sends branded HTML & plain-text emails with the Roster logo and Night Bordeaux theme.
 */

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveMailerConfig(overrides = {}) {
  const apiKey =
    overrides.apiKey ??
    process.env.RESEND_API_KEY ??
    process.env.VITE_RESEND_API_KEY ??
    '';
  const fromEmail =
    overrides.fromEmail ??
    process.env.RESEND_EMAIL ??
    process.env.VITE_RESEND_EMAIL ??
    'noreply@pages.grezorea.com';
  const appUrl = (
    overrides.appUrl ??
    process.env.PUBLIC_APP_URL ??
    'https://roster.pages.grezorea.com'
  ).replace(/\/+$/, '');

  const cleanKey = String(apiKey).trim();
  const isConfigured = Boolean(cleanKey) && !cleanKey.includes('[YOUR-');

  return {
    apiKey: cleanKey,
    from: `Roster Assessment <${String(fromEmail).trim()}>`,
    fromEmail: String(fromEmail).trim(),
    appUrl,
    isConfigured,
  };
}

function renderEmailLayout({ appUrl, eyebrow, heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const logoUrl = `${appUrl}/roster-logo.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0908;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f2f4f3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #d9d0c7;border-radius:10px;overflow:hidden;">
          <!-- Header with Roster Logo -->
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #eae6e1;background-color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${escapeHtml(logoUrl)}" alt="Roster" height="28" style="height:28px;width:auto;vertical-align:middle;display:inline-block;margin-right:10px;" />
                    <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#0a0908;vertical-align:middle;">Roster</span>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:11px;color:#5e503f;letter-spacing:0.06em;text-transform:uppercase;">
                    ${escapeHtml(eyebrow)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent Hairline -->
          <tr>
            <td style="height:3px;background-color:#49111c;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 14px 0;font-size:20px;line-height:1.3;font-weight:600;color:#0a0908;">
                ${escapeHtml(heading)}
              </h1>
              <div style="font-size:14px;line-height:1.65;color:#2c2623;">
                ${bodyHtml}
              </div>
              ${
                ctaLabel && ctaUrl
                  ? `<div style="margin-top:24px;">
                      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:#49111c;color:#f2f4f3;text-decoration:none;font-size:13px;font-weight:600;padding:11px 20px;border-radius:8px;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </div>`
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px;background-color:#f8f7f6;border-top:1px solid #eae6e1;font-size:12px;line-height:1.5;color:#5e503f;">
              <div>${escapeHtml(footerNote || 'Sent by Roster Classroom Assessment Platform.')}</div>
              <div style="margin-top:4px;font-size:11px;color:#a9927d;">
                Roster &middot; ${escapeHtml(appUrl.replace(/^https?:\/\//, ''))}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function createMailer(options = {}) {
  const cfg = resolveMailerConfig(options);
  const enabled = options.enabled !== undefined ? Boolean(options.enabled) : cfg.isConfigured;

  async function send({ to, subject, html, text }) {
    if (!enabled || !cfg.isConfigured) {
      return { sent: false, skipped: true, reason: 'RESEND_API_KEY not configured' };
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[Roster Mailer] Resend error:', response.status, data);
        return { sent: false, status: response.status, error: data.message || 'Resend rejected request' };
      }
      return { sent: true, id: data.id || null };
    } catch (err) {
      console.error('[Roster Mailer] Network failure:', err.message);
      return { sent: false, error: err.message };
    }
  }

  return {
    isConfigured: () => enabled && cfg.isConfigured,
    getStatus: () => ({
      configured: enabled && cfg.isConfigured,
      fromEmail: cfg.fromEmail,
      appUrl: cfg.appUrl,
    }),

    sendTeacherVerification({ to, displayName, token }) {
      const verifyUrl = `${cfg.appUrl}/teacher/login?verify=${encodeURIComponent(token)}`;
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: 'Email Verification',
        heading: 'Confirm your instructor account',
        bodyHtml: `
          <p style="margin:0 0 12px 0;">Hello ${escapeHtml(displayName)},</p>
          <p style="margin:0 0 14px 0;">Confirm your email address to activate your Roster instructor workspace and begin managing student rosters and live classrooms.</p>
          <p style="margin:0;font-size:12px;color:#5e503f;">Verification token: <code style="font-family:monospace;background:#f2f4f3;padding:2px 6px;border-radius:4px;color:#0a0908;">${escapeHtml(token)}</code></p>
        `,
        ctaLabel: 'Verify Email & Sign In',
        ctaUrl: verifyUrl,
        footerNote: 'This verification link expires in 24 hours. If you did not create an Roster account, you can safely ignore this email.',
      });
      return send({
        to,
        subject: 'Verify your Roster instructor account',
        html,
        text: `Hello ${displayName},\n\nVerify your Roster instructor account: ${verifyUrl}\nToken: ${token}\n`,
      });
    },

    sendStudentOtp({ to, code }) {
      const loginUrl = `${cfg.appUrl}/student/login`;
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: 'One-Time Sign-In Code',
        heading: 'Your Roster verification code',
        bodyHtml: `
          <p style="margin:0 0 14px 0;">Use the 6-digit verification code below to sign in to your Roster student dashboard:</p>
          <div style="margin:18px 0;padding:16px;text-align:center;background-color:#f2f4f3;border:1px solid #d9d0c7;border-radius:8px;font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#49111c;">
            ${escapeHtml(code)}
          </div>
          <p style="margin:0;font-size:12px;color:#5e503f;">This code expires in 10 minutes and works only for your rostered email address.</p>
        `,
        ctaLabel: 'Open Student Portal',
        ctaUrl: loginUrl,
        footerNote: 'Never share your verification code with anyone.',
      });
      return send({
        to,
        subject: `${code} is your Roster sign-in code`,
        html,
        text: `Your Roster sign-in verification code is: ${code}\nIt expires in 10 minutes.\nSign in at: ${loginUrl}\n`,
      });
    },

    sendPasswordReset({ to, displayName, token }) {
      const resetUrl = `${cfg.appUrl}/teacher/reset?token=${encodeURIComponent(token)}`;
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: 'Account Recovery',
        heading: 'Reset your Roster password',
        bodyHtml: `
          <p style="margin:0 0 12px 0;">Hello ${escapeHtml(displayName || 'Instructor')},</p>
          <p style="margin:0 0 14px 0;">We received a request to reset the password for your Roster instructor account. Use the button or recovery token below within 30 minutes.</p>
          <p style="margin:0;font-size:12px;color:#5e503f;">Recovery token: <code style="font-family:monospace;background:#f2f4f3;padding:2px 6px;border-radius:4px;color:#0a0908;">${escapeHtml(token)}</code></p>
        `,
        ctaLabel: 'Reset Password',
        ctaUrl: resetUrl,
        footerNote: 'If you did not request a password reset, your current password remains unchanged.',
      });
      return send({
        to,
        subject: 'Reset your Roster instructor password',
        html,
        text: `Reset your Roster password: ${resetUrl}\nRecovery token: ${token}\nExpires in 30 minutes.\n`,
      });
    },

    sendAttemptResult({ to, studentName, title, sourceLabel, score, maxScore, percent, attemptId, showAnswers }) {
      const reviewUrl = `${cfg.appUrl}/review/${encodeURIComponent(attemptId)}`;
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: `${sourceLabel} Result`,
        heading: `Assessment completed: ${title}`,
        bodyHtml: `
          <p style="margin:0 0 14px 0;">Hello ${escapeHtml(studentName || 'Student')},</p>
          <p style="margin:0 0 16px 0;">Your submission for <strong>${escapeHtml(title)}</strong> has been recorded.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d9d0c7;border-radius:8px;background-color:#f2f4f3;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#5e503f;">Score Summary</div>
                <div style="margin-top:4px;font-size:20px;font-weight:700;font-family:monospace;color:#0a0908;">
                  ${escapeHtml(score)} / ${escapeHtml(maxScore)} (${escapeHtml(percent)}%)
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0 0;font-size:12px;color:#5e503f;">
            ${showAnswers ? 'Question breakdown and explanations are available in your student dashboard.' : 'Answer keys are hidden per instructor settings.'}
          </p>
        `,
        ctaLabel: 'View Submission Breakdown',
        ctaUrl: reviewUrl,
      });
      return send({
        to,
        subject: `Roster Result: ${title} (${percent}%)`,
        html,
        text: `Assessment completed: ${title}\nScore: ${score}/${maxScore} (${percent}%)\nView breakdown: ${reviewUrl}\n`,
      });
    },

    sendAssignmentPublished({ to, studentName, teacherName, title, subject, dueAt, assignmentId }) {
      const attemptUrl = `${cfg.appUrl}/attempt/${encodeURIComponent(assignmentId)}`;
      const dueLabel = dueAt ? new Date(dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date';
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: 'New Assignment',
        heading: title,
        bodyHtml: `
          <p style="margin:0 0 12px 0;">Hello ${escapeHtml(studentName || 'Student')},</p>
          <p style="margin:0 0 14px 0;"><strong>${escapeHtml(teacherName)}</strong> assigned a new assessment in <strong>${escapeHtml(subject)}</strong>.</p>
          <p style="margin:0;font-size:13px;color:#5e503f;">Due: <strong style="color:#0a0908;">${escapeHtml(dueLabel)}</strong></p>
        `,
        ctaLabel: 'Open Assignment',
        ctaUrl: attemptUrl,
      });
      return send({
        to,
        subject: `New Roster Assignment: ${title}`,
        html,
        text: `${teacherName} assigned "${title}" (${subject}).\nDue: ${dueLabel}\nStart here: ${attemptUrl}\n`,
      });
    },

    sendGradeUpdated({ to, studentName, title, score, maxScore, percent, attemptId }) {
      const reviewUrl = `${cfg.appUrl}/review/${encodeURIComponent(attemptId)}`;
      const html = renderEmailLayout({
        appUrl: cfg.appUrl,
        eyebrow: 'Grade Updated',
        heading: `Updated grade for ${title}`,
        bodyHtml: `
          <p style="margin:0 0 12px 0;">Hello ${escapeHtml(studentName || 'Student')},</p>
          <p style="margin:0 0 14px 0;">Your instructor updated the grading on your submission for <strong>${escapeHtml(title)}</strong>.</p>
          <p style="margin:0;font-size:16px;font-weight:700;font-family:monospace;color:#49111c;">
            Updated Score: ${escapeHtml(score)} / ${escapeHtml(maxScore)} (${escapeHtml(percent)}%)
          </p>
        `,
        ctaLabel: 'Review Updated Grade',
        ctaUrl: reviewUrl,
      });
      return send({
        to,
        subject: `Updated Roster Grade: ${title} (${percent}%)`,
        html,
        text: `Your grade for "${title}" was updated to ${score}/${maxScore} (${percent}%).\nReview: ${reviewUrl}\n`,
      });
    },
  };
}
