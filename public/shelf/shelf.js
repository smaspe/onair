// Pinned: a version range is served with a ten minute cache, an exact one for a year.
import Alpine from "https://esm.sh/alpinejs@3.17.0";
import { library } from "../js/library.js";
import { account } from "../js/account.js";
import { fetchRecord, imageAt, searchTv } from "../js/tmdb.js";
import {
  episodesBehind,
  episodesWatched,
  isEnded,
  nextWatched,
  titleAt,
} from "../js/model/progress.js";
import { STATES, groupsOf, stateOf, totalEpisodes } from "./state.js";

// Written out where there is room for it, and shortened where there is not. `S01E02` is a
// database key, not something to read.
const code = (at) => `Season ${at.season} - Episode ${at.episode}`;
const brief = (at) => `S${at.season} - E${at.episode}`;
const today = () => new Date().toISOString().slice(0, 10);

const airs = (date) => {
  const days = Math.round((new Date(date) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const aired = (date) =>
  new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// A shelf reads a show the way a poster does: a picture, a count, and one line that says what
// happens next. Everything else waits for the sheet.
const shelf = () => ({
  tab: "available",
  open: null,
  // Searching happens over the shelf rather than above it: a result is a way in, not a row.
  finding: false,
  // A show found by searching, held long enough to look at before deciding to track it.
  preview: null,
  // Which seasons the reader has opened. Held here, not on the <details>, because the element
  // is rebuilt when its episodes arrive and would otherwise shut itself.
  unfolded: [],
  query: "",
  results: [],
  note: "",

  get groups() {
    return groupsOf(this.$store.library.shows);
  },
  get showing() {
    return this.groups[this.tab];
  },
  get show() {
    return this.preview ?? (this.open ? this.$store.library.shows[this.open] : null);
  },
  get tracked() {
    return !!this.show && !this.preview;
  },

  tile: (show) => imageAt(show.posterPath, 342),

  // A show with no artwork, or artwork that does not load, stands as its own initials on a
  // colour taken from its id, so the shelf keeps its shape and each gap is still one show.
  hue: (show) => (Number(show.id) * 61) % 360,
  initials: (show) =>
    (show.name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase(),
  // A record fetched before backdrops were kept has none, and the poster stands in.
  hero: (show) =>
    imageAt(show.backdropPath, 780) || imageAt(show.posterPath, 500),
  logo: (show) => imageAt(show.networkLogo, 154),
  behind: episodesBehind,
  nextCode: (show) => code(nextWatched(show)),
  code,
  brief,
  airs,
  aired,
  today,

  through(show) {
    const all = totalEpisodes(show);
    return all ? Math.round((episodesWatched(show) / all) * 100) : 0;
  },

  // One line under a poster, saying what would happen next rather than repeating the badge.
  caption(show) {
    const state = stateOf(show);
    if (state === "available") {
      const at = nextWatched(show);
      return `${brief(at)} · ${titleAt(show, at)}`.replace(/ · $/, "");
    }
    if (state === "comingUp")
      return `${brief(show.upcoming[0])} · ${airs(show.upcoming[0].airDate)}`;
    if (state === "dropped")
      return show.currentEpisode
        ? `stopped at ${brief({ season: show.currentSeason, episode: show.currentEpisode })}`
        : "never started";
    if (state === "finished") return `${totalEpisodes(show)} episodes`;
    return show.network || "still running";
  },

  seasonsOf(show) {
    return show.seasons.map((season) => ({
      ...season,
      episodes: (show.episodes ?? []).filter((e) => e.season === season.number),
      watched:
        season.number < show.currentSeason
          ? season.episodeCount
          : season.number === show.currentSeason
            ? show.currentEpisode
            : 0,
    }));
  },

  fold(show, number, isOpen) {
    this.unfolded = isOpen
      ? [...new Set([...this.unfolded, number])]
      : this.unfolded.filter((n) => n !== number);
    if (isOpen && this.tracked) this.$store.library.openSeason(show, number);
  },

  // The seasons that carry a score. A fall-off is the thing you want to see before you commit.
  get curve() {
    const rated = this.show.seasons.filter((season) => season.score);
    const peak = Math.max(...rated.map((season) => season.score), 1);
    return rated.map((season) => ({
      ...season,
      height: Math.round((season.score / peak) * 100),
      here: season.number === this.show.currentSeason,
    }));
  },

  watchTo(show, season, episode) {
    show.currentSeason = season;
    show.currentEpisode = episode;
    this.$store.library.save(show);
  },

  async run() {
    this.note = "searching…";
    try {
      this.results = await searchTv(this.query);
      this.note = this.results.length ? "" : "nothing found";
    } catch {
      this.results = [];
      this.note = "search failed";
    }
  },

  // A result opens the same sheet a shelved show does, so the decision to track one is made
  // after looking at it rather than before.
  find() {
    this.finding = true;
    this.$nextTick(() => this.$refs.query?.focus());
  },

  // The search is hidden, not thrown away: ⌘K brings back what was found, so looking at one
  // result does not cost the others.
  async look(id) {
    this.finding = false;
    this.unfolded = [];
    this.open = null;
    this.preview = await fetchRecord(id, null);
  },

  // The tracked record replaces the previewed one before the preview goes, or the sheet has
  // no show to draw for as long as the fetch takes and shuts itself in the meantime.
  async track() {
    const id = this.preview.id;
    await this.$store.library.add(id);
    this.open = id;
    this.unfolded = [this.$store.library.shows[id]?.currentSeason].filter(Boolean);
    this.preview = null;
    this.tab = "available";
  },

  shut() {
    if (this.finding) return (this.finding = false);
    this.open = null;
    this.preview = null;
    this.unfolded = [];
  },

  // The season being watched starts unfolded, but it is unfolded like any other: put in the
  // list, and taken out again when the reader closes it. A season held open by a rule cannot
  // be shut.
  look_at(id) {
    this.open = id;
    this.unfolded = [this.$store.library.shows[id]?.currentSeason].filter(Boolean);
  },

  init() {
    addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.shut();
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        this.find();
      }
    });
  },
});

Alpine.store("library", library);
Alpine.data("shelf", shelf);
Alpine.data("account", account);
Alpine.magic("states", () => STATES);
Alpine.magic("isEnded", () => isEnded);
Alpine.start();
