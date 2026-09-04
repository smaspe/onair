import { blank, loadShows, saveShows } from "./storage.js";
import { fetchRecord } from "./tmdb.js";
import { bury, follow, onSession, pull, push, watchedOf } from "./sync.js";
import {
  allWatched,
  knowsNamedSeasons,
  nextWatched,
  previousWatched,
  seasonWatched,
} from "./model/progress.js";
import {
  droppedShows,
  sectionsOf,
  trackedShows,
  upcomingMonths,
} from "./model/lists.js";

// The shows, and every change that can happen to them. Alpine reaches it as $store.library.
export const library = {
  shows: loadShows(),

  get sections() {
    return sectionsOf(this.shows);
  },
  get months() {
    return upcomingMonths(this.shows);
  },
  get dropped() {
    return droppedShows(this.shows);
  },
  get trackedCount() {
    return trackedShows(this.shows).length;
  },
  get upcomingCount() {
    return this.months.reduce(
      (total, month) => total + month.episodes.length,
      0,
    );
  },

  // Settles once every show knows its name and its episodes. Only the watch progress is
  // stored, so until this resolves a show is an id and nothing else.
  ready: Promise.resolve(),

  init() {
    if (Object.keys(this.shows).length) this.ready = this.refresh();

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

  // The server holds the library of a signed-in user and this browser caches it, so a row
  // wins over what is held here.
  async adopt() {
    const rows = await pull();
    for (const row of rows) this.take(row);
    saveShows(this.shows);

    // A show only this browser knows goes up. That is what carries a library built without
    // an account into one on the first sign in.
    const known = new Set(rows.map((row) => row.show_id));
    await Promise.all(
      Object.values(this.shows)
        .filter((show) => !known.has(show.id))
        .map(push),
    );

    // A show only the server knew is an id and nothing else until TMDB answers for it.
    this.ready = Promise.all(
      Object.values(this.shows)
        .filter((show) => !show.name)
        .map((show) => this.reload(show.id)),
    );
    await this.ready;
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
    push(show);
  },

  async add(id) {
    this.shows[id] = await fetchRecord(id, null);
    this.save(this.shows[id]);
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

  step(show, move) {
    const { season, episode } = move(show);
    show.currentSeason = season;
    show.currentEpisode = episode;
    this.save(show);

    // A record carries the episodes of the seasons it was fetched for, so a move into
    // another one has to ask TMDB for its titles.
    if (!knowsNamedSeasons(show)) this.reload(show.id);
  },

  watchNext(show) {
    this.step(show, nextWatched);
  },
  unwatch(show) {
    this.step(show, previousWatched);
  },
  watchSeason(show) {
    this.step(show, seasonWatched);
  },
  catchUp(show) {
    this.step(show, allWatched);
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
    bury(id);
  },
};
