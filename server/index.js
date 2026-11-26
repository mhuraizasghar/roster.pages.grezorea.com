import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createDatabase } from './db.js';
import { createRosterApp } from './app.js';
import { attachWebSocketServer } from './ws.js';
import { createMailer } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Load .env into process.env if present (without overriding existing env vars)
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const PORT = Number(process.env.PORT || 3001);

const db = createDatabase();
const mailer = createMailer();
let wsHub = null;

const { app, verifyToken, buildRoomViewForUser } = createRosterApp(db, {
  mailer,
  broadcastRoom: (code, event) => {
    if (wsHub) wsHub.broadcastRoom(code, event);
  },
});

// Serve production Vite build when dist/ exists
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = http.createServer(app);
wsHub = attachWebSocketServer(server, { verifyToken, db, buildRoomViewForUser });

server.listen(PORT, () => {
  const mailStatus = mailer.getStatus();
  console.log(
    `Roster API & WebSocket server running on http://localhost:${PORT} (Resend mailer: ${
      mailStatus.configured ? `enabled from ${mailStatus.fromEmail}` : 'disabled'
    })`
  );
});
