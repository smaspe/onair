// Pinned: a version range is served with a ten minute cache, an exact one for a year.
import Alpine from "https://esm.sh/alpinejs@3.17.0";
import { library } from "./js/library.js";
import { account } from "./js/account.js";
import { recommended } from "./js/recommended.js";
import { transfer } from "./js/transfer.js";
import { fetchRecord, imageAt, searchTv } from "./js/tmdb.js";
import {
  episodesBehind,
  episodesWatched,
  isEnded,
  isWatched,
  lastWatched,
  missingUpTo,
  nextUnwatched,
  seen,
  titleAt,
} from "./js/model/progress.js";
import { STATES, groupsOf, stateOf, titleOf, totalEpisodes } from "./state.js";

// Written out where there is room for it, and shortened where there is not. `S01E02` is a
// database key, not something to read.
const code = (at) => `Season ${at.season} - Episode ${at.episode}`;
const brief = (at) => `S${at.season} - E${at.episode}`;

// An air date is a calendar day, not an instant. `new Date("2026-09-10")` is midnight at
// Greenwich, which is still the ninth for a reader in the Americas, so the day is built in the
// reader's own time and compared against their own date.
const pad = (number) => String(number).padStart(2, "0");
const dayOf = (date) => new Date(`${date}T00:00:00`);
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const airs = (date) => {
  const days = Math.round((dayOf(date) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return dayOf(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const aired = (date) =>
  dayOf(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// How long ago, for a date inside the last week. `airs` says the same thing forwards.
const since = (date) =>
  Math.round((new Date().setHours(0, 0, 0, 0) - dayOf(date)) / 86400000);

const ago = (days) => {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

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
  // "" follows the system. Anything else is a choice this reader made and it is kept.
  theme: "",
  // The sign-in form is folded away until someone wants it.
  joining: false,

  get groups() {
    return groupsOf(this.$store.library.shows);
  },
  get showing() {
    return this.tab === "discover"
      ? this.$store.recommended.visible
      : this.groups[this.tab];
  },
  // Discover says why it has nothing in its own words, so the shelf does not say it again
  // underneath.
  get bare() {
    return (
      !this.showing.length &&
      !(this.tab === "discover" && this.$store.recommended.note)
    );
  },

  // Suggestions cost a request for every show you watch, so nothing is asked until the tab is
  // opened. A suggestion opens the same sheet a shelved show does.
  go(where) {
    this.tab = where;
    if (where === "discover") this.$store.recommended.load(this.$store.library.shows);
  },
  get show() {
    return this.preview ?? (this.open ? this.$store.library.shows[this.open] : null);
  },
  get tracked() {
    return !!this.show && !this.preview;
  },

  // Changes this browser made that the table has not taken. Only a signed-in reader has a
  // table to be behind: everything a signed-out one does is already where it belongs.
  get waitingHere() {
    return this.$store.account.user ? this.$store.library.unsent : 0;
  },
  get syncSays() {
    if (!this.$store.account.user) return "Sync your shows across devices";
    if (this.waitingHere)
      return `${this.waitingHere} changes have not reached your other devices`;
    return `Signed in as ${this.$store.account.user.email}`;
  },

  tile: (show) => imageAt(show.posterPath, 342),
  title: titleOf,
  // Shown beside the original title only when the two differ.
  translated: (show) =>
    show.originalName && show.originalName !== show.name ? show.name : "",

  // A show with no artwork, or artwork that does not load, stands as its own initials on a
  // colour taken from its id, so the shelf keeps its shape and each gap is still one show.
  hue: (show) => (Number(show.id) * 61) % 360,
  initials: (show) =>
    (titleOf(show) || "?")
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
  nextCode: (show) => {
    const at = nextUnwatched(show);
    return at ? code(at) : "";
  },
  // How far the reader got, for the line that says so.
  furthest: (show) => {
    const at = lastWatched(show);
    return at ? `up to ${code(at)}` : "not started";
  },
  code,
  brief,
  airs,
  aired,
  today,

  through(show) {
    const all = totalEpisodes(show);
    return all ? Math.round((episodesWatched(show) / all) * 100) : 0;
  },

  // The one thing a poster says beyond the picture: what everyone makes of a suggestion, when
  // the next episode comes, or how long ago the last one arrived. How far behind you are does
  // not answer the last of those — a show you are ninety episodes behind on can have had
  // nothing new for years. A week is the window, and past it the poster says nothing.
  chip(show) {
    if (this.tab === "discover")
      return show.vote ? { say: `★ ${show.vote.toFixed(1)}`, kind: "" } : null;
    if (this.tab === "comingUp" && show.upcoming?.length)
      return { say: airs(show.upcoming[0].airDate), kind: "" };

    if (!show.last?.airDate) return null;
    const days = since(show.last.airDate);
    return days >= 0 && days <= 7 ? { say: ago(days), kind: "new" } : null;
  },

  // Which of your shows put a suggestion on the shelf. A caption under a poster has room for
  // one name, so it names one and counts the rest.
  because(show) {
    const from = show.from ?? [];
    if (!from.length) return show.genres?.[0] ?? "";
    const rest = from.length - 1;
    return `because you watch ${from[0]}${rest ? ` +${rest}` : ""}`;
  },

  // The sheet has room for all of them. A record fetched from TMDB includes no reason, so the
  // reason comes from the suggestion the sheet was opened from.
  backing(show) {
    return this.$store.recommended.items.find((item) => item.id === show.id)?.from ?? [];
  },

  // One line under a poster, saying what would happen next rather than repeating the badge.
  caption(show) {
    if (this.tab === "discover") return this.because(show);
    const state = stateOf(show);
    if (state === "available") {
      const at = nextUnwatched(show);
      return at ? `${brief(at)} · ${titleAt(show, at)}`.replace(/ · $/, "") : "";
    }
    if (state === "comingUp")
      return `${brief(show.upcoming[0])} · ${airs(show.upcoming[0].airDate)}`;
    if (state === "dropped") {
      const at = lastWatched(show);
      return at ? `stopped at ${brief(at)}` : "never started";
    }
    if (state === "finished") return `${totalEpisodes(show)} episodes`;
    return show.network || "still running";
  },

  seasonsOf(show) {
    return show.seasons.map((season) => ({
      ...season,
      episodes: (show.episodes ?? []).filter((e) => e.season === season.number),
      watched: seen(show, season.number).filter(
        (episode) => episode <= season.episodeCount,
      ).length,
    }));
  },

  isWatched,

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
      here: season.number === (nextUnwatched(this.show)?.season ?? 0),
    }));
  },

  // Pressing an episode marks that episode, and pressing it again clears it. Nothing before it
  // is touched, because watching out of order and skipping an episode are ordinary.
  //
  // Marking one episode while earlier ones are unmarked is also how somebody who has watched
  // the lot says so, which is what the offer below is for.
  catchUp: null,

  tap(show, season, episode) {
    const watched = isWatched(show, season, episode);
    this.$store.library.mark(show, season, episode, !watched);

    // Counted after the mark, so the episode just pressed is not one of them.
    const behind = watched ? 0 : missingUpTo(show, season, episode);
    this.catchUp = behind ? { season, episode, behind } : null;
  },

  takeCatchUp(show) {
    this.$store.library.markUpTo(show, this.catchUp.season, this.catchUp.episode);
    this.catchUp = null;
  },

  // Typing settles before the search runs, so a title costs one request rather than one per
  // letter. The number that comes back names the search it belongs to, and a slow answer to
  // an older search is dropped.
  asked: 0,
  pending: 0,

  typed() {
    clearTimeout(this.pending);
    if (!this.query.trim()) {
      this.results = [];
      this.note = "";
      return;
    }
    this.pending = setTimeout(() => this.run(), 600);
  },

  async run() {
    clearTimeout(this.pending);
    if (!this.query.trim()) return;
    const mine = ++this.asked;
    this.note = "searching…";
    try {
      const found = await searchTv(this.query);
      if (mine !== this.asked) return;
      this.results = found;
      this.note = found.length ? "" : "nothing found";
    } catch {
      if (mine !== this.asked) return;
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
    this.catchUp = null;
    this.open = null;
    this.preview = await fetchRecord(id, null);
  },

  // The tracked record replaces the previewed one before the preview goes, or the sheet has
  // no show to draw for as long as the fetch takes and shuts itself in the meantime.
  // Marks the show that has just arrived, so the shelf can say where it landed. A shelf sorts
  // by title, so a new poster appears wherever its name puts it and not at the end.
  arrived: null,
  fading: 0,

  async track() {
    const id = this.preview.id;
    await this.$store.library.add(id);
    this.open = id;
    this.unfolded = this.opening(id);
    this.preview = null;
    this.tab = "available";
    this.arrived = id;
    clearTimeout(this.fading);
    this.fading = setTimeout(() => (this.arrived = null), 4000);
  },

  // Once the sheet is closed, the card it left behind is brought into view.
  reveal() {
    if (!this.arrived) return;
    this.$nextTick(() =>
      document
        .querySelector(`[data-show="${this.arrived}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  },

  shut() {
    if (this.joining) return (this.joining = false);
    if (this.finding) return (this.finding = false);
    this.open = null;
    this.preview = null;
    this.unfolded = [];
    this.catchUp = null;
    this.reveal();
  },

  // The season with the next episode to watch starts unfolded, but it is unfolded like any
  // other: put in the list, and taken out again when the reader closes it. A season held open
  // by a rule cannot be shut.
  opening(id) {
    const show = this.$store.library.shows[id];
    return [show && nextUnwatched(show)?.season].filter(Boolean);
  },

  look_at(id) {
    this.open = id;
    this.catchUp = null;
    this.unfolded = this.opening(id);
  },

  // Three answers, and the third one is to have no answer: no attribute and no stored key,
  // which is what leaves the page following the system.
  themes: [
    { value: "light", mark: "☀", name: "Bright" },
    { value: "dark", mark: "☾", name: "Dark" },
    { value: "", mark: "◐", name: "Auto" },
  ],

  pick(choice) {
    this.theme = choice;
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    try {
      if (choice) localStorage.setItem("onair.theme", choice);
      else localStorage.removeItem("onair.theme");
    } catch {
      /* the choice holds for this page either way */
    }
  },

  // The page is drawn from the copy the worker held, so a page that has been deployed since is
  // already on screen by the time the worker finds out. Starting again is the reader's to make.
  renewed: false,

  init() {
    this.theme = document.documentElement.dataset.theme || "";
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.onair === "renewed") this.renewed = true;
    });
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
Alpine.store("recommended", recommended);
Alpine.store("account", account);
Alpine.data("shelf", shelf);
Alpine.data("transfer", transfer);
Alpine.magic("states", () => STATES);
Alpine.magic("isEnded", () => isEnded);
Alpine.start();
