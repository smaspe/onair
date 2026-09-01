import { IMG_BASE } from "./tmdb.js";
import { airsIn, airsSoon, code, formatDate } from "./model/dates.js";
import { episodesBehind, isEnded, nextWatched, seasonLeft, titleAt, watchedAt } from "./model/progress.js";

const codeAt = at => code(at.season, at.episode);

// Everything the markup calls, reachable as $display.
export const display = {
  airsIn, code, formatDate, episodesBehind, isEnded, seasonLeft,

  // the episode the watcher last saw, and the one that comes after it
  watchedCode: show => codeAt(watchedAt(show)),
  watchedTitle: show => titleAt(show, watchedAt(show)),
  nextCode: show => codeAt(nextWatched(show)),
  nextTitle: show => titleAt(show, nextWatched(show)),

  posterUrl: path => path ? IMG_BASE + path : null,

  // "Miniseries · 1 season · 3 episodes", for a show the watcher does not track yet.
  sizeOf: row => {
    if (!row.episodeTotal) return "";
    const seasons = row.seasonTotal === 1 ? "1 season" : `${row.seasonTotal} seasons`;
    return [row.kind, seasons, `${row.episodeTotal} episodes`].filter(Boolean).join(" · ");
  },

  // The next episode to air, as the chip says it, or nothing when none is announced.
  airing: show => {
    const next = show.upcoming?.[0];
    return next && { label: `${codeAt(next)} ${airsIn(next)}`, soon: airsSoon(next) };
  }
};
