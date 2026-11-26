import React, { useMemo, useState } from 'react';
import { Download, FolderPlus, Search, Trash2, Upload, UserPlus, Check, Edit2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function RosterPanel({ entries, groups, onRefresh }) {
  const [singleEmail, setSingleEmail] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singleGroupId, setSingleGroupId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [importReport, setImportReport] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [removeConfirmId, setRemoveConfirmId] = useState(null);
  const [editName, setEditName] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();

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
      const lines = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const entries = lines.slice(lines[0]?.toLowerCase().startsWith('email') ? 1 : 0).map((line) => {
        const parts = line.split(',').map((part) => part.trim());
        return {
          email: parts[0] || '',
          displayName: parts[1] || '',
          groupId: parts[2] ? null : (bulkGroupId || null),
          groupName: parts[2] || '',
        };
      });
      const res = await api.post('/api/roster/bulk', {
        entries,
        groupId: bulkGroupId || null,
      });
      setImportReport(res);
      setBulkText('');
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
    const text = await file.text();
    setBulkText(text);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await api.post('/api/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      showToast('Group created.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Add Single Student */}
        <form onSubmit={handleAddSingle} className="lg:col-span-5 eval-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
            Add Student by Email
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Student Email</label>
            <input
              type="email"
              className="eval-input text-xs"
              value={singleEmail}
              onChange={(e) => setSingleEmail(e.target.value)}
              placeholder="student@university.edu"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Name (optional)</label>
              <input
                className="eval-input text-xs"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="Ali Khan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Group</label>
              <select
                className="eval-input text-xs"
                value={singleGroupId}
                onChange={(e) => setSingleGroupId(e.target.value)}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="eval-btn-primary text-xs w-full">Add to Roster</button>
        </form>

        {/* Bulk Paste or CSV Upload */}
        <form onSubmit={handleBulkImport} className="lg:col-span-7 eval-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="w-4 h-4" style={{ color: 'var(--eval-accent)' }} />
              Bulk Paste or CSV Upload
            </div>
            <label className="eval-btn-secondary text-xs py-1.5 px-3 cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={handleCsvUpload} />
            </label>
          </div>
          <textarea
            rows={3}
            className="eval-input text-xs font-mono"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'email,name,group\naisha@uni.edu,Aisha Tariq,CS-101 Section A\nbilal@college.edu,Bilal Raza,Physics Lab B'}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              className="eval-input text-xs w-auto"
              value={bulkGroupId}
              onChange={(e) => setBulkGroupId(e.target.value)}
            >
              <option value="">Default group: None</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="submit" className="eval-btn-primary text-xs">Import Roster</button>
          </div>
          {importReport && (
            <div
              className="p-3 rounded-lg border text-xs space-y-1"
              style={{ borderColor: 'var(--eval-border)', backgroundColor: 'var(--eval-bg)' }}
            >
              <div>
                <strong style={{ color: 'var(--status-pass)' }}>{importReport.importedCount} imported</strong> &middot;{' '}
                <strong style={{ color: 'var(--status-warn)' }}>{importReport.duplicateCount} duplicates skipped</strong> &middot;{' '}
                <strong style={{ color: 'var(--status-fail)' }}>{importReport.invalidCount} invalid</strong>
              </div>
              {importReport.invalid?.length > 0 && (
                <div className="font-mono text-[11px]" style={{ color: 'var(--status-fail)' }}>
                  Invalid: {importReport.invalid.join(', ')}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Groups & Search Filter Bar */}
      <div className="eval-card p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Groups / Sections:</span>
            <button
              type="button"
              onClick={() => setFilterGroup('')}
              className={!filterGroup ? 'eval-badge eval-badge-brand cursor-pointer' : 'eval-badge eval-badge-neutral cursor-pointer'}
            >
              All ({entries.length})
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setFilterGroup(filterGroup === g.id ? '' : g.id)}
                className={filterGroup === g.id ? 'eval-badge eval-badge-brand cursor-pointer' : 'eval-badge eval-badge-neutral cursor-pointer'}
              >
                {g.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateGroup} className="flex items-center gap-2">
            <input
              className="eval-input py-1.5 text-xs w-40"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New group name..."
            />
            <button type="submit" className="eval-btn-secondary text-xs py-1.5 px-3">
              <FolderPlus className="w-3.5 h-3.5" /> Add Group
            </button>
          </form>
        </div>

        <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--eval-border)' }}>
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
                  {st}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={handleExportRosterCsv} className="eval-btn-secondary py-1.5 px-3 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="eval-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
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
                    <td className="py-2.5 px-4 font-mono">{entry.studentEmail || entry.email}</td>
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
                        {entry.status === 'active' ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {removeConfirmId === entry.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => handleRemove(entry)} className="eval-btn-primary py-1 px-2 text-[11px]">Remove</button>
                          <button type="button" onClick={() => setRemoveConfirmId(null)} className="eval-btn-ghost p-1" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRemoveConfirmId(entry.id)}
                          className="eval-btn-ghost p-1.5"
                          style={{ color: 'var(--status-fail)' }}
                          title="Remove from roster"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
