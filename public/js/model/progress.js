export const isEnded = (show) =>
  show.tvStatus === "Ended" || show.tvStatus === "Canceled";

const seasonOf = (show) =>
  show.seasons.find((season) => season.number === show.currentSeason);

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

// How many episodes of the show come before this point, counting from the first season.
const absolute = (show, at) =>
  show.seasons
    .filter((season) => season.number < at.season)
    .reduce((total, season) => total + season.episodeCount, 0) + at.episode;

export const episodesWatched = (show) =>
  absolute(show, { season: show.currentSeason, episode: show.currentEpisode });

// The seasons a card speaks of: the one watched, and the one the next episode is in.
const namedSeasons = (show) => [
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
