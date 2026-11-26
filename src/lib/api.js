import { isWorkspacePath, workspaceRequest } from './workspaceStore';

const TOKEN_KEY = 'eval.session.token';

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.errorCode = data.errorCode || null;
    this.actualRole = data.actualRole || null;
    this.expectedRole = data.expectedRole || null;
    this.redirectPath = data.redirectPath || null;
    this.data = data;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage quota errors
  }
}

const CLOUD_ROOM_ORIGIN = 'https://quiz-project-students.pages.dev';

function decodeTokenPayload(token) {
  const segments = String(token || '').split('.');
  for (const encoded of segments) {
    try {
      if (!encoded) continue;
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const json = decodeURIComponent(
        Array.from(atob(padded), (char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      );
      const payload = JSON.parse(json);
      if (payload && typeof payload === 'object') return payload;
    } catch {}
  }
  return null;
}

function readWorkspaceQuiz(quizId) {
  try {
    const state = JSON.parse(localStorage.getItem('roster.workspace.v1') || '{}');
    return (state.quizzes || []).find((quiz) => quiz.id === quizId) || null;
  } catch {
    return null;
  }
}

function normalizeCloudRoom(cloudRoom) {
  if (!cloudRoom) return null;
  const cloudQuestions = Array.isArray(cloudRoom.questions) ? cloudRoom.questions : [];
  const questions = cloudQuestions.map((question, index) => ({
    id: question.id || `q_${index}`,
    prompt: question.prompt || question.text || `Question ${index + 1}`,
    text: question.text || question.prompt || `Question ${index + 1}`,
    type: question.type || 'mcq',
    options: Array.isArray(question.options) ? question.options : [],
    correctAnswer: question.correctAnswer,
    acceptedAnswers: question.acceptedAnswers || [],
    points: question.points || 1,
    timeLimitSec: question.timeLimitSec || 30,
  }));
  const responses = cloudRoom.responses || {};
  const distributions = {};
  questions.forEach((_, questionIndex) => {
    distributions[questionIndex] = {};
  });
  Object.values(responses).forEach((answerMap) => {
    Object.entries(answerMap || {}).forEach(([questionIndex, answerIndex]) => {
      if (!distributions[questionIndex]) distributions[questionIndex] = {};
      const key = String(answerIndex);
      distributions[questionIndex][key] = (distributions[questionIndex][key] || 0) + 1;
    });
  });
  const tokenPayload = decodeTokenPayload(getStoredToken());
  const participantId = localStorage.getItem(`roster.room.participant.${cloudRoom.code}`) || '';
  const myResponses = participantId ? (responses[participantId] || {}) : {};

  return {
    ...cloudRoom,
    status: cloudRoom.status === 'finished' ? 'ended' : (cloudRoom.status === 'lobby' ? 'active' : cloudRoom.status),
    currentQuestionIdx: Number(cloudRoom.currentIndex || 0),
    questions,
    distributions,
    responses,
    myResponses,
    participants: cloudRoom.participants || [],
    mode: cloudRoom.mode || 'teacher_paced',
    title: cloudRoom.title || 'Live Classroom',
  };
}

async function cloudRoomRequest(path, method, body) {
  const origin = CLOUD_ROOM_ORIGIN;

  if (method === 'GET' && path === '/api/rooms') {
    const res = await fetch(`${origin}/api/room?action=list&_t=${Date.now()}`);
    if (!res.ok) throw new Error('Could not load live rooms.');
    const data = await res.json();
    return { rooms: (data.rooms || []).map(normalizeCloudRoom).filter(Boolean) };
  }

  const stateMatch = path.match(/^\/api\/rooms\/([^/]+)\/state$/);
  if (method === 'GET' && stateMatch) {
    const code = decodeURIComponent(stateMatch[1]).toUpperCase();
    const tokenPayload = decodeTokenPayload(getStoredToken());
    const role = tokenPayload?.role === 'teacher' ? 'host' : 'student';
    const res = await fetch(`${origin}/api/room?code=${encodeURIComponent(code)}&role=${role}&_t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Room not found. Check the room code or QR link.');
      throw new Error('Could not load this live room.');
    }
    const data = await res.json();
    return { room: normalizeCloudRoom(data.room) };
  }

  if (method === 'POST' && path === '/api/rooms') {
    let quiz;
    if (body.quickQuestion) {
      const quick = body.quickQuestion;
      quiz = {
        id: `live_quick_${Date.now()}`,
        title: body.title || 'Quick Question',
        subject: 'Live Classroom',
        mode: body.mode,
        settings: body.settings || {},
        questions: [{
          id: 'quick_1',
          type: quick.type,
          prompt: quick.prompt,
          text: quick.prompt,
          options: quick.options || [],
          correctAnswer: quick.correctAnswer,
          acceptedAnswers: quick.acceptedAnswers || [],
          points: quick.points || 1,
          timeLimitSec: quick.timeLimitSec || 30,
        }],
      };
    } else {
      const localQuiz = readWorkspaceQuiz(body.quizId);
      quiz = localQuiz ? {
        ...localQuiz,
        mode: body.mode,
        title: localQuiz.title || body.title || 'Live Assessment',
        subject: localQuiz.subject || 'General',
        questions: (localQuiz.draftQuestions || []).map((question, index) => ({
          id: question.id || `q_${index}`,
          type: question.type || 'mcq',
          prompt: question.prompt || question.text || `Question ${index + 1}`,
          text: question.text || question.prompt || `Question ${index + 1}`,
          options: question.options || [],
          correctAnswer: question.correctAnswer,
          acceptedAnswers: question.acceptedAnswers || [],
          points: question.points || 1,
          timeLimitSec: question.timeLimitSec || 30,
        })),
        settings: { ...(localQuiz.settings || {}), ...(body.settings || {}) },
      } : {
        id: body.quizId,
        title: body.title || 'Live Assessment',
        subject: 'General',
        mode: body.mode,
        settings: body.settings || {},
        questions: [],
      };
    }

    const code = body.code || `AU-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch(`${origin}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', code, quiz }),
    });
    if (!res.ok) throw new Error('Could not create this live room.');
    const data = await res.json();
    const state = await fetch(`${origin}/api/room?code=${encodeURIComponent(data.code)}&role=host&_t=${Date.now()}`);
    const stateData = await state.json();
    const room = normalizeCloudRoom({ ...stateData.room, mode: body.mode, openJoin: body.openJoin });
    return { room };
  }

  const joinMatch = path.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (method === 'POST' && joinMatch) {
    const code = decodeURIComponent(joinMatch[1]).toUpperCase();
    const tokenPayload = decodeTokenPayload(getStoredToken());
    const studentName = String(body.studentName || tokenPayload?.email?.split('@')[0] || 'Student').trim().slice(0, 80);
    let participantId = localStorage.getItem(`roster.room.participant.${code}`) || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(`roster.room.participant.${code}`, participantId);
    const res = await fetch(`${origin}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', code, studentName, participantId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not join this live room.');
    }
    const stateRes = await fetch(`${origin}/api/room?code=${encodeURIComponent(code)}&role=student&_t=${Date.now()}`);
    if (!stateRes.ok) throw new Error('Room not found.');
    const stateData = await stateRes.json();
    const room = normalizeCloudRoom(stateData.room);
    return { room };
  }

  const actionMatch = path.match(/^\/api\/rooms\/([^/]+)\/(navigate|reveal|end|answer)$/);
  if (method === 'POST' && actionMatch) {
    const code = decodeURIComponent(actionMatch[1]).toUpperCase();
    const action = actionMatch[2];
    let cloudAction;
    let payload = { code };
    if (action === 'navigate') { cloudAction = 'navigate'; payload.currentIndex = body.questionIndex; payload.status = 'active'; }
    if (action === 'reveal') { cloudAction = 'reveal'; payload.revealed = body.revealed; }
    if (action === 'end') { cloudAction = 'finish'; payload.report = { id: `report_${code}_${Date.now()}`, roomCode: code, finishedAt: Date.now() }; }
    if (action === 'answer') {
      cloudAction = 'answer';
      payload.participantId = localStorage.getItem(`roster.room.participant.${code}`);
      payload.questionIndex = Number(body.questionIndex || 0);
      payload.answerIndex = Array.isArray(body.response) ? Number(body.response[0] || 0) : Number(body.response || 0);
    }
    const res = await fetch(`${origin}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: cloudAction, ...payload }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Live room update failed.');
    }
    const stateRes = await fetch(`${origin}/api/room?code=${encodeURIComponent(code)}&_t=${Date.now()}`);
    const stateData = await stateRes.json();
    return { room: normalizeCloudRoom(stateData.room), feedback: action === 'answer' ? null : undefined };
  }

  throw new Error(`Unsupported room request: ${method} ${path}`);
}

async function request(path, { method = 'GET', body = null, headers = {} } = {}) {
  if (isWorkspacePath(path)) {
    return workspaceRequest(method, path, body);
  }

  if (/^\/api\/rooms(?:\/|$)/.test(path)) {
    try {
      return await cloudRoomRequest(path, method, body);
    } catch (err) {
      return workspaceRequest(method, path, body);
    }
  }

  const token = getStoredToken();
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body !== null && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers: reqHeaders,
    body: body !== null ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

/**
 * Subscribe to a live room via WebSocket with automatic exponential-backoff reconnection
 * and fallback polling when offline/reconnecting.
 */
export function connectRoomSocket(roomCode, { onUpdate, onEnded, onStatusChange }) {
  let ws = null;
  let closed = false;
  let retryAttempt = 0;
  let reconnectTimer = null;
  let pingTimer = null;

  function connect() {
    if (closed) return;
    const token = getStoredToken();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token || '')}`;

    onStatusChange?.('connecting');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retryAttempt = 0;
      onStatusChange?.('connected');
      ws.send(JSON.stringify({ type: 'subscribe', code: roomCode }));
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'room:update' && msg.room) {
          onUpdate?.(msg.room);
        } else if (msg.type === 'room:ended' && msg.room) {
          onUpdate?.(msg.room);
          onEnded?.(msg.room);
        }
      } catch {
        // Ignore parse error
      }
    };

    ws.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (closed) return;
      onStatusChange?.('reconnecting');
      const delay = Math.min(10000, 600 * Math.pow(1.6, retryAttempt));
      retryAttempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (ws) ws.close();
  };
}
