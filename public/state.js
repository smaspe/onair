import { episodesBehind, isEnded } from "./js/model/progress.js";

// Every state a tracked show can be in. Having nothing to watch is three of them, because a
// date for the next episode, a running show with no date, and a show that is over each ask
// something different of the watcher.
export const STATES = [
  { key: "available", label: "Available", said: "aired, and you have not seen it" },
  { key: "comingUp", label: "Coming up", said: "a date for the next one" },
  { key: "caughtUp", label: "Caught up", said: "still running, no date yet" },
  { key: "finished", label: "Finished", said: "the show is over" },
  { key: "dropped", label: "Dropped", said: "you stopped watching" },
];

export const stateOf = (show) => {
  if (show.dropped) return "dropped";
  if (episodesBehind(show)) return "available";
  if (show.upcoming?.length) return "comingUp";
  return isEnded(show) ? "finished" : "caughtUp";
};

// The show is called what it is called where it was made.
export const titleOf = (show) => show.originalName || show.name || "";

// A leading article is not part of where a title belongs in a list. Which words are articles
// depends on the language the title is in, so "Las Vegas" files under L and "Les Revenants"
// files under R. A language that is not listed keeps its whole title.
const ARTICLES = {
  en: /^(the|a|an)\s+/i,
  fr: /^(le|la|les|un|une)\s+|^l'/i,
  es: /^(el|la|los|las|un|una)\s+/i,
  de: /^(der|die|das|ein|eine)\s+/i,
  it: /^(il|lo|la|i|gli|le|un|una)\s+/i,
  nl: /^(de|het|een)\s+/i,
};

const filed = (show) => {
  const articles = ARTICLES[show.originalLanguage];
  const title = titleOf(show);
  return articles ? title.replace(articles, "") : title;
};

// How many days ago the last episode arrived, for a show that had one in the last week.
// Anything older is not news and files by title with the rest.
const WEEK = 7;

const daysSince = (show) => {
  if (!show.last?.airDate) return null;
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) -
      new Date(`${show.last.airDate}T00:00:00`)) /
      86400000,
  );
  return days >= 0 && days <= WEEK ? days : null;
};

// A show that gained an episode this week comes first, the newest of them at the top. It is
// the answer to "what is new", which a title sort buries.
const byArrival = (a, b) => {
  const [first, second] = [daysSince(a), daysSince(b)];
  if (first !== null && second !== null) return first - second;
  if (first !== null) return -1;
  if (second !== null) return 1;
  return filed(a).localeCompare(filed(b));
};

export const groupsOf = (shows) => {
  const held = {};
  STATES.forEach((state) => (held[state.key] = []));
  Object.values(shows).forEach((show) => held[stateOf(show)].push(show));
  Object.values(held).forEach((list) => list.sort(byArrival));
  return held;
};

// How far through the whole run the watcher is, for the bar across each poster. A suggestion
// is drawn by the same card and carries no seasons, because it is not tracked and has no
// progress to show.
export const totalEpisodes = (show) =>
  (show.seasons ?? []).reduce((sum, season) => sum + season.episodeCount, 0);
