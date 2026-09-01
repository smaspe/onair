import { loadShows, saveShows, getApiKey } from "./storage.js";
import { fetchRecord } from "./tmdb.js";
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
    if (getApiKey() && Object.keys(this.shows).length)
      this.ready = this.refresh();
  },

  save() {
    saveShows(this.shows);
  },

  async add(id) {
    this.shows[id] = await fetchRecord(id, null);
    this.save();
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
    this.save();

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
    this.save();
  },

  drop(show) {
    show.dropped = true;
    this.save();
  },
  restore(show) {
    show.dropped = false;
    this.save();
  },

  remove(id) {
    delete this.shows[id];
    this.save();
  },
};
