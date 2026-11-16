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

// No cache stores an answer of these routes. The cache in front of the Worker, the browser and
// the service worker in public/sw.js each read this header.
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
    // One way to write a season number, so that "01" and "1" are not two seasons.
    if (!/^(0|[1-9]\d{0,3})$/.test(season) || !Array.isArray(episodes)) return null;
    if (!episodes.every((episode) => Number.isInteger(episode) && episode > 0)) return null;
    if (episodes.length) marks[season] = [...new Set(episodes)].sort((a, b) => a - b);
  }
  return marks;
};

// The form `Date.prototype.toISOString` writes. Two such times are in order as text.
const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 10;

// What a body asks to store, as the columns of the row, and the `updated_at` its sender last
// saw. Nothing when any part of the body has the wrong shape.
const changeOf = (body) => {
  if (!isObject(body)) return null;
  const { base = null } = body;
  if (base !== null && !(Number.isSafeInteger(base) && base >= 0)) return null;

  if (body.deleted === true)
    return { base, watched: "{}", marked_at: null, rating: null, dropped: 0, deleted: 1 };

  const marks = marksOf(body.watched);
  const { markedAt = null, rating = null, dropped } = body;
  if (!marks || typeof dropped !== "boolean") return null;
  if (markedAt !== null && !isDate(markedAt)) return null;
  if (rating !== null && !isRating(rating)) return null;

  return {
    base,
    watched: JSON.stringify(marks),
    marked_at: markedAt,
    rating,
    dropped: Number(dropped),
    deleted: 0,
  };
};

// The text of a body, or nothing when the body is over the limit. The read stops at the limit,
// so a body of any size costs the Worker the limit and no more.
const textOf = async (request) => {
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for await (const part of request.body ?? []) {
    size += part.byteLength;
    if (size > MAX_BODY) return null;
    text += decoder.decode(part, { stream: true });
  }
  return text + decoder.decode();
};

const jsonOf = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Every column that an answer states. The hash of the code stays in the database.
const COLUMNS = "show_id, watched, marked_at, rating, dropped, deleted, updated_at";

const find = (database, library, id) =>
  database
    .prepare(`select ${COLUMNS} from progress where library = ?1 and show_id = ?2`)
    .bind(library, id)
    .first();

const read = async (database, library) => {
  const { results } = await database
    .prepare(`select ${COLUMNS} from progress where library = ?1`)
    .bind(library)
    .all();
  return answer(200, { rows: results.map(rowOf) });
};

const write = async (database, library, id, request) => {
  const text = await textOf(request);
  if (text === null) return refuse(413, `the body is over ${MAX_BODY / 1024} KB`);
  const change = changeOf(jsonOf(text));
  if (!change) return refuse(400, "the body is not the progress of one show");
  const { base, ...columns } = change;

  const stored = await find(database, library, id);

  // A caller that has not seen the row as it is would write over a change it does not know.
  // The row goes back to it, and it decides what to send.
  if (stored && (base === null || stored.updated_at > base))
    return answer(409, { row: rowOf(stored) });

  if (!stored) {
    const { count } = await database
      .prepare("select count(*) as count from progress where library = ?1")
      .bind(library)
      .first();
    if (count >= MAX_ROWS) return refuse(507, "this library is full");
  }

  const next = {
    show_id: id,
    ...columns,
    // The clock of the Worker orders the writes, so a device with a wrong clock cannot win.
    // Two writes in the same millisecond still get two different values.
    updated_at: Math.max(Date.now(), (stored?.updated_at ?? 0) + 1),
  };

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
      next.show_id,
      next.watched,
      next.marked_at,
      next.rating,
      next.dropped,
      next.deleted,
      next.updated_at,
      stored?.updated_at ?? null,
    )
    .run();

  if (meta.changes) return answer(200, { row: rowOf(next) });
  return answer(409, { row: rowOf(await find(database, library, id)) });
};

export const sync = async (request, database) => {
  const url = new URL(request.url);
  const show = SHOW.exec(url.pathname);

  // `url.search` is empty for an address that ends in a bare `?`.
  if ((url.pathname !== "/api/sync" && !show) || request.url.includes("?"))
    return refuse(404, "not a sync route");
  const method = show ? "PUT" : "GET";
  if (request.method !== method) return refuse(405, `${method} only`);

  const library = await libraryOf(request);
  if (!library) return refuse(401, "no sync code");

  try {
    return show
      ? await write(database, library, Number(show[1]), request)
      : await read(database, library);
  } catch (failure) {
    console.error("onair: sync failed —", failure.message);
    return refuse(500, "the library could not be reached");
  }
};
