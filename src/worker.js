// Who Was On: API for the site. Static files in public/ are served by Cloudflare before this runs.

const STATUSES = ["billed", "understudy", "standby", "swing", "alternate"];
const SESSION_DAYS = 90;
const COOKIE = "wwo_session";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
const fail = (message, status = 400) => json({ error: message }, status);

const slug = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const normTitle = (s) => slug(s).replace(/^the-/, "");
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
const text = (v, max = 120) => String(v ?? "").trim().slice(0, max);
const now = () => Math.floor(Date.now() / 1000);

function cleanCast(input) {
  const out = [];
  for (const r of Array.isArray(input) ? input.slice(0, 80) : []) {
    if (!r) continue;
    const role = text(r.role), performer = text(r.performer);
    if (role && performer) out.push({ role, performer, status: STATUSES.includes(r.status) ? r.status : "billed" });
  }
  return out;
}
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- sign-in ----------
   Two modes. Private beta (ACCESS_TEAM set): Cloudflare Access sits in front of the whole site, emails the
   code itself and tells us who is signed in. Public (no ACCESS_TEAM): our own email + one-time code. */

let accessKeys = { keys: null, at: 0 };
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function accessEmail(req, env) {
  const token = req.headers.get("cf-access-jwt-assertion");
  const [h, p, sig] = (token || "").split(".");
  if (!sig) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
    const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
    if (payload.iss !== issuer || !(payload.exp > now())) return null;
    if (env.ACCESS_AUD && ![].concat(payload.aud).includes(env.ACCESS_AUD)) return null;
    if (!accessKeys.keys || Date.now() - accessKeys.at > 3600000) {
      const res = await fetch(issuer + "/cdn-cgi/access/certs");
      accessKeys = { keys: (await res.json()).keys || [], at: Date.now() };
    }
    const jwk = accessKeys.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(h + "." + p));
    return ok && payload.email ? String(payload.email).toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

async function currentUser(req, env) {
  if (env.ACCESS_TEAM) {
    const email = await accessEmail(req, env);
    if (!email) return null;
    let user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
    if (!user) {
      user = { id: randomToken(12), email };
      await env.DB.prepare("INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)").bind(user.id, email).run();
      user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
    }
    return user;
  }
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + COOKIE + "=([a-f0-9]{64})"));
  if (!m) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256(m[1]), now()).first();
  return row || null;
}

async function sendLoginCode(env, email, code) {
  if (env.DEV_SHOW_CODES === "true") return { devCode: code }; // local development only
  // Cloudflare Email Service: sent straight from this Worker, no outside mail vendor or API key.
  if (!env.EMAIL) throw new Error("email sending is not switched on");
  await env.EMAIL.send({
    to: email,
    from: { email: env.MAIL_FROM, name: "Who Was On" },
    subject: "Your Who Was On sign-in code: " + code,
    text: "Your sign-in code is " + code + ". It works for 10 minutes. If you didn't ask for it, ignore this email.",
  });
  return {};
}

async function authRequest(req, env) {
  if (env.ACCESS_TEAM) return fail("Sign-in is handled before you reach the site.", 400);
  const { email: raw } = await req.json().catch(() => ({}));
  const email = text(raw, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  const existing = await env.DB.prepare("SELECT expires_at FROM login_codes WHERE email = ?").bind(email).first();
  if (existing && existing.expires_at - now() > 9 * 60) return fail("A code was just sent. Wait a minute before asking again.", 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await env.DB.prepare(
    "INSERT INTO login_codes (email, code_hash, attempts, expires_at) VALUES (?1, ?2, 0, ?3) " +
      "ON CONFLICT(email) DO UPDATE SET code_hash = ?2, attempts = 0, expires_at = ?3",
  ).bind(email, await sha256(email + ":" + code), now() + 600).run();
  try {
    return json({ sent: true, ...(await sendLoginCode(env, email, code)) });
  } catch (e) {
    return fail("The sign-in email couldn't be sent. Try again shortly.", 502);
  }
}

async function authVerify(req, env) {
  const body = await req.json().catch(() => ({}));
  const email = text(body.email, 200).toLowerCase();
  const code = text(body.code, 12).replace(/\D/g, "");
  const row = await env.DB.prepare("SELECT code_hash, attempts, expires_at FROM login_codes WHERE email = ?").bind(email).first();
  if (!row || row.expires_at < now() || row.attempts >= 5) return fail("That code has expired. Ask for a new one.", 401);
  if (row.code_hash !== (await sha256(email + ":" + code))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return fail("That code doesn't match. Check the email and try again.", 401);
  }
  let user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    user = { id: randomToken(12), email };
    await env.DB.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(user.id, email).run();
  }
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), user.id, now() + SESSION_DAYS * 86400),
  ]);
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json({ user: { email: user.email } }, 200, {
    "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  });
}

async function authLogout(req, env) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + COOKIE + "=([a-f0-9]{64})"));
  if (m) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
}

/* ---------- shows and performances ---------- */

const PERF_COLS =
  "p.id, p.show_id AS showId, s.title AS showTitle, p.theatre, p.location, p.date, p.slot, p.source, p.verified, p.edits, p.updated_at AS updatedAt";

function attachCast(perfs, castRows) {
  const byId = new Map(perfs.map((p) => [p.id, { ...p, verified: !!p.verified, cast: [] }]));
  for (const c of castRows) byId.get(c.performance_id)?.cast.push({ role: c.role, performer: c.performer, status: c.status });
  return [...byId.values()];
}

async function listShows(env) {
  const [shows, company] = await env.DB.batch([
    env.DB.prepare("SELECT id, title, theatre, location, opened, closed FROM shows ORDER BY title"),
    env.DB.prepare("SELECT show_id, role, performer FROM show_company ORDER BY show_id, position"),
  ]);
  const byId = new Map(shows.results.map((s) => [s.id, { ...s, company: [] }]));
  for (const c of company.results) byId.get(c.show_id)?.company.push({ role: c.role, performer: c.performer, status: "billed" });
  return json({ shows: [...byId.values()] });
}

async function listPerformances(env, url) {
  const show = url.searchParams.get("show") || null;
  const theatre = url.searchParams.get("theatre") || null;
  const performer = url.searchParams.get("performer") || null;
  const where =
    "(?1 IS NULL OR p.show_id = ?1) AND (?2 IS NULL OR lower(p.theatre) = lower(?2)) AND " +
    "(?3 IS NULL OR EXISTS (SELECT 1 FROM performance_cast c WHERE c.performance_id = p.id AND lower(c.performer) = lower(?3)))";
  const [perfs, cast] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${PERF_COLS} FROM performances p JOIN shows s ON s.id = p.show_id WHERE ${where} ORDER BY p.date DESC LIMIT 200`,
    ).bind(show, theatre, performer),
    env.DB.prepare(
      "SELECT pc.performance_id, pc.role, pc.performer, pc.status FROM performance_cast pc JOIN " +
        `(SELECT p.id FROM performances p WHERE ${where} ORDER BY p.date DESC LIMIT 200) q ON q.id = pc.performance_id ` +
        "ORDER BY pc.performance_id, pc.position",
    ).bind(show, theatre, performer),
  ]);
  return json({ performances: attachCast(perfs.results, cast.results) });
}

async function getPerformance(env, id) {
  const [perf, cast] = await env.DB.batch([
    env.DB.prepare(`SELECT ${PERF_COLS} FROM performances p JOIN shows s ON s.id = p.show_id WHERE p.id = ?`).bind(id),
    env.DB.prepare("SELECT performance_id, role, performer, status FROM performance_cast WHERE performance_id = ? ORDER BY position").bind(id),
  ]);
  return perf.results.length ? attachCast(perf.results, cast.results)[0] : null;
}

async function me(env, user) {
  const signIn = env.ACCESS_TEAM ? "access" : "code";
  if (!user) return json({ user: null, signIn, attendance: [], performances: [] });
  const [att, perfs, cast] = await env.DB.batch([
    env.DB.prepare("SELECT performance_id AS perfId, seat, note FROM attendance WHERE user_id = ?").bind(user.id),
    env.DB.prepare(
      `SELECT ${PERF_COLS} FROM attendance a JOIN performances p ON p.id = a.performance_id JOIN shows s ON s.id = p.show_id WHERE a.user_id = ?`,
    ).bind(user.id),
    env.DB.prepare(
      "SELECT pc.performance_id, pc.role, pc.performer, pc.status FROM attendance a JOIN performance_cast pc ON pc.performance_id = a.performance_id " +
        "WHERE a.user_id = ? ORDER BY pc.performance_id, pc.position",
    ).bind(user.id),
  ]);
  return json({ user: { email: user.email }, signIn, attendance: att.results, performances: attachCast(perfs.results, cast.results) });
}

async function savePerformance(req, env, user) {
  const b = await req.json().catch(() => null);
  if (!b) return fail("Nothing to save.");
  const date = text(b.date, 10), slot = b.slot === "mat" ? "mat" : "eve";
  const theatre = text(b.theatre), location = text(b.location);
  const cast = cleanCast(b.cast);
  if (!validDate(date)) return fail("Pick the date you went.");
  if (Date.parse(date + "T00:00:00Z") > Date.now() + 86400000) return fail("That date hasn't happened yet.");
  if (!theatre) return fail("Type the theatre's name.");
  if (!cast.length) return fail("Add at least one role and performer.");

  let show = null;
  if (b.showId) show = await env.DB.prepare("SELECT id, opened FROM shows WHERE id = ?").bind(text(b.showId, 80)).first();
  if (!show) {
    const title = text(b.newTitle);
    const id = slug(title);
    if (!id) return fail("Type the show's title.");
    const all = await env.DB.prepare("SELECT id, title, opened FROM shows").all();
    show = all.results.find((s) => normTitle(s.title) === normTitle(title)) || null;
    if (!show) {
      await env.DB.prepare("INSERT INTO shows (id, title, theatre, location, source) VALUES (?, ?, ?, ?, 'user')")
        .bind(id, title, theatre, location).run();
      show = { id, opened: null };
    }
  }

  const id = `${show.id}_${date}_${slot}`;
  const prev = await getPerformance(env, id);
  let scanned = false;
  if (b.scanId) scanned = !!(await env.DB.prepare("SELECT id FROM scans WHERE id = ? AND user_id = ?").bind(text(b.scanId, 64), user.id).first());
  const sameCast = prev && JSON.stringify(prev.cast) === JSON.stringify(cast);
  const sameVenue = prev && prev.theatre === theatre && prev.location === location;
  const verified = scanned || (sameCast && prev.verified);
  const changed = !prev || !sameCast || !sameVenue || (verified && !prev.verified);

  if (changed) {
    const source = scanned ? "scan" : !prev && show.opened === date ? "opening" : "manual";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO performances (id, show_id, date, slot, theatre, location, source, verified, edits, updated_at, updated_by) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, datetime('now'), ?9) " +
          "ON CONFLICT(id) DO UPDATE SET theatre = ?5, location = ?6, source = ?7, verified = ?8, edits = edits + 1, updated_at = datetime('now'), updated_by = ?9",
      ).bind(id, show.id, date, slot, theatre, location, source, verified ? 1 : 0, user.id),
      env.DB.prepare("DELETE FROM performance_cast WHERE performance_id = ?").bind(id),
      ...cast.map((c, i) =>
        env.DB.prepare("INSERT INTO performance_cast (performance_id, position, role, performer, status) VALUES (?, ?, ?, ?, ?)")
          .bind(id, i, c.role, c.performer, c.status)),
      env.DB.prepare("INSERT INTO cast_revisions (performance_id, user_id, source, theatre, location, cast_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, user.id, source, theatre, location, JSON.stringify(cast)),
    ]);
  }
  let attendance = null;
  if (b.attend !== false) {
    attendance = { perfId: id, seat: text(b.seat, 40), note: text(b.note, 400) };
    await env.DB.prepare(
      "INSERT INTO attendance (user_id, performance_id, seat, note) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT(user_id, performance_id) DO UPDATE SET seat = ?3, note = ?4",
    ).bind(user.id, id, attendance.seat, attendance.note).run();
  }
  return json({ performance: await getPerformance(env, id), attendance });
}

async function attend(env, user, perfId, on) {
  if (!on) {
    await env.DB.prepare("DELETE FROM attendance WHERE user_id = ? AND performance_id = ?").bind(user.id, perfId).run();
    return json({ ok: true });
  }
  if (!(await env.DB.prepare("SELECT id FROM performances WHERE id = ?").bind(perfId).first())) return fail("That performance isn't in the archive.", 404);
  await env.DB.prepare("INSERT OR IGNORE INTO attendance (user_id, performance_id) VALUES (?, ?)").bind(user.id, perfId).run();
  return json({ attendance: { perfId, seat: "", note: "" } });
}

/* ---------- Playbill scan ---------- */

const SCAN_PROMPT =
  "These photos are from one theatre performance: a Playbill title or cast page, and possibly an understudy slip, cast board or ticket. " +
  'Read them and reply with only one JSON object: {"show": string or null, "theatre": string or null, ' +
  '"location": string or null, "date": "YYYY-MM-DD" or null, "slot": "mat" or "eve" or null, ' +
  '"cast": [{"role": string, "performer": string, "status": "billed"|"understudy"|"standby"|"swing"|"alternate"}]}. ' +
  "List each role once with the person who actually played it at this performance: where a slip or board says a role is played by someone else " +
  "at this performance, use that person and the matching status. Location is the theatre's city and state or country, only if printed. " +
  "Use the date and time only if they are printed on a ticket or slip in the photos. Copy names exactly as printed. " +
  "Use null or leave out anything you cannot read. Do not guess.";

async function scan(req, env, user) {
  if (!env.ANTHROPIC_API_KEY) return fail("Scanning isn't set up yet.", 501);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE user_id = ? AND created_at > datetime('now', '-1 day')").bind(user.id).first();
  if (recent.n >= 30) return fail("You've reached today's scan limit. Type the cast in, or try tomorrow.", 429);
  const form = await req.formData().catch(() => null);
  const files = form ? form.getAll("images").filter((f) => typeof f !== "string").slice(0, 4) : [];
  if (!files.length) return fail("Attach at least one photo.");
  const content = [];
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) return fail("Photos must be JPEG, PNG or WebP, under 5 MB each.");
    content.push({ type: "image", source: { type: "base64", media_type: f.type, data: toBase64(await f.arrayBuffer()) } });
  }
  content.push({ type: "text", text: SCAN_PROMPT });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: 3000, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) return fail("The scan couldn't be read just now. Try again.", 502);
  const data = await res.json();
  const raw = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  let parsed = null;
  try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch (e) { /* handled below */ }
  if (!parsed || typeof parsed !== "object") return fail("Nothing readable came back. Try a sharper, straight-on photo of the cast page.", 422);
  const result = {
    show: text(parsed.show) || null,
    theatre: text(parsed.theatre) || null,
    location: text(parsed.location) || null,
    date: validDate(parsed.date) ? parsed.date : null,
    slot: parsed.slot === "mat" || parsed.slot === "eve" ? parsed.slot : null,
    cast: cleanCast(parsed.cast),
  };
  const scanId = randomToken(16);
  await env.DB.prepare("INSERT INTO scans (id, user_id, result_json) VALUES (?, ?, ?)").bind(scanId, user.id, JSON.stringify(result)).run();
  return json({ scanId, result });
}

/* ---------- router ---------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const path = url.pathname.slice(4), method = req.method;
    try {
      // Writes must come from our own pages.
      if (method !== "GET" && req.headers.get("origin") && req.headers.get("origin") !== url.origin) return fail("Cross-site requests are not allowed.", 403);
      if (method === "GET" && path === "/shows") return listShows(env);
      if (method === "GET" && path === "/performances") return listPerformances(env, url);
      if (method === "POST" && path === "/auth/request") return authRequest(req, env);
      if (method === "POST" && path === "/auth/verify") return authVerify(req, env);
      if (method === "POST" && path === "/auth/logout") return authLogout(req, env);

      const user = await currentUser(req, env);
      if (method === "GET" && path === "/me") return me(env, user);
      if (!user && env.ACCESS_TEAM) return fail("Your sign-in has expired. Reload the page to sign in again.", 401);
      if (!user) return fail("Sign in to do that.", 401);
      if (method === "PUT" && path === "/performances") return savePerformance(req, env, user);
      if (method === "POST" && path === "/scan") return scan(req, env, user);
      const m = path.match(/^\/attendance\/([A-Za-z0-9_-]{1,120})$/);
      if (m && method === "POST") return attend(env, user, m[1], true);
      if (m && method === "DELETE") return attend(env, user, m[1], false);
      return fail("Not found.", 404);
    } catch (e) {
      console.error(e);
      return fail("Something went wrong on our side. Try again.", 500);
    }
  },
};
