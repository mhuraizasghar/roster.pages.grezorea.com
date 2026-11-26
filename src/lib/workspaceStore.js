import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'roster.workspace.v1';

const uid = (prefix) => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`;
  return `${prefix}_${String(random).replace(/-/g,'').slice(0,12)}`;
};

const iso = () => new Date().toISOString();

function blank() {
  return {
    folders: [], quizzes: [], trashFolders: [], trashQuizzes: [],
    groups: [], rosterEntries: [], assignments: [], rooms: [], attempts: [], reports: [],
  };
}

function read() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return blank(); }
}

function write(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function data(value) { return Promise.resolve(value); }

export function isWorkspacePath(path) {
  return /^\/api\/(library|roster|groups|assignments|rooms|attempts|reports|student)/.test(path);
}

async function getTeacherProfileId() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData?.session?.user;
  if (!authUser) return null;
  const { data, error } = await supabase
    .from('users_profile')
    .select('id')
    .eq('auth_uid', authUser.id)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export async function workspaceRequest(method, path, body = {}) {
  const state = read();

  if (method === 'GET' && path === '/api/library') return data({ folders: state.folders, quizzes: state.quizzes, trashFolders: state.trashFolders, trashQuizzes: state.trashQuizzes });
  if (method === 'GET' && path === '/api/roster') {
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (profileId) {
        const [groupsResult, rosterResult] = await Promise.all([
          supabase.from('groups').select('*').eq('teacher_id', profileId).order('name'),
          supabase.from('roster_entries').select('*').eq('teacher_id', profileId).order('created_at', { ascending: false }),
        ]);
        if (!groupsResult.error && !rosterResult.error) {
          const groups = (groupsResult.data || []).map((group) => ({ id: group.id, name: group.name, createdAt: group.created_at }));
          const entries = (rosterResult.data || []).map((entry) => ({ id: entry.id, studentEmail: entry.student_email, email: entry.student_email, displayName: entry.display_name || '', groupId: entry.group_id, status: entry.status, createdAt: entry.created_at, updatedAt: entry.updated_at }));
          return data({ entries, groups });
        }
      }
    }
    return data({ entries: state.rosterEntries, groups: state.groups });
  }
  if (method === 'GET' && path === '/api/assignments') return data({ assignments: state.assignments });
  if (method === 'GET' && path === '/api/rooms') return data({ rooms: state.rooms });
  if (method === 'GET' && path === '/api/student/dashboard') {
    let cachedEmail = '';
    try {
      const cached = JSON.parse(localStorage.getItem('roster.auth.user') || 'null');
      cachedEmail = String(cached?.email || '').trim().toLowerCase();
    } catch {}
    const assignments = state.assignments.filter((assignment) => {
      if (assignment.targetType === 'students') return (assignment.targetEmails || []).map((email) => String(email).toLowerCase()).includes(cachedEmail);
      if (assignment.targetType === 'groups') {
        const entry = state.rosterEntries.find((item) => (item.studentEmail || item.email) === cachedEmail);
        return entry ? (assignment.targetGroupIds || []).includes(entry.groupId) : false;
      }
      return assignment.targetType === 'all_roster' || !assignment.targetType;
    });
    return data({ assignments, liveRooms: state.rooms, rooms: state.rooms, attempts: state.attempts, results: [] });
  }

  if (method === 'POST' && path === '/api/library/folders') {
    const folder = { id: uid('folder'), name: body.name, parentId: body.parentId || null, isSubject: Boolean(body.isSubject), deletedAt: null, createdAt: iso(), updatedAt: iso() };
    state.folders.push(folder); write(state); return data({ folder });
  }

  if (method === 'POST' && path === '/api/library/quizzes') {
    const quiz = { id: uid('quiz'), title: body.title || 'Untitled Quiz', subject: body.subject || 'General', folderId: body.folderId || null, description: body.description || '', settings: body.settings || { passMark: 50, shuffleOptions: false }, draftQuestions: body.draftQuestions || [], deletedAt: null, createdAt: iso(), updatedAt: iso() };
    state.quizzes.push(quiz); write(state); return data({ quiz });
  }

  let match = path.match(/^\/api\/library\/quizzes\/([^/]+)$/);
  if (match && method === 'PATCH') {
    const quiz = state.quizzes.find((item) => item.id === match[1]);
    if (!quiz) return Promise.reject(new Error('Quiz not found.'));
    Object.assign(quiz, body, { updatedAt: iso() }); write(state); return data({ quiz });
  }
  match = path.match(/^\/api\/library\/folders\/([^/]+)$/);
  if (match && method === 'PATCH') {
    const folder = state.folders.find((item) => item.id === match[1]);
    if (!folder) return Promise.reject(new Error('Folder not found.'));
    Object.assign(folder, body, { updatedAt: iso() }); write(state); return data({ folder });
  }

  match = path.match(/^\/api\/library\/quizzes\/([^/]+)\/duplicate$/);
  if (match && method === 'POST') {
    const source = state.quizzes.find((item) => item.id === match[1]);
    if (!source) return Promise.reject(new Error('Quiz not found.'));
    const copy = { ...source, id: uid('quiz'), title: `${source.title} (Copy)`, draftQuestions: (source.draftQuestions || []).map((q) => ({ ...q })), deletedAt: null, createdAt: iso(), updatedAt: iso() };
    state.quizzes.push(copy); write(state); return data({ quiz: copy });
  }

  match = path.match(/^\/api\/library\/quizzes\/([^/]+)$/);
  if (match && method === 'DELETE') {
    const index = state.quizzes.findIndex((item) => item.id === match[1]);
    if (index >= 0) { const [quiz] = state.quizzes.splice(index, 1); quiz.deletedAt = iso(); state.trashQuizzes.push(quiz); write(state); }
    return data({ ok: true });
  }

  match = path.match(/^\/api\/library\/folders\/([^/]+)$/);
  if (match && method === 'DELETE') {
    const index = state.folders.findIndex((item) => item.id === match[1]);
    if (index >= 0) { const [folder] = state.folders.splice(index, 1); folder.deletedAt = iso(); state.trashFolders.push(folder); write(state); }
    return data({ ok: true });
  }

  match = path.match(/^\/api\/library\/([^/]+)\/([^/]+)\/restore$/);
  if (match && method === 'POST') {
    const [, kind, itemId] = match;
    const trash = kind === 'quizzes' ? state.trashQuizzes : state.trashFolders;
    const live = kind === 'quizzes' ? state.quizzes : state.folders;
    const index = trash.findIndex((item) => item.id === itemId);
    if (index >= 0) { const [item] = trash.splice(index, 1); item.deletedAt = null; live.push(item); }
    write(state); return data({ ok: true });
  }

  if (method === 'POST' && path === '/api/groups') {
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (profileId) {
        const { data: created, error } = await supabase.from('groups').insert({ teacher_id: profileId, name: body.name }).select('*').single();
        if (!error && created) return data({ group: { id: created.id, name: created.name, createdAt: created.created_at } });
      }
    }
    const group = { id: uid('group'), name: body.name, createdAt: iso() }; state.groups.push(group); write(state); return data({ group });
  }

  if (method === 'POST' && path === '/api/roster') {
    const studentEmail = String(body.email || body.studentEmail || '').trim().toLowerCase();
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (profileId) {
        const { data: created, error } = await supabase.from('roster_entries').upsert({ teacher_id: profileId, student_email: studentEmail, display_name: body.displayName || '', group_id: body.groupId || null, status: 'pending' }, { onConflict: 'teacher_id,student_email' }).select('*').single();
        if (!error && created) return data({ entry: { id: created.id, studentEmail: created.student_email, email: created.student_email, displayName: created.display_name || '', groupId: created.group_id, status: created.status, createdAt: created.created_at, updatedAt: created.updated_at } });
      }
    }
    const entry = { id: uid('roster'), email: studentEmail, studentEmail, displayName: body.displayName || '', groupId: body.groupId || null, status: body.status || 'pending', createdAt: iso(), updatedAt: iso() };
    if (studentEmail && !state.rosterEntries.some((item) => (item.studentEmail || item.email) === studentEmail)) state.rosterEntries.push(entry);
    write(state); return data({ entry });
  }

  if (method === 'POST' && path === '/api/roster/bulk') {
    let importedCount = 0;
    let duplicateCount = 0;
    const invalid = [];
    for (const item of body.entries || []) {
      const studentEmail = String(item.email || item.studentEmail || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
        if (studentEmail) invalid.push(studentEmail);
        continue;
      }
      if (state.rosterEntries.some((existing) => (existing.studentEmail || existing.email) === studentEmail)) {
        duplicateCount += 1;
        continue;
      }
      const namedGroup = state.groups.find((group) => group.name.toLowerCase() === String(item.groupName || '').trim().toLowerCase());
      const entry = { id: uid('roster'), email: studentEmail, studentEmail, displayName: item.displayName || '', groupId: item.groupId || body.groupId || namedGroup?.id || null, status: item.status || 'pending', createdAt: iso(), updatedAt: iso() };
      state.rosterEntries.push(entry);
      importedCount += 1;
    }
    write(state);
    return data({ entries: state.rosterEntries, importedCount, duplicateCount, invalidCount: invalid.length, invalid });
  }

  match = path.match(/^\/api\/roster\/([^/]+)$/);
  if (match && method === 'PATCH') {
    const entry = state.rosterEntries.find((item) => item.id === match[1]);
    if (!entry) return Promise.reject(new Error('Roster entry not found.'));
    Object.assign(entry, body, { updatedAt: iso() }); write(state); return data({ entry });
  }
  if (match && method === 'DELETE') {
    state.rosterEntries = state.rosterEntries.filter((item) => item.id !== match[1]); write(state); return data({ ok: true });
  }

  if (method === 'POST' && path === '/api/assignments') {
    const assignment = { id: uid('assignment'), ...body, status: 'published', createdAt: iso(), updatedAt: iso() }; state.assignments.push(assignment); write(state); return data({ assignment });
  }

  if (method === 'POST' && path === '/api/rooms') {
    const code = body.code || String(Math.floor(100000 + Math.random() * 900000));
    const room = { id: uid('room'), code, status: 'active', currentIndex: 0, participants: [], answers: {}, quizId: body.quizId || null, quiz: body.quiz || null, createdAt: iso(), updatedAt: iso(), ...body }; state.rooms.push(room); write(state); return data({ room });
  }

  match = path.match(/^\/api\/rooms\/([^/]+)\/state$/);
  if (match && method === 'GET') {
    const room = state.rooms.find((item) => item.code === decodeURIComponent(match[1]));
    if (!room) return Promise.reject(new Error('Live room not found.'));
    return data({ room });
  }

  match = path.match(/^\/api\/rooms\/([^/]+)\/(navigate|reveal|end|join|answer)$/);
  if (match && method === 'POST') {
    const room = state.rooms.find((item) => item.code === decodeURIComponent(match[1]));
    if (!room) return Promise.reject(new Error('Live room not found.'));
    if (match[2] === 'navigate') room.currentIndex = body.index ?? room.currentIndex;
    if (match[2] === 'reveal') room.revealAnswer = Boolean(body.reveal);
    if (match[2] === 'end') room.status = 'ended';
    if (match[2] === 'join') {
      room.participants = room.participants || [];
      const participantName = String(body.studentName || 'Student').trim().slice(0, 80);
      if (participantName && !room.participants.some((participant) => participant.name?.toLowerCase() === participantName.toLowerCase())) {
        room.participants.push({ id: uid('participant'), name: participantName, joinedAt: iso(), active: true });
      }
    }
    if (match[2] === 'answer') room.answers = room.answers || {};
    room.updatedAt = iso(); write(state); return data({ room });
  }

  if (method === 'POST' && path === '/api/attempts/start') {
    const attempt = { id: uid('attempt'), assignmentId: body.assignmentId, status: 'in_progress', answers: {}, startedAt: iso(), updatedAt: iso() }; state.attempts.push(attempt); write(state); return data({ attempt });
  }

  match = path.match(/^\/api\/attempts\/([^/]+)\/submit$/);
  if (match && method === 'POST') {
    const attempt = state.attempts.find((item) => item.id === match[1]);
    if (!attempt) return Promise.reject(new Error('Attempt not found.'));
    Object.assign(attempt, body, { status: 'submitted', submittedAt: iso(), updatedAt: iso() }); write(state); return data({ attempt });
  }

  match = path.match(/^\/api\/attempts\/([^/]+)\/answer$/);
  if (match && method === 'PUT') {
    const attempt = state.attempts.find((item) => item.id === match[1]);
    if (!attempt) return Promise.reject(new Error('Attempt not found.'));
    attempt.answers = { ...(attempt.answers || {}), ...(body.answers || {}) }; attempt.updatedAt = iso(); write(state); return data({ attempt });
  }

  if (method === 'GET' && path === '/api/reports/overview') return data({ assignments: state.assignments.length, submissions: state.attempts.length, average: 0, quizzes: state.quizzes.length });
  if (method === 'GET' && path.startsWith('/api/reports/detail')) return data({ report: { attempts: state.attempts, assignments: state.assignments } });

  return Promise.reject(new Error(`Feature unavailable before Supabase migration: ${method} ${path}`));
}
