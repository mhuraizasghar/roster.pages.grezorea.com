import React, { useMemo, useState } from 'react';
import { Download, Search, Trash2, Upload, UserPlus, Check, Edit2, X, Mail, LoaderCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';
import ActionMenu from '../ActionMenu';

export default function RosterPanel({ entries, groups, onRefresh }) {
  const [singleEmail, setSingleEmail] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singleGroupId, setSingleGroupId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [importReport, setImportReport] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingEmailId, setEditingEmailId] = useState(null);
  const [removeConfirmId, setRemoveConfirmId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentDialog, setStudentDialog] = useState('');
  const [resendingId, setResendingId] = useState('');
  const { showToast } = useToast();

  const parseCsvRows = (text) => {
    const rows = []; let row = []; let value = ''; let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(value); value = ''; }
      else if ((char === '\r' || char === '\n') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(value); rows.push(row); row = []; value = ''; }
      else value += char;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows.filter((items) => items.some((item) => item.trim()));
  };

  const handleAddSingle = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/roster', {
        email: singleEmail,
        displayName: singleName,
        groupId: singleGroupId || null,
      });
      setSingleEmail('');
      setSingleName('');
      setStudentDialog('');
      showToast('Student added to roster.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    try {
      const cleanText = bulkText.trim();
      let entries;
      if (cleanText.startsWith('[') || cleanText.startsWith('{')) {
        const parsed = JSON.parse(cleanText);
        entries = Array.isArray(parsed) ? parsed : parsed.students;
        if (!Array.isArray(entries)) throw new Error('JSON must be a student array or contain a students array.');
        entries = entries.map((student) => ({ email: student.email || student.studentEmail || '', displayName: student.name || student.displayName || '', groupName: student.group || student.groupName || '', groupId: student.groupId || bulkGroupId || null }));
      } else {
        const rows = parseCsvRows(cleanText);
        const first = rows[0]?.map((cell) => cell.trim().toLowerCase());
        const hasHeader = first?.some((cell) => ['email', 'studentemail', 'name', 'displayname', 'group', 'groupname'].includes(cell));
        const header = hasHeader ? first : ['email', 'name', 'group'];
        entries = rows.slice(hasHeader ? 1 : 0).map((parts) => {
          const row = Object.fromEntries(header.map((key, index) => [key, parts[index]?.trim() || '']));
        return {
            email: row.email || row.studentemail || '',
            displayName: row.name || row.displayname || '',
            groupId: row.groupid || bulkGroupId || null,
            groupName: row.group || row.groupname || '',
        };
      });
      }
      const res = await api.post('/api/roster/bulk', {
        text: bulkText,
        entries,
        groupId: bulkGroupId || null,
      });
      setImportReport(res);
      setBulkText('');
      setStudentDialog('');
      showToast(`Imported ${res.importedCount} student(s).`);
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text); const students = Array.isArray(parsed) ? parsed : parsed.students;
        if (!Array.isArray(students)) throw new Error('JSON file must contain a students array.');
        setBulkText(JSON.stringify(students, null, 2));
      } else setBulkText(text);
    } catch (error) { showToast(error.message || 'Could not read that file.', 'error'); }
  };

  const handleSaveName = async (entryId) => {
    try {
      await api.patch(`/api/roster/${entryId}`, { displayName: editName });
      setEditingId(null);
      showToast('Updated student name.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveEmail = async (entryId) => {
    try {
      await api.patch(`/api/roster/${entryId}`, { studentEmail: editEmail });
      setEditingEmailId(null);
      showToast('Updated student email.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleEmailVisibility = (id) => {
    setVisibleEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskEmail = (email) => {
    if (!email) return '—';
    const [local, domain] = email.split('@');
    if (!domain) return '••••@••••';
    const visibleLocal = local.length <= 2 ? local[0] + '•' : local.slice(0, 2) + '•'.repeat(Math.min(local.length - 2, 4));
    return `${visibleLocal}@${domain}`;
  };

  const handleGroupChange = async (entryId, groupId) => {
    try {
      await api.patch(`/api/roster/${entryId}`, { groupId: groupId || null });
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemove = async (entry) => {
    try {
      await api.del(`/api/roster/${entry.id}`);
      showToast(`Removed ${entry.studentEmail || entry.email} from roster (past attempts kept).`, 'info');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleResendInvitation = async (entry) => {
    if (resendingId) return;
    setResendingId(entry.id);
    try {
      await api.post(`/api/roster/${entry.id}/resend-invitation`, {});
      showToast(`Verification email sent to ${entry.studentEmail || entry.email}.`);
    } catch (err) {
      showToast(err.message || 'Could not resend the student invitation.', 'error');
    } finally { setResendingId(''); }
  };

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterGroup && e.groupId !== filterGroup) return false;
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (q) {
        const matchEmail = (e.studentEmail || e.email || '').toLowerCase().includes(q);
        const matchName = (e.displayName || '').toLowerCase().includes(q);
        if (!matchEmail && !matchName) return false;
      }
      return true;
    });
  }, [entries, filterGroup, filterStatus, searchQuery]);

  const handleExportRosterCsv = () => {
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['email', 'name', 'group', 'status'].join(','),
      ...filtered.map((e) =>
        [
          escape(e.studentEmail || e.email || ''),
          escape(e.displayName || ''),
          escape(e.groupId ? (groupMap.get(e.groupId) || '') : ''),
          escape(e.status),
        ].join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} student(s) to CSV.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Students</h2><p className="text-xs" style={{color:'var(--eval-muted)'}}>Manage roster access and group membership. Invited students become active after verifying their account.</p></div>
        <div className="flex gap-2"><button type="button" onClick={()=>setStudentDialog('single')} className="eval-btn-secondary py-2 text-xs"><UserPlus className="h-3.5 w-3.5"/>Add student</button><button type="button" onClick={()=>setStudentDialog('bulk')} className="eval-btn-primary py-2 text-xs"><Upload className="h-3.5 w-3.5"/>Import students</button></div>
      </div>

      {studentDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"><div className="w-full max-w-xl bg-[var(--eval-bg)] p-5" role="dialog" aria-modal="true"><div className="mb-4 flex items-start justify-between"><div><h3 className="font-semibold">{studentDialog==='single'?'Add a student':'Import students'}</h3><p className="mt-1 text-xs" style={{color:'var(--eval-muted)'}}>{studentDialog==='single'?'Invite one student to your roster.':'Upload or paste a CSV or JSON student list.'}</p></div><button type="button" onClick={()=>setStudentDialog('')} aria-label="Close">×</button></div>
      {studentDialog==='single' ? <form onSubmit={handleAddSingle} className="space-y-3">
          <label className="block text-xs">Student email<input type="email" className="eval-input mt-1 text-xs" value={singleEmail} onChange={e=>setSingleEmail(e.target.value)} placeholder="student@university.edu" required/></label>
          <div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">Display name <span style={{color:'var(--eval-muted)'}}>(optional)</span><input className="eval-input mt-1 text-xs" value={singleName} onChange={e=>setSingleName(e.target.value)} placeholder="Student name"/></label><label className="block text-xs">Group<select className="eval-input mt-1 text-xs" value={singleGroupId} onChange={e=>setSingleGroupId(e.target.value)}><option value="">No group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={()=>setStudentDialog('')} className="eval-btn-secondary text-xs">Cancel</button><button type="submit" className="eval-btn-primary text-xs">Add to roster</button></div>
        </form> : <form onSubmit={handleBulkImport} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs"><label className="eval-btn-secondary cursor-pointer py-2 text-xs"><Upload className="h-3.5 w-3.5"/>Choose CSV / JSON<input type="file" accept=".csv,.txt,.json,text/csv,application/json" className="sr-only" onChange={handleCsvUpload}/></label><a className="underline" href="/templates/roster-import-sample.csv" download>CSV sample</a><a className="underline" href="/templates/roster-import-sample.json" download>JSON sample</a><a className="underline" href="/templates/roster-import-format.md" download>Format guide</a></div>
          <p className="text-xs" style={{color:'var(--eval-muted)'}}>Use columns <code>email,name,group</code>. You can paste rows or upload a file. Students are invited and become active after verification.</p>
          <textarea rows={7} className="eval-input w-full font-mono text-xs" value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={'email,name,group\naisha@uni.edu,Aisha Tariq,CS-101'} />
          <div className="flex flex-wrap items-center justify-between gap-2"><select className="eval-input text-xs" value={bulkGroupId} onChange={e=>setBulkGroupId(e.target.value)}><option value="">Default group: None</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><div className="flex gap-2"><button type="button" onClick={()=>setStudentDialog('')} className="eval-btn-secondary text-xs">Cancel</button><button type="submit" className="eval-btn-primary text-xs">Import roster</button></div></div>
          {importReport && <p className="text-xs">{importReport.importedCount} imported · {importReport.duplicateCount} duplicates skipped · {importReport.invalidCount} invalid</p>}
        </form>}
      </div></div>}

      {/* Roster search and filters */}
      <div className="eval-card p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--eval-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student or email..."
                aria-label="Search roster"
                className="eval-input pl-8 py-1.5 text-xs w-52"
              />
            </div>
            <select
              className="eval-input py-1.5 text-xs w-auto"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              aria-label="Filter roster by group"
            >
              <option value="">All groups</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <div className="inline-flex items-center p-0.5 rounded-lg border text-[11px]" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}>
                {['all', 'active', 'pending'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className="px-2.5 py-1 rounded-md capitalize transition-colors"
                  style={
                    filterStatus === st
                      ? { backgroundColor: 'var(--eval-surface)', color: 'var(--eval-ink)', fontWeight: 600 }
                      : { color: 'var(--eval-muted)' }
                  }
                >
                  {st === 'pending' ? 'invited' : st}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={handleExportRosterCsv} className="eval-btn-secondary py-1.5 px-3 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
      </div>

      {/* Roster Table */}
      <div className="eval-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="roster-table w-full text-left text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)', color: 'var(--eval-muted)' }}>
                <th className="py-2.5 px-4 font-semibold">Student Email</th>
                <th className="py-2.5 px-4 font-semibold">Display Name</th>
                <th className="py-2.5 px-4 font-semibold">Group</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center" style={{ color: 'var(--eval-muted)' }}>
                    No students on this roster yet.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 px-4 font-mono">
                      {editingEmailId === entry.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="email"
                            className="eval-input py-1 px-2 text-xs w-52"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEmail(entry.id); if (e.key === 'Escape') setEditingEmailId(null); }}
                            autoFocus
                          />
                          <button type="button" onClick={() => handleSaveEmail(entry.id)} className="eval-btn-primary py-1 px-2 text-xs">
                            <Check className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => setEditingEmailId(null)} className="eval-btn-ghost p-1" title="Cancel">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>{visibleEmails.has(entry.id) ? (entry.studentEmail || entry.email) : maskEmail(entry.studentEmail || entry.email)}</span>
                          <button
                            type="button"
                            onClick={() => toggleEmailVisibility(entry.id)}
                            className="eval-btn-ghost p-1"
                            title={visibleEmails.has(entry.id) ? 'Hide email' : 'Show email'}
                          >
                            {visibleEmails.has(entry.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingEmailId(entry.id); setEditEmail(entry.studentEmail || entry.email || ''); }}
                            className="eval-btn-ghost p-1"
                            title="Edit email"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {editingId === entry.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="eval-input py-1 px-2 text-xs w-40"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          <button type="button" onClick={() => handleSaveName(entry.id)} className="eval-btn-primary py-1 px-2 text-xs">
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{entry.displayName || <span style={{ color: 'var(--eval-muted)' }}>—</span>}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingId(entry.id); setEditName(entry.displayName || ''); }}
                            className="eval-btn-ghost p-1"
                            title="Edit display name"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        className="eval-input py-1 px-2 text-xs w-auto"
                        value={entry.groupId || ''}
                        onChange={(e) => handleGroupChange(entry.id, e.target.value)}
                        aria-label={`Group for ${entry.studentEmail || entry.email}`}
                      >
                        <option value="">No group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      {entry.groupId && !groupMap.has(entry.groupId) ? '' : null}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={entry.status === 'active' ? 'eval-badge eval-badge-pass' : 'eval-badge eval-badge-warn'}>
                        {entry.status === 'active' ? 'Active' : 'Invited'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {removeConfirmId === entry.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => handleRemove(entry)} className="eval-btn-primary py-1 px-2 text-[11px]">Remove</button>
                          <button type="button" onClick={() => setRemoveConfirmId(null)} className="eval-btn-ghost p-1" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <ActionMenu label={`More actions for ${entry.studentEmail || entry.email}`} items={[
                          ...(entry.status !== 'active' ? [{ label: resendingId === entry.id ? 'Sending invitation…' : 'Resend invitation', icon: resendingId === entry.id ? LoaderCircle : Mail, loading: resendingId === entry.id, disabled: Boolean(resendingId), onSelect: () => handleResendInvitation(entry) }] : []),
                          { label: 'Remove from roster', icon: Trash2, danger: true, onSelect: () => setRemoveConfirmId(entry.id) },
                        ]}/>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
