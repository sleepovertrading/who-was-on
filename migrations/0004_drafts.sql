-- Unfinished nights: private to one person, kept out of the shared archive until they have a real date and cast.
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  show_id TEXT,                     -- null when the show isn't in the archive yet
  show_title TEXT NOT NULL,
  theatre TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',    -- YYYY-MM-DD when known
  date_guess TEXT NOT NULL DEFAULT '',  -- "spring 2016", when it isn't
  slot TEXT NOT NULL DEFAULT 'eve',
  cast_json TEXT NOT NULL DEFAULT '[]',
  seat TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX drafts_by_user ON drafts(user_id);
