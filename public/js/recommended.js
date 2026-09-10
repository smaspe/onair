import { fetchRecommendations } from "./tmdb.js";
import { episodesWatched } from "./model/progress.js";
import { rank, weightOf } from "./model/recommend.js";
import { titleOf } from "../state.js";

const SHOWN = 50;

const trackedShows = (shows) =>
  Object.values(shows).filter((show) => !show.dropped);

// What the shows you watch suggest. Alpine reaches it as $store.recommended.
export const recommended = {
  items: [],
  note: "",
  loaded: false,
  genre: "",
  minRating: 0,

  // every genre the suggestions cover, for the filter
  get genres() {
    return [...new Set(this.items.flatMap((item) => item.genres))].sort();
  },

  get visible() {
    return this.items
      .filter((item) => !this.genre || item.genres.includes(this.genre))
      .filter((item) => item.vote >= this.minRating)
      .slice(0, SHOWN);
  },

  // Suggestions cost a request per show, so nothing is asked until the tab is opened.
  async load(shows) {
    if (this.loaded) return;

    // Every show you have started votes, including the ones you think little of.
    const watched = trackedShows(shows).filter((show) => episodesWatched(show));
    if (!watched.length) {
      this.note =
        "Watch an episode of something first, then its suggestions land here.";
      return;
    }

    this.loaded = true;
    this.note = "Reading what your shows suggest…";

    // Each show votes under the name the shelf calls it, because the card says which of your
    // shows put a suggestion there.
    const votes = await Promise.all(
      watched.map(async (source) => ({
        name: titleOf(source),
        weight: weightOf(source),
        suggestions: await fetchRecommendations(source.id).catch(() => []),
      })),
    );

    this.items = rank(votes, new Set(Object.keys(shows)));
    this.note = this.items.length
      ? ""
      : "Nothing suggested yet. Refresh the air dates, or add another show.";
  },

  reload(shows) {
    this.loaded = false;
    this.items = [];
    this.note = "";
    return this.load(shows);
  },
};
