CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quizzes_updated ON quizzes(updated_at DESC);
