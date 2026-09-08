import { episodesBehind, isEnded } from "./js/model/progress.js";

// The four states a tracked show can be in, and they are four because the old word "caught up"
// covered three of them: nothing to watch and a date announced, nothing to watch and the show
// still running, and nothing to watch because the show is over.
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

export const groupsOf = (shows) => {
  const held = {};
  STATES.forEach((state) => (held[state.key] = []));
  Object.values(shows).forEach((show) => held[stateOf(show)].push(show));
  Object.values(held).forEach((list) =>
    list.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  );
  return held;
};

// How far through the whole run the watcher is, for the bar across each poster. A suggestion
// is drawn by the same card and carries no seasons, because it is not tracked and has no
// progress to show.
export const totalEpisodes = (show) =>
  (show.seasons ?? []).reduce((sum, season) => sum + season.episodeCount, 0);
