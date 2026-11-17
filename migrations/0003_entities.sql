-- Links out and photos, matched once against Wikidata and cached.
-- kind: performer | show | theatre. key: lower-cased name (shows: the show id).
CREATE TABLE entities (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  qid TEXT,                 -- Wikidata item, null when nothing matched confidently
  wikipedia TEXT,
  ibdb TEXT,
  image TEXT,               -- Wikimedia Commons thumbnail (performers only)
  image_page TEXT,
  image_credit TEXT,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);
