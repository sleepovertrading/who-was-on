# Who Was On

Log the Broadway performance you went to and keep the cast you saw. The unit of record is the performance (show, date, matinee or evening), shared by everyone who was there.

One Cloudflare Worker serves the site (`public/`) and the API (`src/worker.js`), backed by a D1 database (`migrations/`).

## Run locally
    npm install
    cp .dev.vars.example .dev.vars     # DEV_SHOW_CODES=true shows sign-in codes on screen instead of emailing them
    npm run db:local
    npm run dev

## Deploy (one time)
    npx wrangler d1 create who-was-on          # paste the database_id into wrangler.jsonc
    npm run db:remote
    npx wrangler secret put ANTHROPIC_API_KEY  # Playbill scanning
    # Private beta sign-in: set ACCESS_TEAM in wrangler.jsonc, then in the Worker's settings turn on
    # Cloudflare Access for its workers.dev address and list the emails allowed in.
    npm run deploy

## Notes
- Sign-in has two modes, neither with an outside mail vendor and neither storing passwords:
  - Private beta (now): Cloudflare Access, free for up to 50 people, guards the whole site and emails the code. Only invited emails get in.
  - Public launch (later): the site emails its own six-digit codes through Cloudflare Email Service. Needs the Workers Paid plan and a domain; see the comments in `wrangler.jsonc`.
- Playbill photos are sent to the Anthropic API once and never stored; only the extracted cast is kept.
- A performance is marked verified only when its current cast came from a scan. Every change is kept in `cast_revisions`.
- The four seeded shows carry opening-night principals typed from memory. Replace with a sourced import before launch.
- Links out and performer photos come from Wikidata and Wikimedia Commons, matched once per name and cached in `entities`. Matching is strict; unmatched names get search links.
- Unfinished nights (`drafts`) are private to one person and never appear in the shared archive.
- Only a scan of something printed (program, slip, cast board, ticket) marks a performance verified. Screenshots and pasted cast lists fill in the form but stay unconfirmed.
