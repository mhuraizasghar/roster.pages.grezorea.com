import { isWorkspacePath, workspaceRequest } from './workspaceStore';

import { supabase, isSupabaseConfigured } from './supabase';

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

async function request(path, { method = 'GET', body = null, headers = {} } = {}) {
  if (isWorkspacePath(path)) {
    return workspaceRequest(method, path, body);
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
    data = {
      error: /^\s*<!doctype html/i.test(text)
        ? `The API route ${path} is not deployed on this host yet. Redeploy the Roster serverless functions.`
        : text,
    };
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

/** Subscribe to room and participant changes through Supabase Realtime. */
export function connectRoomSocket(roomCode, { onUpdate, onEnded, onStatusChange }) {
  if (!isSupabaseConfigured || !supabase) {
    onStatusChange?.('reconnecting');
    return () => {};
  }
  const code = String(roomCode).toUpperCase();
  let closed = false;
  let refreshing = false;
  const refreshRoom = async () => {
    if (closed || refreshing) return;
    refreshing = true;
    try {
      const result = await workspaceRequest('GET', `/api/rooms/${encodeURIComponent(code)}/state`);
      onUpdate?.(result.room);
      if (result.room.status === 'ended') onEnded?.(result.room);
    } catch { /* A transient update is recovered by the page's polling fallback. */ }
    finally { refreshing = false; }
  };
  onStatusChange?.('connecting');
  const channel = supabase.channel(`roster-live-room-${code}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_live_rooms', filter: `code=eq.${code}` }, refreshRoom)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_live_participants', filter: `room_code=eq.${code}` }, refreshRoom)
    .subscribe((status) => onStatusChange?.(status === 'SUBSCRIBED' ? 'connected' : 'reconnecting'));
  return () => { closed = true; supabase.removeChannel(channel); };
}
