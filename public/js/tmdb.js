import { nextWatched } from "./model/progress.js";

// The Worker on this origin holds the TMDB key and forwards these paths. Same origin, so
// no CORS, and no key ever reaches the browser.
const BASE = "/api";
// TMDB serves an image at a set of fixed widths. A box that draws one larger asks for one of
// the larger ones, or the browser scales 185px up and it looks it. A poster is upright and a
// backdrop is wide, and both are addressed this way.
export const imageAt = (path, width) =>
  path ? `https://image.tmdb.org/t/p/w${width}${path}` : "";

// The cache in front of the Worker is keyed on the whole address, so a request with no
// parameters must not carry an empty `?`: that would be a second key for the same answer.
const get = async (path, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(BASE + path + (query ? `?${query}` : ""));
  if (!response.ok) throw new Error("tmdb-error-" + response.status);
  return response.json();
};

// A show the watcher does not track yet: a search hit, or something suggested.
const showRow = (result, names) => ({
  id: result.id,
  name: result.name,
  originalName: result.original_name || "",
  originalLanguage: result.original_language || "",
  posterPath: result.poster_path,
  year: result.first_air_date?.slice(0, 4) || "—",
  vote: result.vote_average,
  votes: result.vote_count,
  overview: result.overview || "",
  genres: (result.genre_ids || [])
    .map((genreId) => names.get(genreId))
    .filter(Boolean),
});

// How long a show is tells a pilot apart from the series it became, and the search
// results do not carry it.
const withSize = async (row) => {
  try {
    const details = await get(`/tv/${row.id}`);
    return {
      ...row,
      seasonTotal: details.number_of_seasons,
      episodeTotal: details.number_of_episodes,
      kind: details.type === "Scripted" ? "" : details.type || "",
    };
  } catch {
    return row;
  }
};

export const searchTv = async (query) => {
  const [data, names] = await Promise.all([
    get("/search/tv", { query }),
    genreNames(),
  ]);
  const rows = (data.results || [])
    .slice(0, 8)
    .map((result) => showRow(result, names));
  return Promise.all(rows.map(withSize));
};

const episodeRef = (episode) => {
  if (!episode || !episode.air_date) return null;
  return {
    season: episode.season_number,
    episode: episode.episode_number,
    airDate: episode.air_date,
    title: episode.name || "",
  };
};

// TMDB names the genres once; recommendations only carry their ids. Every suggested show asks
// for the names at the same moment, so what is held is the request and not its answer: a
// second caller waits for the first request rather than making one of its own.
let genres = null;
const genreNames = () =>
  (genres ??= get("/genre/tv/list")
    .then((data) => new Map((data.genres || []).map((genre) => [genre.id, genre.name])))
    .catch(() => new Map()));

export const fetchRecommendations = async (id) => {
  const [data, names] = await Promise.all([
    get(`/tv/${id}/recommendations`),
    genreNames(),
  ]);
  return (data.results || []).map((result) => showRow(result, names));
};

export const episodesOf = async (id, number) => {
  try {
    const season = await get(`/tv/${id}/season/${number}`);
    return (season.episodes || []).map(episodeRef).filter(Boolean);
  } catch {
    return [];
  }
};

// The stored record for a show. `existing` keeps the watch progress.
export const fetchRecord = async (id, existing) => {
  const details = await get(`/tv/${id}`);
  const seasons = (details.seasons || [])
    .filter((season) => season.season_number > 0 && season.episode_count > 0)
    .map((season) => ({
      number: season.season_number,
      episodeCount: season.episode_count,
      // What everyone made of that season. It arrives with the show, and it is the one
      // number that says whether a series falls off before you commit to it.
      score: season.vote_average || null,
    }));

  const currentSeason = existing?.currentSeason ?? (seasons[0]?.number || 1);
  const currentEpisode = existing?.currentEpisode ?? 0;
  const next = details.next_episode_to_air;

  // The card names three episodes: the one watched, the one after it, and the one still to air.
  const wanted = new Set([
    currentSeason,
    nextWatched({ seasons, currentSeason, currentEpisode }).season,
  ]);
  if (next) wanted.add(next.season_number);
  const episodes = (
    await Promise.all([...wanted].map((number) => episodesOf(id, number)))
  ).flat();

  const upcoming = next
    ? episodes.filter((episode) => episode.airDate >= next.air_date)
    : [];

  return {
    id: details.id,
    name: details.name,
    // What the show is called where it was made. TMDB translates the name to the language of
    // the request, so a French series arrives as "The Bureau" unless this is read.
    originalName: details.original_name || "",
    originalLanguage: details.original_language || "",
    posterPath: details.poster_path,
    // A still from the show, sixteen by nine. A poster is the wrong shape for a wide box.
    backdropPath: details.backdrop_path,
    tagline: details.tagline || "",
    vote: details.vote_average || null,
    network: details.networks?.[0]?.name || "",
    networkLogo: details.networks?.[0]?.logo_path || "",
    tvStatus: details.status || "",
    seasons,
    episodes,
    last: episodeRef(details.last_episode_to_air),
    upcoming: upcoming.length ? upcoming : [episodeRef(next)].filter(Boolean),
    dropped: existing?.dropped || false,
    rating: existing?.rating ?? null,
    currentSeason,
    currentEpisode,
  };
};
