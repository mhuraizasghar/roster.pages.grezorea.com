import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FolderPlus, Pencil, Search, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function GroupManagementPanel({ groups = [], entries = [], onRefresh }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const createGroup = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || busy) return;
    setBusy(true);
    try {
      await api.post('/api/groups', { name: cleanName });
      setName('');
      showToast('Group created.');
      await onRefresh();
    } catch (error) {
      showToast(error.message || 'Could not create group.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const renameGroup = async (groupId) => {
    const cleanName = editingName.trim();
    if (!cleanName || busy) return;
    setBusy(true);
    try {
      await api.patch(`/api/groups/${groupId}`, { name: cleanName });
      setEditingId('');
      setEditingName('');
      showToast('Group renamed.');
      await onRefresh();
    } catch (error) {
      showToast(error.message || 'Could not rename group.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (groupId) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.del(`/api/groups/${groupId}`);
      setDeleteId('');
      showToast('Group deleted. Students remain on the roster.', 'info');
      await onRefresh();
    } catch (error) {
      showToast(error.message || 'Could not delete group.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const visibleEntries = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => `${entry.displayName || ''} ${entry.studentEmail || entry.email || ''}`.toLowerCase().includes(query));
  }, [entries, memberSearch]);

  const setMembership = async (entry, groupId, checked) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/api/roster/${entry.id}`, { groupId: checked ? groupId : null });
      await onRefresh();
    } catch (error) {
      showToast(error.message || 'Could not update group membership.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: 'var(--eval-accent)' }} /> Groups &amp; Sections
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--eval-muted)' }}>
            Organize the student roster into teaching groups. Assignments can target a whole group.
          </p>
        </div>
        <span className="eval-badge eval-badge-neutral">{groups.length} groups · {entries.length} students</span>
      </header>

      <form onSubmit={createGroup} className="eval-card p-4 flex flex-wrap items-center gap-2">
        <input
          className="eval-input min-w-52 flex-1 py-2 text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. BSCMDA Section A"
          maxLength={80}
          aria-label="New group name"
          required
        />
        <button type="submit" disabled={busy || !name.trim()} className="eval-btn-primary py-2 px-3 text-xs">
          <FolderPlus className="h-3.5 w-3.5" /> Create group
        </button>
      </form>

      <div className="eval-card overflow-hidden">
        {groups.length === 0 ? (
          <div className="p-8 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
            No groups yet. Create a group, then open it to add students directly.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {groups.map((group) => {
              const memberCount = entries.filter((entry) => entry.groupId === group.id).length;
              const expanded = expandedId === group.id;
              return (
                <li key={group.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    {editingId !== group.id && <button type="button" onClick={() => setExpandedId(expanded ? '' : group.id)} className="eval-btn-ghost p-1" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.name}`}>
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>}
                    {editingId === group.id ? (
                      <div className="flex max-w-md items-center gap-2">
                        <input
                          className="eval-input min-w-0 flex-1 py-1.5 text-xs"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={80}
                          aria-label="Group name"
                          autoFocus
                        />
                        <button type="button" disabled={busy} onClick={() => renameGroup(group.id)} className="eval-btn-primary p-2" aria-label="Save group name"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId('')} className="eval-btn-ghost p-2" aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <button type="button" onClick={() => setExpandedId(expanded ? '' : group.id)} className="truncate text-left text-sm font-medium hover:underline">{group.name}</button>
                        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--eval-muted)' }}>{memberCount} students</div>
                      </>
                    )}
                  </div>
                  {editingId !== group.id && (
                    <div className="flex items-center gap-1">
                      {deleteId === group.id ? (
                        <>
                          <span className="mr-1 text-[11px]" style={{ color: 'var(--eval-muted)' }}>Remove group?</span>
                          <button type="button" disabled={busy} onClick={() => deleteGroup(group.id)} className="eval-btn-primary py-1.5 px-2.5 text-[11px]">Delete</button>
                          <button type="button" onClick={() => setDeleteId('')} className="eval-btn-ghost p-2" aria-label="Cancel delete"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => { setEditingId(group.id); setEditingName(group.name); }} className="eval-btn-secondary p-2" aria-label={`Rename ${group.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => setDeleteId(group.id)} className="eval-btn-ghost p-2" style={{ color: 'var(--status-fail)' }} aria-label={`Delete ${group.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  )}
                  </div>
                  {expanded && editingId !== group.id && (
                    <div className="mt-4 border-t pt-3 space-y-3" style={{ borderColor: 'var(--eval-border)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">Group members</div>
                          <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Select students to add or remove from this group.</div>
                        </div>
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--eval-muted)' }} />
                          <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} className="eval-input w-full py-1.5 pl-8 text-xs" placeholder="Filter students" aria-label="Filter students in group manager" />
                        </div>
                      </div>
                      {visibleEntries.length ? (
                        <div className="max-h-72 overflow-y-auto divide-y rounded-lg" style={{ border: '1px solid var(--eval-border)', borderColor: 'var(--eval-border)' }}>
                          {visibleEntries.map((entry) => {
                            const email = entry.studentEmail || entry.email || '';
                            const member = entry.groupId === group.id;
                            return <label key={entry.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-xs hover:bg-[var(--eval-bg)]">
                              <input type="checkbox" checked={member} disabled={busy} onChange={(event) => setMembership(entry, group.id, event.target.checked)} />
                              <span className="min-w-0 flex-1 truncate font-medium">{entry.displayName || email}</span>
                              <span className="truncate font-mono text-[11px]" style={{ color: 'var(--eval-muted)' }}>{email}</span>
                            </label>;
                          })}
                        </div>
                      ) : <p className="py-4 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>No students match this filter.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
