-- Live Classrooms and Session Reports schema
CREATE TABLE IF NOT EXISTS live_rooms (
  code TEXT PRIMARY KEY,
  quiz_id TEXT,
  subject TEXT,
  title TEXT,
  status TEXT,
  current_index INTEGER DEFAULT 0,
  payload TEXT,
  participants TEXT,
  responses TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_live_rooms_status ON live_rooms(status);
CREATE INDEX IF NOT EXISTS idx_live_rooms_updated ON live_rooms(updated_at DESC);

CREATE TABLE IF NOT EXISTS live_reports (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  quiz_id TEXT,
  subject TEXT,
  title TEXT,
  payload TEXT NOT NULL,
  finished_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_reports_room ON live_reports(room_code);
CREATE INDEX IF NOT EXISTS idx_live_reports_finished ON live_reports(finished_at DESC);
