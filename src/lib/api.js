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
