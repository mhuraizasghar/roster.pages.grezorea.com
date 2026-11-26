import { WebSocketServer } from 'ws';

/**
 * WebSocket real-time hub for EVAL Live Classrooms.
 * Broadcasts room state updates instantaneously to subscribed teachers & students.
 */
export function attachWebSocketServer(httpServer, { verifyToken, db, buildRoomViewForUser }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  // Map<roomCode, Set<{ ws, user }>>
  const subscriptions = new Map();

  function joinChannel(code, client) {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean) return;
    if (!subscriptions.has(clean)) subscriptions.set(clean, new Set());
    subscriptions.get(clean).add(client);
    client.rooms.add(clean);
  }

  function leaveAllChannels(client) {
    for (const code of client.rooms) {
      const set = subscriptions.get(code);
      if (set) {
        set.delete(client);
        if (set.size === 0) subscriptions.delete(code);
      }
    }
    client.rooms.clear();
  }

  function broadcastRoom(code, event = 'room:update') {
    const clean = String(code || '').trim().toUpperCase();
    const set = subscriptions.get(clean);
    if (!set || set.size === 0) return;

    const room = db.state.rooms.find((r) => r.code === clean);
    if (!room) return;

    for (const client of set) {
      if (client.ws.readyState !== 1) continue;
      try {
        const payload = buildRoomViewForUser(room, client.user);
        client.ws.send(JSON.stringify({ type: event, code: clean, room: payload, ts: Date.now() }));
      } catch {
        // Ignore broken client send
      }
    }
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const token = url.searchParams.get('token');
    const decoded = token ? verifyToken(token) : null;
    const user = decoded ? db.state.users.find((u) => u.id === decoded.sub) || null : null;

    const client = { ws, user, rooms: new Set(), isAlive: true };

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'subscribe' && msg.code) {
          if (!client.user) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
            return;
          }
          const clean = String(msg.code).trim().toUpperCase();
          const room = db.state.rooms.find((r) => r.code === clean);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            return;
          }
          // Enforce server-side authorization before subscribing
          const isTeacherOwner = client.user.role === 'teacher' && room.teacherId === client.user.id;
          const isAllowedStudent =
            client.user.role === 'student' &&
            (room.openJoin || db.isEmailOnTeacherRoster(room.teacherId, client.user.email));

          if (!isTeacherOwner && !isAllowedStudent) {
            ws.send(JSON.stringify({ type: 'error', message: 'Access denied for this room' }));
            return;
          }
          joinChannel(clean, client);
          ws.send(JSON.stringify({ type: 'room:update', code: clean, room: buildRoomViewForUser(room, client.user), ts: Date.now() }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => leaveAllChannels(client));
    ws.on('error', () => leaveAllChannels(client));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  wss.on('close', () => clearInterval(heartbeat));

  return { wss, broadcastRoom };
}
