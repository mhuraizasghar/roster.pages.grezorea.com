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

function normalizeStoredRoom(row, questions = [], participants = [], host = false, participantId = '') {
  const keyedResponses = {};
  const distributions = {};
  (questions || []).forEach((question, index) => { distributions[index] = {}; });
  const mappedParticipants = (participants || []).map((item) => {
    const responses = item.responses || {};
    keyedResponses[item.id] = Object.fromEntries(Object.entries(responses).map(([index, response]) => [questions[Number(index)]?.id || index, typeof response === 'object' ? response : { response, isCorrect: null, awardedPoints: 0 }]));
    Object.entries(responses).forEach(([index, response]) => {
      const answer = response?.response ?? response;
      const keys = Array.isArray(answer) ? answer : [answer];
      keys.forEach((key) => { const dist = distributions[index] || (distributions[index] = {}); dist[String(key)] = (dist[String(key)] || 0) + 1; });
    });
    return { id: item.id, studentId: item.id, name: item.display_name, displayName: item.display_name, studentEmail: item.student_email, joinedAt: item.joined_at, leftAt: item.left_at || null, totalScore: item.total_score || 0 };
  });
  const room = {
    id: row.code, code: row.code, title: row.title, mode: row.mode, status: row.status,
    currentQuestionIdx: row.current_index || 0, currentIndex: row.current_index || 0,
    revealedCurrent: Boolean(row.revealed_current), openJoin: Boolean(row.open_join),
    questionsCount: questions.length, questions, participants: mappedParticipants,
    participantsCount: Number(row.participant_count ?? mappedParticipants.length), responses: keyedResponses, distributions,
    myResponses: keyedResponses[participantId] || {}, settings: row.settings || {},
    createdAt: row.created_at, updatedAt: row.updated_at,
    teacherName: 'Instructor', leaderboard: mappedParticipants.map((p, index) => ({ rank: index + 1, studentId: p.studentId, displayName: p.displayName, totalScore: p.totalScore })),
  };
  if (!host && row.status !== 'ended' && !row.revealed_current) {
    room.questions = questions.map(({ correctAnswer, acceptedAnswers, explanation, ...q }) => q);
  }
  return room;
}

async function loadSupabaseRoom(code, participantId = '') {
  const { data: row, error } = await supabase.from('roster_live_rooms').select('*').eq('code', String(code).toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Room not found. Check the room code or ask the teacher for a new link.');
  let cachedRole = '';
  try { cachedRole = JSON.parse(localStorage.getItem('roster.auth.user') || 'null')?.role || ''; } catch {}
  const ownerId = cachedRole === 'teacher' ? await getTeacherProfileId() : null;
  const host = Boolean(ownerId && row.teacher_id === ownerId);
  let questions = row.questions || [];
  if (host || row.status === 'ended' || row.revealed_current) {
    const { data: keys, error: keyError } = await supabase.from('roster_live_room_keys').select('questions').eq('code', row.code).maybeSingle();
    if (keyError && host) throw keyError;
    if (keys?.questions) {
      questions = keys.questions.map((q, index) => (row.status === 'ended' || host || (row.revealed_current && index === row.current_index) ? q : { ...row.questions[index] }));
    }
  }
  let participants = [];
  if (host) {
    const { data, error: participantError } = await supabase.from('roster_live_participants').select('*').eq('room_code', row.code).order('joined_at');
    if (participantError) throw participantError;
    participants = data || [];
  } else if (participantId) {
    const { data, error: participantError } = await supabase.rpc('roster_get_my_live_participant', { p_code: row.code, p_participant: participantId });
    if (participantError) throw participantError;
    if (data) participants = [data];
  }
  return { room: normalizeStoredRoom(row, questions, participants || [], host, participantId), host };
}

function buildLiveRoomReport(room) {
  const questions = room.questions || [];
  const studentRows = (room.participants || []).map((participant) => {
    let score = 0;
    let maxScore = 0;
    const answers = questions.map((question) => {
      const points = Number(question.points || 1);
      maxScore += points;
      const saved = room.responses?.[participant.studentId]?.[question.id];
      const response = saved?.response;
      let isCorrect = false;
      if (response !== undefined && response !== null) {
        if (question.type === 'short_answer') {
          const accepted = question.acceptedAnswers?.length ? question.acceptedAnswers : [question.correctAnswer];
          isCorrect = accepted.some((value) => String(value).trim().toLowerCase() === String(response).trim().toLowerCase());
        } else if (Array.isArray(question.correctAnswer) || Array.isArray(response)) {
          isCorrect = JSON.stringify([...(Array.isArray(response) ? response : [response])].sort()) === JSON.stringify([...(Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer])].sort());
        } else isCorrect = response === question.correctAnswer || Number(response) === Number(question.correctAnswer);
      }
      const awardedPoints = isCorrect ? points : 0;
      score += awardedPoints;
      return { id: `ans_${participant.id}_${question.id}`, questionId: question.id, response, isCorrect, awardedPoints, gradedBy: 'auto' };
    });
    return {
      attemptId: participant.id, displayName: participant.displayName, studentEmail: participant.studentEmail,
      status: 'submitted', score, maxScore, percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
      submittedAt: new Date().toISOString(), answers,
    };
  });
  const questionStats = questions.map((question, index) => {
    const correctCount = studentRows.filter((student) => student.answers[index]?.isCorrect).length;
    return { questionId: question.id, index: index + 1, prompt: question.prompt || question.text, correctCount, accuracyPercent: studentRows.length ? Math.round((correctCount / studentRows.length) * 100) : 0 };
  });
  return {
    id: crypto.randomUUID(), type: 'room', roomCode: room.code, code: room.code,
    title: room.title, mode: room.mode, subject: room.subject || 'Live Classroom',
    finishedAt: new Date().toISOString(), questions, studentRows, questionStats,
    mostMissed: questionStats.filter((item) => item.accuracyPercent < 50).sort((a, b) => a.accuracyPercent - b.accuracyPercent),
  };
}

export async function workspaceRequest(method, path, body = {}) {
  const state = read();

  if (isSupabaseConfigured && supabase && /^\/api\/rooms(?:\/|$)/.test(path)) {
    const roomStateMatch = path.match(/^\/api\/rooms\/([^/]+)\/state$/);
    if (method === 'GET' && roomStateMatch) {
      const code = decodeURIComponent(roomStateMatch[1]).toUpperCase();
      const participantId = localStorage.getItem(`roster.room.participant.${code}`) || '';
      const result = await loadSupabaseRoom(code, participantId);
      return { room: result.room };
    }

    if (method === 'GET' && path === '/api/rooms') {
      const teacherId = await getTeacherProfileId();
      if (!teacherId) throw new Error('Sign in to view your live rooms.');
      const { data: rows, error } = await supabase.from('roster_live_rooms').select('*').eq('teacher_id', teacherId).order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      const rooms = (rows || []).map((row) => normalizeStoredRoom(row, row.questions || [], [], true));
      return { rooms };
    }

    if (method === 'POST' && path === '/api/rooms') {
      const teacherId = await getTeacherProfileId();
      if (!teacherId) throw new Error('Sign in to the teacher account before creating a room.');
      const { data: profile, error: profileError } = await supabase.from('users_profile').select('role').eq('id', teacherId).single();
      if (profileError) throw profileError;
      if (profile.role !== 'teacher') throw new Error('Only teacher accounts can create live rooms.');

      let quiz;
      if (body.quickQuestion) {
        const q = body.quickQuestion;
        quiz = { id: `quick_${crypto.randomUUID()}`, title: body.title || 'Quick Question', subject: 'Live Classroom', questions: [{ id: `q_${crypto.randomUUID()}`, type: q.type || 'mcq', prompt: q.prompt, text: q.prompt, options: q.options || [], correctAnswer: q.correctAnswer, acceptedAnswers: q.acceptedAnswers || [], points: q.points || 1, timeLimitSec: q.timeLimitSec || 30 }] };
      } else {
        const { data: savedQuiz, error } = await supabase.from('quizzes').select('*').eq('id', body.quizId).eq('owner_id', teacherId).single();
        if (error) throw new Error('Quiz not found in your Supabase library. Save the quiz and try again.');
        quiz = { id: savedQuiz.id, title: savedQuiz.title, subject: savedQuiz.subject, questions: savedQuiz.draft_questions || [] };
      }
      if (!quiz.questions.length) throw new Error('Add at least one saved question before launching this room.');
      const fullQuestions = quiz.questions.map((q, index) => ({ ...q, id: q.id || `q_${index}`, prompt: q.prompt || q.text || `Question ${index + 1}`, text: q.text || q.prompt || `Question ${index + 1}`, options: Array.isArray(q.options) ? q.options : [] }));
      const publicQuestions = fullQuestions.map(({ correctAnswer, acceptedAnswers, explanation, ...q }) => q);
      const code = String(body.code || `AU-${crypto.randomUUID().replace(/-/g, '').slice(0, 4)}`).toUpperCase();
      const insert = await supabase.from('roster_live_rooms').insert({
        code, teacher_id: teacherId, title: String(body.title || quiz.title || 'Live Classroom').slice(0, 160),
        mode: body.mode || 'teacher_paced', status: 'lobby', current_index: 0, revealed_current: false,
        open_join: Boolean(body.openJoin), questions: publicQuestions,
        settings: body.settings || {},
      }).select('*').single();
      if (insert.error) throw insert.error;
      const { error: keyError } = await supabase.from('roster_live_room_keys').insert({ code, teacher_id: teacherId, questions: fullQuestions });
      if (keyError) {
        await supabase.from('roster_live_rooms').delete().eq('code', code).eq('teacher_id', teacherId);
        throw keyError;
      }
      return { room: normalizeStoredRoom(insert.data, fullQuestions, [], true) };
    }

    const joinMatch = path.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (method === 'POST' && joinMatch) {
      const code = decodeURIComponent(joinMatch[1]).toUpperCase();
      const savedParticipantId = localStorage.getItem(`roster.room.participant.${code}`) || null;
      const { data: joined, error } = await supabase.rpc('roster_join_live_room', { p_code: code, p_name: String(body.studentName || 'Student').trim().slice(0, 80), p_participant: savedParticipantId });
      if (error) throw error;
      const participantId = joined?.participantId;
      if (!participantId) throw new Error('Room join did not return a participant identity.');
      localStorage.setItem(`roster.room.participant.${code}`, participantId);
      const result = await loadSupabaseRoom(code, participantId);
      return { room: result.room };
    }

    const actionMatch = path.match(/^\/api\/rooms\/([^/]+)\/(navigate|reveal|end|answer)$/);
    if (method === 'POST' && actionMatch) {
      const code = decodeURIComponent(actionMatch[1]).toUpperCase();
      const action = actionMatch[2];
      let result;
      if (action === 'answer') {
        const participantId = localStorage.getItem(`roster.room.participant.${code}`);
        if (!participantId) throw new Error('Join this room before submitting an answer.');
        const { error } = await supabase.rpc('roster_submit_live_answer', { p_code: code, p_participant: participantId, p_question: Number(body.questionIndex), p_response: body.response });
        if (error) throw error;
      } else {
        const teacherId = await getTeacherProfileId();
        if (!teacherId) throw new Error('Only the room owner can control this session.');
        const update = action === 'navigate' ? { current_index: Math.max(0, Number(body.questionIndex) || 0), status: 'active' }
          : action === 'reveal' ? { revealed_current: Boolean(body.revealed) }
            : { status: 'ended' };
        const { error } = await supabase.from('roster_live_rooms').update({ ...update, updated_at: iso() }).eq('code', code).eq('teacher_id', teacherId);
        if (error) throw error;
        if (action === 'end') {
          const { room } = await loadSupabaseRoom(code);
          const report = buildLiveRoomReport(room);
          for (const student of report.studentRows) {
            const { error: scoreError } = await supabase.from('roster_live_participants').update({ total_score: student.score }).eq('id', student.attemptId).eq('room_code', code);
            if (scoreError) throw scoreError;
          }
          const { error: reportError } = await supabase.from('roster_live_reports').upsert({ id: report.id, teacher_id: teacherId, room_code: code, payload: report, finished_at: report.finishedAt }, { onConflict: 'room_code' });
          if (reportError) throw reportError;
        }
      }
      result = await loadSupabaseRoom(code, localStorage.getItem(`roster.room.participant.${code}`) || '');
      return { room: result.room, feedback: null };
    }

    const leaveMatch = path.match(/^\/api\/rooms\/([^/]+)\/leave$/);
    if (method === 'POST' && leaveMatch) {
      const code = decodeURIComponent(leaveMatch[1]).toUpperCase();
      const participantId = localStorage.getItem(`roster.room.participant.${code}`);
      if (!participantId) throw new Error('Your participant session was not found.');
      const { error } = await supabase.rpc('roster_leave_live_room', { p_code: code, p_participant: participantId });
      if (error) throw error;
      return { ok: true };
    }
  }

  if (isSupabaseConfigured && supabase && method === 'GET' && path === '/api/reports/overview') {
    const teacherId = await getTeacherProfileId();
    if (!teacherId) throw new Error('Sign in to view your reports.');
    const { data: rows, error } = await supabase.from('roster_live_reports').select('id,room_code,payload,finished_at').eq('teacher_id', teacherId).order('finished_at', { ascending: false });
    if (error) throw error;
    const roomReports = (rows || []).map((row) => {
      const report = row.payload || {};
      const studentRows = report.studentRows || [];
      return { id: row.id, code: row.room_code, title: report.title || 'Live Classroom', mode: report.mode || 'teacher_paced', submissions: studentRows.length, averagePercent: studentRows.length ? Math.round(studentRows.reduce((sum, student) => sum + Number(student.percent || 0), 0) / studentRows.length * 10) / 10 : 0, finishedAt: row.finished_at };
    });
    return { assignmentReports: [], roomReports };
  }

  if (isSupabaseConfigured && supabase && method === 'GET' && path.startsWith('/api/reports/detail')) {
    const params = new URLSearchParams(path.split('?')[1] || '');
    if (params.get('type') === 'room') {
      const teacherId = await getTeacherProfileId();
      const { data: row, error } = await supabase.from('roster_live_reports').select('payload').eq('id', params.get('id')).eq('teacher_id', teacherId).single();
      if (error) throw error;
      return { report: row.payload };
    }
  }

  // Library data is owned by the authenticated instructor and belongs in
  // Supabase. localStorage remains only a development fallback when Supabase
  // has not been configured at all; configured database errors must be shown.
  if (path === '/api/library' && method === 'GET' && isSupabaseConfigured && supabase) {
    const ownerId = await getTeacherProfileId();
    if (!ownerId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
    const [folderResult, quizResult] = await Promise.all([
      supabase.from('folders').select('*').eq('owner_id', ownerId).order('name'),
      supabase.from('quizzes').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }),
    ]);
    if (folderResult.error) throw folderResult.error;
    if (quizResult.error) throw quizResult.error;
    const folders = (folderResult.data || []).map((f) => ({ id: f.id, name: f.name, parentId: f.parent_id, isSubject: f.is_subject, deletedAt: f.deleted_at, createdAt: f.created_at, updatedAt: f.updated_at }));
    const quizzes = (quizResult.data || []).map((q) => ({ id: q.id, title: q.title, subject: q.subject, folderId: q.folder_id, description: q.description || '', settings: q.settings || {}, draftQuestions: q.draft_questions || [], deletedAt: q.deleted_at, createdAt: q.created_at, updatedAt: q.updated_at }));
    return { folders: folders.filter((f) => !f.deletedAt), quizzes: quizzes.filter((q) => !q.deletedAt), trashFolders: folders.filter((f) => f.deletedAt), trashQuizzes: quizzes.filter((q) => q.deletedAt) };
  }

  if (isSupabaseConfigured && supabase && (path === '/api/library/folders' || path === '/api/library/quizzes')) {
    const ownerId = await getTeacherProfileId();
    if (!ownerId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
    if (method === 'POST' && path.endsWith('/folders')) {
      const { data: row, error } = await supabase.from('folders').insert({ owner_id: ownerId, name: String(body.name || '').trim(), parent_id: body.parentId || null, is_subject: Boolean(body.isSubject) }).select('*').single();
      if (error) throw error;
      return { folder: { id: row.id, name: row.name, parentId: row.parent_id, isSubject: row.is_subject, createdAt: row.created_at, updatedAt: row.updated_at } };
    }
    if (method === 'POST' && path.endsWith('/quizzes')) {
      const { data: row, error } = await supabase.from('quizzes').insert({ owner_id: ownerId, title: body.title || 'Untitled Quiz', subject: body.subject || 'General', folder_id: body.folderId || null, description: body.description || '', settings: body.settings || { passMark: 50, shuffleOptions: false }, draft_questions: body.draftQuestions || [] }).select('*').single();
      if (error) throw error;
      return { quiz: { id: row.id, title: row.title, subject: row.subject, folderId: row.folder_id, description: row.description || '', settings: row.settings || {}, draftQuestions: row.draft_questions || [], createdAt: row.created_at, updatedAt: row.updated_at } };
    }
  }

  const libraryMatch = path.match(/^\/api\/library\/(folders|quizzes)\/([^/]+)$/);
  if (libraryMatch && isSupabaseConfigured && supabase) {
    const ownerId = await getTeacherProfileId();
    if (!ownerId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
    const isQuiz = libraryMatch[1] === 'quizzes';
    const table = isQuiz ? 'quizzes' : 'folders';
    const values = isQuiz
      ? { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.subject !== undefined ? { subject: body.subject } : {}), ...(body.folderId !== undefined ? { folder_id: body.folderId } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.settings !== undefined ? { settings: body.settings } : {}), ...(body.draftQuestions !== undefined ? { draft_questions: body.draftQuestions } : {}), ...(body.deletedAt !== undefined ? { deleted_at: body.deletedAt } : {}) }
      : { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.parentId !== undefined ? { parent_id: body.parentId } : {}), ...(body.deletedAt !== undefined ? { deleted_at: body.deletedAt } : {}) };
    if (method === 'PATCH') {
      const { data: row, error } = await supabase.from(table).update(values).eq('id', libraryMatch[2]).eq('owner_id', ownerId).select('*').single();
      if (error) throw error;
      return isQuiz ? { quiz: { id: row.id, title: row.title, subject: row.subject, folderId: row.folder_id, description: row.description || '', settings: row.settings || {}, draftQuestions: row.draft_questions || [], deletedAt: row.deleted_at, updatedAt: row.updated_at } } : { folder: { id: row.id, name: row.name, parentId: row.parent_id, isSubject: row.is_subject, deletedAt: row.deleted_at, updatedAt: row.updated_at } };
    }
    if (method === 'DELETE') {
      const { error } = await supabase.from(table).update({ deleted_at: iso() }).eq('id', libraryMatch[2]).eq('owner_id', ownerId);
      if (error) throw error;
      return { ok: true };
    }
  }

  const restoreMatch = path.match(/^\/api\/library\/(quizzes|folders)\/([^/]+)\/restore$/);
  if (restoreMatch && method === 'POST' && isSupabaseConfigured && supabase) {
    const ownerId = await getTeacherProfileId();
    if (!ownerId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
    const { error } = await supabase.from(restoreMatch[1] === 'quizzes' ? 'quizzes' : 'folders').update({ deleted_at: null }).eq('id', restoreMatch[2]).eq('owner_id', ownerId);
    if (error) throw error;
    return { ok: true };
  }

  const duplicateMatch = path.match(/^\/api\/library\/quizzes\/([^/]+)\/duplicate$/);
  if (duplicateMatch && method === 'POST' && isSupabaseConfigured && supabase) {
    const ownerId = await getTeacherProfileId();
    if (!ownerId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
    const { data: source, error: loadError } = await supabase.from('quizzes').select('*').eq('id', duplicateMatch[1]).eq('owner_id', ownerId).single();
    if (loadError) throw loadError;
    const { data: copy, error } = await supabase.from('quizzes').insert({ owner_id: ownerId, title: `${source.title} (Copy)`, subject: source.subject, folder_id: source.folder_id, description: source.description, settings: source.settings, draft_questions: source.draft_questions }).select('*').single();
    if (error) throw error;
    return { quiz: { id: copy.id, title: copy.title, subject: copy.subject, folderId: copy.folder_id, description: copy.description || '', settings: copy.settings || {}, draftQuestions: copy.draft_questions || [], createdAt: copy.created_at, updatedAt: copy.updated_at } };
  }

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

  if (method === 'PATCH' && path.startsWith('/api/groups/')) {
    const groupId = path.split('/').pop();
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) throw new Error('Group name is required.');
      const { data: updated, error } = await supabase.from('groups').update({ name }).eq('id', groupId).eq('teacher_id', profileId).select('*').maybeSingle();
      if (error?.code === '23505') throw new Error('A group with this name already exists.');
      if (error) throw error;
      if (!updated) throw new Error('Group not found.');
      return data({ group: { id: updated.id, name: updated.name, createdAt: updated.created_at } });
    }
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return Promise.reject(new Error('Group not found'));
    group.name = String(body.name || '').trim();
    write(state);
    return data({ group });
  }

  if (method === 'DELETE' && path.startsWith('/api/groups/')) {
    const groupId = path.split('/').pop();
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const { data: deleted, error } = await supabase.from('groups').delete().eq('id', groupId).eq('teacher_id', profileId).select('id').maybeSingle();
      if (error) throw error;
      if (!deleted) throw new Error('Group not found.');
      return data({ ok: true });
    }
    state.groups = state.groups.filter((item) => item.id !== groupId);
    state.rosterEntries = state.rosterEntries.map((item) => item.groupId === groupId ? { ...item, groupId: null } : item);
    write(state);
    return data({ ok: true });
  }

  if (method === 'POST' && path === '/api/groups') {
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) throw new Error('Group name is required.');
      const { data: created, error } = await supabase.from('groups').insert({ teacher_id: profileId, name }).select('*').single();
      if (error?.code === '23505') throw new Error('A group with this name already exists.');
      if (error) throw error;
      return data({ group: { id: created.id, name: created.name, createdAt: created.created_at } });
    }
    const group = { id: uid('group'), name: body.name, createdAt: iso() }; state.groups.push(group); write(state); return data({ group });
  }

  if (method === 'POST' && path === '/api/roster') {
    const studentEmail = String(body.email || body.studentEmail || '').trim().toLowerCase();
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      {
        if (body.groupId) {
          const { data: group, error: groupError } = await supabase.from('groups').select('id').eq('id', body.groupId).eq('teacher_id', profileId).maybeSingle();
          if (groupError) throw groupError;
          if (!group) throw new Error('Choose a group that belongs to your roster.');
        }
        const { data: created, error } = await supabase.from('roster_entries').upsert({ teacher_id: profileId, student_email: studentEmail, display_name: body.displayName || '', group_id: body.groupId || null, status: 'pending' }, { onConflict: 'teacher_id,student_email' }).select('*').single();
        if (error) throw error;
        return data({ entry: { id: created.id, studentEmail: created.student_email, email: created.student_email, displayName: created.display_name || '', groupId: created.group_id, status: created.status, createdAt: created.created_at, updatedAt: created.updated_at } });
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
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const [existingResult, groupResult] = await Promise.all([
        supabase.from('roster_entries').select('student_email').eq('teacher_id', profileId),
        supabase.from('groups').select('id,name').eq('teacher_id', profileId),
      ]);
      if (existingResult.error) throw existingResult.error;
      if (groupResult.error) throw groupResult.error;
      const existingEmails = new Set((existingResult.data || []).map((entry) => String(entry.student_email).toLowerCase()));
      const groupsByName = new Map((groupResult.data || []).map((group) => [group.name.trim().toLowerCase(), group.id]));
      const allowedGroupIds = new Set((groupResult.data || []).map((group) => group.id));
      const requestedGroups = [...new Set((body.entries || []).map((entry) => String(entry.groupName || '').trim()).filter(Boolean))];
      for (const name of requestedGroups) {
        if (groupsByName.has(name.toLowerCase())) continue;
        const { data: created, error } = await supabase.from('groups').insert({ teacher_id: profileId, name }).select('id,name').single();
        if (error) throw error;
        groupsByName.set(name.toLowerCase(), created.id);
        allowedGroupIds.add(created.id);
      }
      const toInsert = [];
      for (const item of body.entries || []) {
        const studentEmail = String(item.email || item.studentEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) { if (studentEmail) invalid.push(studentEmail); continue; }
        if (existingEmails.has(studentEmail)) { duplicateCount += 1; continue; }
        const groupId = item.groupId || body.groupId || groupsByName.get(String(item.groupName || '').trim().toLowerCase()) || null;
        if (groupId && !allowedGroupIds.has(groupId)) { invalid.push(`${studentEmail} (invalid group)`); continue; }
        toInsert.push({ teacher_id: profileId, student_email: studentEmail, display_name: String(item.displayName || item.name || '').trim().slice(0, 120), group_id: groupId, status: 'pending' });
        existingEmails.add(studentEmail);
      }
      for (let offset = 0; offset < toInsert.length; offset += 250) {
        const { error } = await supabase.from('roster_entries').insert(toInsert.slice(offset, offset + 250));
        if (error) throw error;
        importedCount += Math.min(250, toInsert.length - offset);
      }
      return { importedCount, duplicateCount, invalidCount: invalid.length, invalid };
    }
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
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const updates = {};
      if (Object.prototype.hasOwnProperty.call(body, 'displayName')) updates.display_name = String(body.displayName || '').trim().slice(0, 120);
      if (Object.prototype.hasOwnProperty.call(body, 'groupId')) {
        const groupId = body.groupId || null;
        if (groupId) {
          const { data: group, error: groupError } = await supabase.from('groups').select('id').eq('id', groupId).eq('teacher_id', profileId).maybeSingle();
          if (groupError) throw groupError;
          if (!group) throw new Error('Choose a group that belongs to your roster.');
        }
        updates.group_id = groupId;
      }
      if (!Object.keys(updates).length) throw new Error('No roster changes were provided.');
      updates.updated_at = iso();
      const { data: updated, error } = await supabase.from('roster_entries').update(updates).eq('id', match[1]).eq('teacher_id', profileId).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('Roster entry not found. Refresh the roster and try again.');
      return data({ entry: { id: updated.id, email: updated.student_email, studentEmail: updated.student_email, displayName: updated.display_name || '', groupId: updated.group_id, status: updated.status, createdAt: updated.created_at, updatedAt: updated.updated_at } });
    }
    const entry = state.rosterEntries.find((item) => item.id === match[1]);
    if (!entry) return Promise.reject(new Error('Roster entry not found.'));
    Object.assign(entry, body, { updatedAt: iso() }); write(state); return data({ entry });
  }
  if (match && method === 'DELETE') {
    if (isSupabaseConfigured && supabase) {
      const profileId = await getTeacherProfileId();
      if (!profileId) throw new Error('Your Roster profile is still loading. Sign in again and retry.');
      const { data: removed, error } = await supabase.from('roster_entries').delete().eq('id', match[1]).eq('teacher_id', profileId).select('id').maybeSingle();
      if (error) throw error;
      if (!removed) throw new Error('Roster entry not found. Refresh the roster and try again.');
      return data({ ok: true });
    }
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
