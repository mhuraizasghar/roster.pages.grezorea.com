import React, { useState } from 'react';
import { Check, FolderPlus, Pencil, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function GroupManagementPanel({ groups = [], entries = [], onRefresh }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState('');
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
            No groups yet. Create a group here, then assign students from the Student Roster tab.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {groups.map((group) => {
              const memberCount = entries.filter((entry) => entry.groupId === group.id).length;
              return (
                <li key={group.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
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
                        <div className="truncate text-sm font-medium">{group.name}</div>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
