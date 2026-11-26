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

export function workspaceRequest(method, path, body = {}) {
  const state = read();

  if (method === 'GET' && path === '/api/library') return data({ folders: state.folders, quizzes: state.quizzes, trashFolders: state.trashFolders, trashQuizzes: state.trashQuizzes });
  if (method === 'GET' && path === '/api/roster') return data({ entries: state.rosterEntries, groups: state.groups });
  if (method === 'GET' && path === '/api/assignments') return data({ assignments: state.assignments });
  if (method === 'GET' && path === '/api/rooms') return data({ rooms: state.rooms });
  if (method === 'GET' && path === '/api/student/dashboard') return data({ assignments: state.assignments, rooms: state.rooms, attempts: state.attempts });

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
    const group = { id: uid('group'), name: body.name, createdAt: iso() }; state.groups.push(group); write(state); return data({ group });
  }

  if (method === 'POST' && path === '/api/roster') {
    const entry = { id: uid('roster'), email: String(body.email || '').trim().toLowerCase(), displayName: body.displayName || '', groupId: body.groupId || null, status: body.status || 'pending', createdAt: iso(), updatedAt: iso() };
    if (entry.email && !state.rosterEntries.some((item) => item.email === entry.email)) state.rosterEntries.push(entry);
    write(state); return data({ entry });
  }

  if (method === 'POST' && path === '/api/roster/bulk') {
    for (const item of body.entries || []) {
      const entry = { id: uid('roster'), email: String(item.email || '').trim().toLowerCase(), displayName: item.displayName || '', groupId: item.groupId || null, status: item.status || 'pending', createdAt: iso(), updatedAt: iso() };
      if (entry.email && !state.rosterEntries.some((existing) => existing.email === entry.email)) state.rosterEntries.push(entry);
    }
    write(state); return data({ entries: state.rosterEntries });
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
    if (match[2] === 'join') room.participants = room.participants || [];
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
