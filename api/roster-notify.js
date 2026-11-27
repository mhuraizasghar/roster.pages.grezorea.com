function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !anonKey || !resendKey) return res.status(503).json({ error: 'Assignment email service is not configured.' });
  const accessToken = String(req.body?.accessToken || '');
  const assignmentId = String(req.body?.assignmentId || '');
  if (!accessToken || accessToken.length > 8192 || !/^[0-9a-f-]{36}$/i.test(assignmentId)) return res.status(401).json({ error: 'Sign in again to notify students.' });

  const supabaseFetch = async (resource) => fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    if (!authResponse.ok) return res.status(401).json({ error: 'Your Supabase session expired. Sign in again.' });
    const authUser = await authResponse.json();
    const profileResponse = await supabaseFetch(`users_profile?auth_uid=eq.${encodeURIComponent(authUser.id)}&select=id,role,display_name&limit=1`);
    if (!profileResponse.ok) return res.status(403).json({ error: 'Instructor profile could not be verified.' });
    const [profile] = await profileResponse.json();
    if (!profile || profile.role !== 'teacher') return res.status(403).json({ error: 'Only the assignment instructor can send notifications.' });

    const assignmentResponse = await supabaseFetch(`assignments?id=eq.${assignmentId}&teacher_id=eq.${profile.id}&select=id,title,target_type,target_emails,target_group_ids,due_at&limit=1`);
    if (!assignmentResponse.ok) return res.status(403).json({ error: 'Assignment access could not be verified.' });
    const [assignment] = await assignmentResponse.json();
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    const rosterResponse = await supabaseFetch(`roster_entries?teacher_id=eq.${profile.id}&select=student_email,display_name,group_id&limit=500`);
    if (!rosterResponse.ok) return res.status(403).json({ error: 'Roster access could not be verified.' });
    const roster = await rosterResponse.json();
    const targets = new Set((assignment.target_emails || []).map((email) => String(email).toLowerCase()));
    const groupIds = new Set((assignment.target_group_ids || []).map(String));
    const matchingRecipients = roster.filter((entry) => {
      if (assignment.target_type === 'all_roster') return true;
      if (assignment.target_type === 'groups') return groupIds.has(String(entry.group_id));
      return targets.has(String(entry.student_email || '').toLowerCase());
    });
    const recipients = matchingRecipients.slice(0, 500);
    if (!recipients.length) return res.status(200).json({ sent: 0, failed: 0 });

    const fromEmail = process.env.RESEND_EMAIL || 'noreply@pages.grezorea.com';
    const appUrl = process.env.PUBLIC_APP_URL || 'https://roster.pages.grezorea.com';
    let sent = 0;
    let failed = matchingRecipients.length - recipients.length;
    const deliver = async (recipient) => {
      const to = String(recipient.student_email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
      const dueLine = assignment.due_at ? `<p>Due: ${escapeHtml(assignment.due_at)}</p>` : '';
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Roster <${fromEmail}>`, to: [to], subject: `${assignment.title} - New assignment in Roster`, html: `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:Arial,sans-serif;color:#0a0908"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #d9d0c7;border-radius:10px;padding:28px"><h1 style="font-size:20px;margin:0 0 16px">New Assignment</h1><p>${escapeHtml(recipient.display_name || 'Student')}, <strong>${escapeHtml(profile.display_name || 'Instructor')}</strong> published <strong>${escapeHtml(assignment.title)}</strong>.</p>${dueLine}<p>Sign in to view and complete the assignment.</p><p style="margin-top:24px"><a href="${escapeHtml(appUrl)}/student/login" style="display:inline-block;background:#49111c;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:13px">Open Student Portal</a></p></div></body></html>` }),
      });
      return mail.ok;
    };
    for (let index = 0; index < recipients.length; index += 10) {
      const outcomes = await Promise.all(recipients.slice(index, index + 10).map((recipient) => deliver(recipient).catch(() => false)));
      sent += outcomes.filter(Boolean).length;
      failed += outcomes.length - outcomes.filter(Boolean).length;
    }
    return res.status(200).json({ sent, failed });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Email delivery failed.' });
  }
};
