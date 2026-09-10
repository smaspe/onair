const WATCHED_KEY = "onair.watched";
// Which shows have a change the table has not taken. The change itself is not stored here. The
// shows are, so a show is read from them and sent as it stands when the connection returns.
const WAITING_KEY = "onair.waiting";

// The whole of what is worth keeping: which episode you are on, what you make of the show,
// and whether you dropped it. Everything else about a show comes from TMDB on load.
const WATCHED = ["currentSeason", "currentEpisode", "rating", "dropped"];

// A show before TMDB has answered: enough shape for the model to read.
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
    watched[id] = Object.fromEntries(
      Object.entries(show).filter(([field]) => WATCHED.includes(field)),
    );
  }
  localStorage.setItem(WATCHED_KEY, JSON.stringify(watched));
};

// A show is waiting to be sent, or waiting to be buried. Nothing else can be waiting.
export const loadWaiting = () => read(WAITING_KEY);

export const saveWaiting = (waiting) =>
  localStorage.setItem(WAITING_KEY, JSON.stringify(waiting));

// What a backup holds: the watch data, and nothing that TMDB can say again.
export const exportWatched = () => JSON.stringify(read(WATCHED_KEY), null, 2);

// What a file says, read for its shape alone. Anything else in it is left out. The shelf it
// lands on is not this function's business: it returns the shows and the library adds them.
export const readBackup = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("That file is not a backup.");

  const watched = {};
  for (const [id, show] of Object.entries(parsed)) {
    if (!/^\d+$/.test(id) || !show || typeof show !== "object") continue;
    watched[id] = {
      currentSeason: Number(show.currentSeason) || 1,
      currentEpisode: Number(show.currentEpisode) || 0,
      rating: Number(show.rating) || null,
      dropped: Boolean(show.dropped),
    };
  }
  if (!Object.keys(watched).length) throw new Error("No shows in that file.");
  return watched;
};
