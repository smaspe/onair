import { supabase } from "./supabase.js";

// The table behind a signed-in library. One row per show per user, so two devices that mark
// two different shows write two different rows and Postgres settles them on its own.
const TABLE = "progress";

let userId = null;

// `updated_at` is left out on purpose: the table sets it from one clock, so a device with a
// wrong clock cannot win a conflict. `imdb_id` stays null until the proxy asks TMDB for it.
const rowOf = (show) => ({
  user_id: userId,
  show_id: Number(show.id),
  season: show.currentSeason,
  episode: show.currentEpisode,
  rating: show.rating,
  dropped: show.dropped,
  deleted_at: null,
});

// What a row says about a show. Everything else about it comes from TMDB.
export const watchedOf = (row) => ({
  currentSeason: row.season,
  currentEpisode: row.episode,
  rating: row.rating,
  dropped: row.dropped,
});

// Runs once with the session read back from storage, and again on every sign in and sign out.
export const onSession = (handle) =>
  supabase.auth.onAuthStateChange((_, session) => {
    userId = session?.user?.id ?? null;
    handle(userId);
  });

export const pull = async () => {
  const { data, error } = await supabase.from(TABLE).select();
  if (error) throw error;
  return data;
};

// A signed-out reader keeps everything in the browser, so these two do nothing for them.
export const push = async (show) => {
  if (userId && show) await supabase.from(TABLE).upsert(rowOf(show));
};

// A row that is removed outright lets a second device write the show back. The tombstone
// stays, and every read passes over it.
export const bury = async (id) => {
  if (!userId) return;
  await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("show_id", id);
};

// What another device writes, as it writes it. A tab left open for a week would otherwise
// hold stale progress and write a lower episode number over a higher one.
export const follow = (handle) =>
  supabase
    .channel(TABLE)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      // A row removed outright arrives with nothing in it, and names no show to apply it to.
      ({ new: row }) => row?.show_id && handle(row),
    )
    .subscribe();
