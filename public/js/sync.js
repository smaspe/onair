import { client } from "./supabase.js";

// The table behind a signed-in library. One row per show per user, so two devices that mark
// two different shows write two different rows and Postgres settles them on its own.
const TABLE = "progress";

let userId = null;

// `updated_at` is left out on purpose: the table sets it from one clock, so a device with a
// wrong clock cannot win a conflict.
const rowOf = (show) => ({
  user_id: userId,
  show_id: Number(show.id),
  // The furthest episode watched. `watched` is the whole answer; these two are the summary the
  // table has always stored.
  season: show.currentSeason,
  episode: show.currentEpisode,
  // A show TMDB has not answered for yet states no set. Null says so. Writing an empty object
  // would tell another device that every episode was cleared.
  watched: show.watched ?? null,
  rating: show.rating,
  dropped: show.dropped,
  deleted_at: null,
});

// What a row says about a show. Everything else about it comes from TMDB.
//
// A row that states no set leaves the set on this device alone, and the client builds one from
// `season` and `episode` instead. A row that states an empty set means the reader cleared every
// episode, and that is applied. The two are told apart by null, not by emptiness: an empty
// object is true in a condition, so testing the object itself gets this backwards.
export const watchedOf = (row) => ({
  currentSeason: row.season,
  currentEpisode: row.episode,
  rating: row.rating,
  dropped: row.dropped,
  ...(row.watched == null ? {} : { watched: row.watched }),
});

// Runs once with the session read back from storage, and again on every sign in and sign out.
export const onSession = async (handle) => {
  const supabase = await client();
  supabase.auth.onAuthStateChange((_, session) => {
    userId = session?.user?.id ?? null;
    handle(userId);
  });
};

export const pull = async () => {
  const supabase = await client();
  const { data, error } = await supabase.from(TABLE).select();
  if (error) throw error;
  return data;
};

// One write at a time for each show. Two writes that overlap on the wire arrive in either
// order and the row keeps the one that lands last, which is not always the last one made. The
// row then comes back over the subscription and carries that older progress to every device.
const writing = new Map();

const inTurn = (id, write) => {
  const key = Number(id);
  const next = (writing.get(key) ?? Promise.resolve()).then(write);
  writing.set(key, next);
  return next;
};

// Whether the change reached the table. A query is thenable but is not a Promise, so it is
// adopted before it can be caught: it answers with an error of its own, and rejects only when
// the request never left.
const reached = async (request) => {
  const { error } = await Promise.resolve(request).catch((failure) => ({
    error: failure,
  }));
  if (error) console.error("onair: a change did not reach the table —", error.message);
  return !error;
};

// A signed-out reader keeps everything in the browser, so there is nothing for these two to
// send and nothing for the caller to send again later.
export const push = async (show) => {
  if (!userId || !show) return true;
  const supabase = await client();
  return inTurn(show.id, () => reached(supabase.from(TABLE).upsert(rowOf(show))));
};

// A row that is removed outright lets a second device write the show back. The tombstone
// stays, and every read passes over it.
export const bury = async (id) => {
  if (!userId) return true;
  const supabase = await client();
  return inTurn(id, () =>
    reached(
      supabase
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("show_id", id),
    ),
  );
};

// What another device writes, as it writes it. A tab left open for a week would otherwise
// hold stale progress and write a lower episode number over a higher one.
export const follow = async (handle) => {
  const supabase = await client();
  supabase
    .channel(TABLE)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      // A row removed outright arrives with nothing in it, and names no show to apply it to.
      ({ new: row }) => row?.show_id && handle(row),
    )
    .subscribe();
};
