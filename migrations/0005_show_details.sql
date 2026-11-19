-- Details the site looks up for a show (opening night, theatre) and a look that evokes its title treatment.
ALTER TABLE shows ADD COLUMN style TEXT;             -- {"font": "...", "c1": "#RRGGBB", "c2": "#RRGGBB"}
ALTER TABLE shows ADD COLUMN facts_source TEXT;      -- the page the lookup relied on
ALTER TABLE shows ADD COLUMN facts_checked_at INTEGER;
