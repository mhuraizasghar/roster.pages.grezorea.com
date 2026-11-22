CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_email ON attempts(email);

CREATE TABLE IF NOT EXISTS scores (
  quiz_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  time_taken INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  attempt_id TEXT,
  PRIMARY KEY (quiz_id, email)
);

CREATE INDEX IF NOT EXISTS idx_scores_quiz ON scores(quiz_id, percent DESC, time_taken ASC);
