import { getApiKey } from "./storage.js";
import { nextWatched } from "./model/progress.js";

const BASE = "https://api.themoviedb.org/3";
// Wide enough to stay sharp on a dense screen: the posters are drawn at most 52px across.
export const IMG_BASE = "https://image.tmdb.org/t/p/w185";

const get = async (path, params = {}) => {
  const key = getApiKey();
  if (!key) throw new Error("no-api-key");
  const query = new URLSearchParams({ ...params, api_key: key });
  const response = await fetch(`${BASE}${path}?${query}`);
  if (!response.ok) throw new Error("tmdb-error-" + response.status);
  return response.json();
};

// A show the watcher does not track yet: a search hit, or something suggested.
const showRow = (result, names) => ({
  id: result.id,
  name: result.name,
  posterPath: result.poster_path,
  year: result.first_air_date?.slice(0, 4) || "—",
  vote: result.vote_average,
  votes: result.vote_count,
  overview: result.overview || "",
  genres: (result.genre_ids || []).map(genreId => names.get(genreId)).filter(Boolean)
});

// How long a show is tells a pilot apart from the series it became, and the search
// results do not carry it.
const withSize = async row => {
  try {
    const details = await get(`/tv/${row.id}`);
    return {
      ...row,
      seasonTotal: details.number_of_seasons,
      episodeTotal: details.number_of_episodes,
      kind: details.type === "Scripted" ? "" : details.type || ""
    };
  } catch { return row; }
};

export const searchTv = async query => {
  const [data, names] = await Promise.all([
    get("/search/tv", { query, include_adult: "false" }),
    genreNames()
  ]);
  const rows = (data.results || []).slice(0, 8).map(result => showRow(result, names));
  return Promise.all(rows.map(withSize));
};

// An episode with no title of its own is named "Episode 5", which only repeats its number.
const PLACEHOLDER = /^episode \d+$/i;

const episodeRef = episode => {
  if (!episode || !episode.air_date) return null;
  const name = episode.name || "";
  return {
    season: episode.season_number,
    episode: episode.episode_number,
    airDate: episode.air_date,
    title: PLACEHOLDER.test(name) ? "" : name
  };
};

// TMDB names the genres once; recommendations only carry their ids.
let genres = null;
const genreNames = async () => {
  if (!genres){
    try {
      const data = await get("/genre/tv/list");
      genres = new Map((data.genres || []).map(genre => [genre.id, genre.name]));
    } catch { genres = new Map(); }
  }
  return genres;
};

export const fetchRecommendations = async id => {
  const [data, names] = await Promise.all([get(`/tv/${id}/recommendations`), genreNames()]);
  return (data.results || []).map(result => showRow(result, names));
};

const episodesOf = async (id, number) => {
  try {
    const season = await get(`/tv/${id}/season/${number}`);
    return (season.episodes || []).map(episodeRef).filter(Boolean);
  } catch { return []; }
};

// The stored record for a show. `existing` keeps the watch progress.
export const fetchRecord = async (id, existing) => {
  const details = await get(`/tv/${id}`);
  const seasons = (details.seasons || [])
    .filter(season => season.season_number > 0 && season.episode_count > 0)
    .map(season => ({ number: season.season_number, episodeCount: season.episode_count }));

  const currentSeason = existing?.currentSeason ?? (seasons[0]?.number || 1);
  const currentEpisode = existing?.currentEpisode ?? 0;
  const next = details.next_episode_to_air;

  // The card names three episodes: the one watched, the one after it, and the one still to air.
  const wanted = new Set([currentSeason, nextWatched({ seasons, currentSeason, currentEpisode }).season]);
  if (next) wanted.add(next.season_number);
  const episodes = (await Promise.all([...wanted].map(number => episodesOf(id, number)))).flat();

  const upcoming = next ? episodes.filter(episode => episode.airDate >= next.air_date) : [];

  return {
    id: details.id,
    name: details.name,
    posterPath: details.poster_path,
    network: details.networks?.[0]?.name || "",
    tvStatus: details.status || "",
    seasons,
    episodes,
    last: episodeRef(details.last_episode_to_air),
    upcoming: upcoming.length ? upcoming : [episodeRef(next)].filter(Boolean),
    dropped: existing?.dropped || false,
    rating: existing?.rating ?? null,
    currentSeason,
    currentEpisode
  };
};
