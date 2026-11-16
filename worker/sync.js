// The sync routes. A library is the set of rows stored under the SHA-256 of one sync code.
//
//   GET /api/sync          every row of the library, tombstones included
//   PUT /api/sync/<show>   one row, written only when the caller has seen the row as it is
//
// The code arrives in the Authorization header. No field of a request names a library, so a
// request reaches the rows of its own code and no others.

const SHOW = /^\/api\/sync\/(\d{1,9})$/;

// 25 characters of Crockford base32. The browser sends this form and no other, so one code has
// one hash.
const CODE = /^Bearer ([0-9A-HJKMNP-TV-Z]{25})$/;

// Anyone can make a library, so one code is limited in what it can store.
const MAX_ROWS = 1000;
const MAX_BODY = 32 * 1024;

// No cache stores an answer of these routes: not the cache in front of the Worker, not the
// browser, not the service worker.
const answer = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const refuse = (status, message) => answer(status, { error: message });

const libraryOf = async (request) => {
  const code = CODE.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!code) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const rowOf = (stored) => ({
  id: stored.show_id,
  watched: JSON.parse(stored.watched),
  markedAt: stored.marked_at,
  rating: stored.rating,
  dropped: Boolean(stored.dropped),
  deleted: Boolean(stored.deleted),
  updatedAt: stored.updated_at,
});

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Season numbers against lists of episode numbers. Each episode is stored once, in order, and a
// season with no episode is left out.
const marksOf = (watched) => {
  if (!isObject(watched)) return null;
  const marks = {};
  for (const [season, episodes] of Object.entries(watched)) {
    if (!/^\d{1,4}$/.test(season) || !Array.isArray(episodes)) return null;
    if (!episodes.every((episode) => Number.isInteger(episode) && episode > 0)) return null;
    if (episodes.length) marks[season] = [...new Set(episodes)].sort((a, b) => a - b);
  }
  return marks;
};

const isDate = (value) =>
  typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));

const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 10;

// What a body asks to store, or nothing when any part of it has the wrong shape.
const changeOf = (body) => {
  if (!isObject(body)) return null;
  const { base = null } = body;
  if (base !== null && !(Number.isSafeInteger(base) && base >= 0)) return null;

  if (body.deleted === true)
    return { base, watched: "{}", markedAt: null, rating: null, dropped: 0, deleted: 1 };

  const marks = marksOf(body.watched);
  const { markedAt = null, rating = null, dropped } = body;
  if (!marks || typeof dropped !== "boolean") return null;
  if (markedAt !== null && !isDate(markedAt)) return null;
  if (rating !== null && !isRating(rating)) return null;

  return {
    base,
    watched: JSON.stringify(marks),
    markedAt,
    rating,
    dropped: Number(dropped),
    deleted: 0,
  };
};

const bodyOf = async (request) => {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY) return { tooLarge: true };
  try {
    return { change: changeOf(JSON.parse(new TextDecoder().decode(bytes))) };
  } catch {
    return { change: null };
  }
};

const find = (database, library, id) =>
  database
    .prepare("select * from progress where library = ?1 and show_id = ?2")
    .bind(library, id)
    .first();

const read = async (database, library) => {
  const { results } = await database
    .prepare("select * from progress where library = ?1")
    .bind(library)
    .all();
  return answer(200, { rows: results.map(rowOf) });
};

const write = async (database, library, id, request) => {
  const { tooLarge, change } = await bodyOf(request);
  if (tooLarge) return refuse(413, "the body is over 32 KB");
  if (!change) return refuse(400, "the body is not the progress of one show");

  const stored = await find(database, library, id);

  // A caller that has not seen the row as it is would write over a change it does not know.
  // The row goes back to it, and it decides what to send.
  if (stored && (change.base === null || stored.updated_at > change.base))
    return answer(409, { row: rowOf(stored) });

  if (!stored) {
    const { held } = await database
      .prepare("select count(*) as held from progress where library = ?1")
      .bind(library)
      .first();
    if (held >= MAX_ROWS) return refuse(507, "this library is full");
  }

  // The clock of the Worker orders the writes, so a device with a wrong clock cannot win. Two
  // writes in the same millisecond still get two different values.
  const updatedAt = Math.max(Date.now(), (stored?.updated_at ?? 0) + 1);

  // The row changes only when it is still the row that was read above. A second write that
  // arrives between the read and this statement changes no row, and is answered as a conflict.
  const { meta } = await database
    .prepare(
      `insert into progress
         (library, show_id, watched, marked_at, rating, dropped, deleted, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       on conflict (library, show_id) do update set
         watched = excluded.watched,
         marked_at = excluded.marked_at,
         rating = excluded.rating,
         dropped = excluded.dropped,
         deleted = excluded.deleted,
         updated_at = excluded.updated_at
       where progress.updated_at = ?9`,
    )
    .bind(
      library,
      id,
      change.watched,
      change.markedAt,
      change.rating,
      change.dropped,
      change.deleted,
      updatedAt,
      stored?.updated_at ?? null,
    )
    .run();

  const row = rowOf(await find(database, library, id));
  return answer(meta.changes ? 200 : 409, { row });
};

export const sync = async (request, database) => {
  const url = new URL(request.url);
  const whole = url.pathname === "/api/sync";
  const show = SHOW.exec(url.pathname);

  if ((!whole && !show) || url.search) return refuse(404, "not a sync route");
  if (request.method !== (whole ? "GET" : "PUT"))
    return refuse(405, whole ? "GET only" : "PUT only");

  const library = await libraryOf(request);
  if (!library) return refuse(401, "no sync code");

  try {
    return whole
      ? await read(database, library)
      : await write(database, library, Number(show[1]), request);
  } catch (failure) {
    console.error("onair: sync failed —", failure.message);
    return refuse(500, "the library could not be reached");
  }
};
