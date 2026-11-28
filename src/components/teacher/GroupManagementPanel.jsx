import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FolderPlus, Pencil, Search, Trash2, Users, X, MoreHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function GroupManagementPanel({ groups = [], entries = [], onRefresh }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [description, setDescription] = useState('');
  const [dialog, setDialog] = useState(null);
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
      await api.post('/api/groups', { name: cleanName, description });
      setName('');
      setDescription('');
      setDialog(null);
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
      await api.patch(`/api/groups/${groupId}`, { name: cleanName, description });
      setEditingId('');
      setEditingName('');
      setDialog(null);
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

      <div className="flex justify-end"><button type="button" onClick={()=>{setName('');setDescription('');setEditingId('');setDialog('create')}} className="eval-btn-primary py-2 px-3 text-xs"><FolderPlus className="h-3.5 w-3.5"/>Create group</button></div>

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
                <li key={group.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    {editingId !== group.id && <button type="button" onClick={() => setExpandedId(expanded ? '' : group.id)} className="eval-btn-ghost p-1" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.name}`}>
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>}
                    <div className="min-w-0"><button type="button" onClick={() => setExpandedId(expanded ? '' : group.id)} className="truncate text-left text-sm font-medium hover:underline">{group.name}</button><div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>{memberCount} students{group.createdAt ? ` · Created ${new Date(group.createdAt).toLocaleDateString()}` : ''}{group.description ? ` · ${group.description}` : ''}</div></div>
                  </div>
                    <div className="flex items-center gap-1">
                      {deleteId === group.id ? (
                        <>
                          <span className="mr-1 text-[11px]" style={{ color: 'var(--eval-muted)' }}>Remove group?</span>
                          <button type="button" disabled={busy} onClick={() => deleteGroup(group.id)} className="eval-btn-primary py-1.5 px-2.5 text-[11px]">Delete</button>
                          <button type="button" onClick={() => setDeleteId('')} className="eval-btn-ghost p-2" aria-label="Cancel delete"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <details className="relative"><summary className="list-none cursor-pointer p-2" aria-label={`Options for ${group.name}`}><MoreHorizontal className="h-4 w-4"/></summary><div className="absolute right-0 z-20 w-36 bg-[var(--eval-bg)] py-1 border-y border-[var(--eval-border)]"><button type="button" onClick={()=>{setName(group.name);setDescription(group.description||'');setEditingId(group.id);setEditingName(group.name);setDialog('edit')}} className="w-full px-3 py-2 text-left text-xs"><Pencil className="mr-2 inline h-3.5 w-3.5"/>Edit group</button><button type="button" onClick={() => setDeleteId(group.id)} className="w-full px-3 py-2 text-left text-xs text-red-700"><Trash2 className="mr-2 inline h-3.5 w-3.5"/>Delete group</button></div></details>
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && editingId !== group.id && (
                      <div className="mt-3 border-t pt-3 space-y-3" style={{ borderColor: 'var(--eval-border)' }}>
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
      {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"><form onSubmit={async(e)=>{if(dialog==='create') await createGroup(e); else {e.preventDefault(); await renameGroup(editingId)}}} className="w-full max-w-md bg-[var(--eval-bg)] p-5 space-y-3" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title"><div><h3 id="group-dialog-title" className="font-semibold">{dialog==='create'?'Create group':'Edit group'}</h3><p className="mt-1 text-xs" style={{color:'var(--eval-muted)'}}>Organize students for assignments and classroom access.</p></div><label className="block text-xs">Group name<input className="eval-input mt-1 w-full text-xs" value={dialog==='edit'?editingName:name} onChange={e=>dialog==='edit'?setEditingName(e.target.value):setName(e.target.value)} maxLength={80} required autoFocus/></label><label className="block text-xs">Description <span style={{color:'var(--eval-muted)'}}>(optional)</span><textarea className="eval-input mt-1 w-full text-xs" rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={300} placeholder="Course, section, or term"/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setDialog(null);setEditingId('')}} className="eval-btn-secondary py-2 text-xs">Cancel</button><button type="submit" disabled={busy} className="eval-btn-primary py-2 text-xs">{dialog==='create'?'Create group':'Save changes'}</button></div></form></div>}
    </section>
  );
}
