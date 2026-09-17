import {
  blank,
  loadShows,
  loadWaiting,
  saveShows,
  saveWaiting,
} from "./storage.js";
import { episodesOf, fetchRecord } from "./tmdb.js";
import { bury, follow, onSession, pull, push, watchedOf } from "./sync.js";
import {
  episodesWatched,
  knowsNamedSeasons,
  lastWatched,
  seen,
  upTo,
} from "./model/progress.js";

// The shows, and every change that can happen to them. Alpine reaches it as $store.library.
export const library = {
  shows: loadShows(),

  // The shows whose last change did not reach the table, each against the write it still needs.
  // The change itself is not stored: a show in this list is sent as it now stands.
  waiting: loadWaiting(),

  get unsent() {
    return Object.keys(this.waiting).length;
  },

  // Settles once every show knows its name and its episodes. Only the watch progress is
  // stored, so until this resolves a show is an id and nothing else.
  ready: Promise.resolve(),

  init() {
    if (Object.keys(this.shows).length) this.ready = this.refresh();
    addEventListener("online", () => this.catchUp());

    let following = false;
    onSession((userId) => {
      if (!userId) return;
      this.adopt().catch(() => {
        /* keep what the browser holds until the next sign in */
      });
      if (following) return;
      following = true;
      follow((row) => this.accept(row));
    });
  },

  // Signing out leaves the device with nothing of that account on it. The table keeps the
  // library, and signing in again brings it back.
  forget() {
    this.shows = {};
    this.waiting = {};
    saveShows(this.shows);
    saveWaiting(this.waiting);
  },

  // Whether the table took the change, and what to do again if it did not.
  settle(id, took, how) {
    if (took) delete this.waiting[id];
    else this.waiting[id] = how;
    saveWaiting(this.waiting);
  },

  // Every change this browser could not send. It is sent before any row is read, or the older
  // row replaces the change and this browser then sends that older row back.
  async catchUp() {
    for (const [id, how] of Object.entries({ ...this.waiting })) {
      const took =
        how === "gone" ? await bury(id) : await push(this.shows[id]);
      this.settle(id, took, how);
    }
  },

  // The server holds the library of a signed-in user and this browser caches it, so a row
  // wins over what is held here.
  async adopt() {
    // A show is sent as it stands, and it stands only once TMDB has answered for it.
    await this.ready;
    await this.catchUp();

    const rows = await pull();
    for (const row of rows) this.take(row);
    saveShows(this.shows);

    // A show only the server knew is an id and nothing else until TMDB answers for it.
    this.ready = Promise.all(
      Object.values(this.shows)
        .filter((show) => !show.name)
        .map((show) => this.reload(show.id)),
    );
    await this.ready;

    // Every show whose row states no set goes up, and so does every show the table never heard
    // of. The second is what carries a library built without an account into one on the first
    // sign in. Both are answered by the set this browser worked out.
    const stated = new Map(rows.map((row) => [row.show_id, row.watched]));
    await Promise.all(
      Object.values(this.shows)
        .filter((show) => stated.get(show.id) == null)
        .map((show) =>
          push(show).then((took) => this.settle(show.id, took, "push")),
        ),
    );
  },

  // A change another device made. It is written straight to storage: sending it back would
  // answer a change with the same change.
  accept(row) {
    this.take(row);
    saveShows(this.shows);
    const show = this.shows[row.show_id];
    if (show && !knowsNamedSeasons(show)) this.reload(show.id);
  },

  take(row) {
    if (row.deleted_at) delete this.shows[row.show_id];
    else
      this.shows[row.show_id] = {
        ...(this.shows[row.show_id] ?? blank(row.show_id)),
        ...watchedOf(row),
      };
  },

  save(show) {
    saveShows(this.shows);
    push(show).then((took) => this.settle(show.id, took, "push"));
  },

  async add(id) {
    this.shows[id] = await fetchRecord(id, null);
    this.save(this.shows[id]);
  },

  // A backup adds to the shelf. A show the file lists takes what the file says about it, a
  // show the file does not list stays as it is, and no show is removed. The imported progress
  // is sent to the table at once, or the next read replaces it with the older row.
  async absorb(watched) {
    const ids = Object.keys(watched);
    for (const id of ids)
      this.shows[id] = { ...(this.shows[id] ?? blank(id)), ...watched[id] };
    saveShows(this.shows);

    await Promise.all(
      ids.map((id) =>
        push(this.shows[id]).then((took) => this.settle(id, took, "push")),
      ),
    );
    this.ready = Promise.all(ids.map((id) => this.reload(id)));
    await this.ready;
    return ids.length;
  },

  // Only the watch progress is stored, so every load asks TMDB what a show is.
  async reload(id) {
    try {
      this.shows[id] = await fetchRecord(id, this.shows[id]);
    } catch {
      /* leave the show as it is until the next try */
    }
  },

  async refresh() {
    await Promise.all(Object.keys(this.shows).map((id) => this.reload(id)));
  },

  // A record carries the episodes of the seasons it was fetched for. A reader who looks at
  // another season asks TMDB for that one, and it is kept for as long as the record is.
  async openSeason(show, number) {
    if (show.episodes.some((episode) => episode.season === number)) return;
    show.episodes = [...show.episodes, ...(await episodesOf(show.id, number))];
  },

  // One episode, marked or cleared.
  mark(show, season, episode, watched) {
    const rest = seen(show, season).filter((one) => one !== episode);
    this.applyMarks(show, {
      ...show.watched,
      [season]: watched ? [...rest, episode].sort((a, b) => a - b) : rest,
    });
  },

  // Every episode up to and including this one, marked. A mark past it stays.
  markUpTo(show, season, episode) {
    const marks = { ...show.watched };
    for (const [number, episodes] of Object.entries(upTo(show, season, episode)))
      marks[number] = [...new Set([...seen(show, number), ...episodes])].sort(
        (a, b) => a - b,
      );
    this.applyMarks(show, marks);
  },

  applyMarks(show, marks) {
    const before = episodesWatched(show);
    show.watched = Object.fromEntries(
      Object.entries(marks).filter(([, episodes]) => episodes.length),
    );
    // When an episode was last marked watched, which a change that only clears marks does not
    // move. Nothing reads it yet.
    if (episodesWatched(show) > before)
      show.markedAt = new Date().toISOString();
    this.save(show);

    // A record carries the episodes of the seasons it was fetched for, so a mark that names
    // another one has to ask TMDB for its titles. The card names the next episode.
    if (!knowsNamedSeasons(show)) this.reload(show.id);
  },

  rate(show, value) {
    show.rating = value || null;
    this.save(show);
  },

  drop(show) {
    show.dropped = true;
    this.save(show);
  },
  restore(show) {
    show.dropped = false;
    this.save(show);
  },

  remove(id) {
    delete this.shows[id];
    saveShows(this.shows);
    bury(id).then((took) => this.settle(id, took, "gone"));
  },
};
