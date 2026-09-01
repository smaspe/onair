import { code } from "./dates.js";

export const isEnded = (show) =>
  show.tvStatus === "Ended" || show.tvStatus === "Canceled";

export const seasonOf = (show, number = show.currentSeason) =>
  show.seasons.find((season) => season.number === number);

// Aired episodes the watcher has not seen yet.
export const episodesBehind = (show) => {
  if (!show.last) return 0;
  let behind = 0;
  for (const season of show.seasons) {
    if (season.number < show.currentSeason || season.number > show.last.season)
      continue;
    const aired =
      season.number === show.last.season
        ? show.last.episode
        : season.episodeCount;
    const watched =
      season.number === show.currentSeason ? show.currentEpisode : 0;
    behind += Math.max(0, aired - watched);
  }
  return behind;
};

// A show sits in one section, from how far the watch progress is behind the last aired
// episode. A show you have caught up with is the one you can say what you make of.
export const sectionOf = (show) => {
  const firstSeason = show.seasons[0]?.number ?? 1;
  if (show.currentEpisode === 0 && show.currentSeason <= firstSeason)
    return "notStarted";
  if (episodesBehind(show)) return "watching";
  if (!show.rating) return "unrated";
  return isEnded(show) ? "finished" : "caughtUp";
};

// Where the progress lands after one more episode.
export const nextWatched = (show) => {
  const season = seasonOf(show);
  const episode = show.currentEpisode + 1;
  if (!season || episode <= season.episodeCount)
    return { season: show.currentSeason, episode };

  const later = show.seasons.find((s) => s.number > show.currentSeason);
  return later
    ? { season: later.number, episode: 1 }
    : { season: show.currentSeason, episode: season.episodeCount }; // the last known episode
};

// Where the progress lands after one episode back.
export const previousWatched = (show) => {
  if (show.currentEpisode > 1)
    return { season: show.currentSeason, episode: show.currentEpisode - 1 };

  const earlier = [...show.seasons]
    .reverse()
    .find((s) => s.number < show.currentSeason);
  return earlier
    ? { season: earlier.number, episode: earlier.episodeCount }
    : { season: show.currentSeason, episode: 0 };
};

// Every episode that has aired, marked as watched.
export const allWatched = (show) =>
  show.last
    ? { season: show.last.season, episode: show.last.episode }
    : { season: show.currentSeason, episode: show.currentEpisode };

// How many episodes of the show come before this point, counting from the first season.
const absolute = (show, at) =>
  show.seasons
    .filter((season) => season.number < at.season)
    .reduce((total, season) => total + season.episodeCount, 0) + at.episode;

export const episodesWatched = (show) => absolute(show, watchedAt(show));

// The seasons a card speaks of: the one watched, and the one the next episode is in.
export const namedSeasons = (show) => [
  ...new Set([show.currentSeason, nextWatched(show).season]),
];

// Whether the record carries the episodes of every season the card will name.
export const knowsNamedSeasons = (show) =>
  namedSeasons(show).every((number) =>
    show.episodes?.some((episode) => episode.season === number),
  );

// The title of one episode, from the seasons the record carries.
export const titleAt = (show, at) =>
  [...(show.episodes ?? []), show.last, ...(show.upcoming ?? [])].find(
    (episode) =>
      episode && episode.season === at.season && episode.episode === at.episode,
  )?.title ?? "";

export const watchedAt = (show) => ({
  season: show.currentSeason,
  episode: show.currentEpisode,
});

// The season the next episode belongs to, watched as far as it has aired.
export const seasonWatched = (show) => {
  const at = nextWatched(show);
  const season = seasonOf(show, at.season);
  if (!season || show.last?.season < at.season) return watchedAt(show);
  return {
    season: at.season,
    episode:
      show.last?.season === at.season ? show.last.episode : season.episodeCount,
  };
};

export const seasonLeft = (show) =>
  Math.max(
    0,
    absolute(show, seasonWatched(show)) - absolute(show, watchedAt(show)),
  );
