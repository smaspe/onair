const WATCHED_KEY = "onair.watched";
// Which shows have a change the table has not taken. The change itself is not stored here. The
// shows are, so a show is read from them and sent as it stands when the connection returns.
const WAITING_KEY = "onair.waiting";

// The whole of what is worth keeping: which episodes you watched, when you last marked one,
// what you make of the show, and whether you dropped it. Everything else about a show comes
// from TMDB on load.
const WATCHED = ["watched", "markedAt", "rating", "dropped"];

// A show before TMDB has answered: enough shape for the model to read. `watched` is absent
// rather than empty, so that a record which states nothing is told apart from one whose reader
// cleared every episode.
const EMPTY = {
  name: "",
  network: "",
  tvStatus: "",
  seasons: [],
  episodes: [],
  upcoming: [],
  last: null,
};

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
};

export const blank = (id) => ({ ...EMPTY, id: Number(id) });

export const loadShows = () =>
  Object.fromEntries(
    Object.entries(read(WATCHED_KEY)).map(([id, watched]) => [
      id,
      { ...blank(id), ...watched },
    ]),
  );

export const saveShows = (shows) => {
  const watched = {};
  for (const [id, show] of Object.entries(shows)) {
    const kept = Object.fromEntries(
      Object.entries(show).filter(([field]) => WATCHED.includes(field)),
    );
    // An empty set is written as no set at all: both mean that nothing is marked.
    const marks = marksOf(show.watched);
    if (marks) kept.watched = marks;
    else delete kept.watched;
    watched[id] = kept;
  }
  localStorage.setItem(WATCHED_KEY, JSON.stringify(watched));
};

// A show is waiting to be sent, or waiting to be buried. Nothing else can be waiting.
export const loadWaiting = () => read(WAITING_KEY);

export const saveWaiting = (waiting) =>
  localStorage.setItem(WAITING_KEY, JSON.stringify(waiting));

// What a backup contains: the watch data, and nothing that TMDB can say again.
export const exportWatched = () =>
  JSON.stringify(read(WATCHED_KEY), null, 2);

// The marks a file states, read for their shape alone: season numbers against lists of episode
// numbers.
const marksOf = (watched) => {
  if (!watched || typeof watched !== "object" || Array.isArray(watched)) return null;
  const marks = {};
  for (const [season, episodes] of Object.entries(watched)) {
    if (!/^\d+$/.test(season) || !Array.isArray(episodes)) continue;
    const numbers = [...new Set(episodes.map(Number))]
      .filter((episode) => Number.isInteger(episode) && episode > 0)
      .sort((a, b) => a - b);
    if (numbers.length) marks[season] = numbers;
  }
  return Object.keys(marks).length ? marks : null;
};

// What a file says, read for its shape alone. Anything else in it is left out. The shelf it
// lands on is not this function's business: it returns the shows and the library adds them.
export const readBackup = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("That file is not a backup.");

  const watched = {};
  for (const [id, show] of Object.entries(parsed)) {
    if (!/^\d+$/.test(id) || !show || typeof show !== "object") continue;
    const marks = marksOf(show.watched);
    watched[id] = {
      rating: Number(show.rating) || null,
      dropped: Boolean(show.dropped),
      ...(marks ? { watched: marks } : {}),
      // A show nobody has marked states no time, so a file that gives none is not corrected.
      ...(typeof show.markedAt === "string" ? { markedAt: show.markedAt } : {}),
    };
  }
  if (!Object.keys(watched).length) throw new Error("No shows in that file.");
  return watched;
};
