-- The unit of record is the performance: one show, one date, matinee or evening.
CREATE TABLE shows (
  id TEXT PRIMARY KEY,              -- slug of the title
  title TEXT NOT NULL,
  theatre TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  opened TEXT,                      -- YYYY-MM-DD
  closed TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Baseline company for a show, used to pre-fill a performance nobody has logged yet.
CREATE TABLE show_company (
  show_id TEXT NOT NULL REFERENCES shows(id),
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  performer TEXT NOT NULL,
  PRIMARY KEY (show_id, position)
);
CREATE TABLE performances (
  id TEXT PRIMARY KEY,              -- showId_date_slot
  show_id TEXT NOT NULL REFERENCES shows(id),
  date TEXT NOT NULL,               -- YYYY-MM-DD
  slot TEXT NOT NULL CHECK (slot IN ('mat','eve')),
  theatre TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',   -- manual | scan | opening
  verified INTEGER NOT NULL DEFAULT 0,     -- 1 when the current cast came from a Playbill scan
  edits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  UNIQUE (show_id, date, slot)
);
CREATE INDEX performances_by_date ON performances(date DESC);
CREATE TABLE performance_cast (
  performance_id TEXT NOT NULL REFERENCES performances(id),
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  performer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'billed',   -- billed | understudy | standby | swing | alternate
  PRIMARY KEY (performance_id, position)
);
CREATE INDEX cast_by_performer ON performance_cast(performer);
-- Wiki-style history: every change to a performance keeps the full cast it replaced with.
CREATE TABLE cast_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  theatre TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  cast_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX revisions_by_performance ON cast_revisions(performance_id, id DESC);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL        -- unix seconds
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
-- A person's own list of nights. Seat and note are private to them.
CREATE TABLE attendance (
  user_id TEXT NOT NULL REFERENCES users(id),
  performance_id TEXT NOT NULL REFERENCES performances(id),
  seat TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, performance_id)
);
-- A record that a Playbill scan happened (the photos themselves are never stored).
CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
