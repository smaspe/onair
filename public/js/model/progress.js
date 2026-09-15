export const isEnded = (show) =>
  show.tvStatus === "Ended" || show.tvStatus === "Canceled";

// Which episodes of one season are marked watched. A season nobody has touched has none.
export const seen = (show, number) => show.watched?.[number] ?? [];

export const isWatched = (show, season, episode) =>
  seen(show, season).includes(episode);

export const episodesWatched = (show) =>
  Object.values(show.watched ?? {}).reduce((sum, list) => sum + list.length, 0);

// How many episodes of this season had aired by the last one to air.
const airedIn = (show, season) =>
  season.number > show.last.season
    ? 0
    : season.number === show.last.season
      ? show.last.episode
      : season.episodeCount;

// Episodes that have aired and are not marked watched. An episode watched out of order counts
// the same as one watched in order: the question is how many are left, not where you are.
export const episodesBehind = (show) => {
  if (!show.last) return 0;
  return show.seasons.reduce((behind, season) => {
    const aired = airedIn(show, season);
    const watched = seen(show, season.number).filter(
      (episode) => episode <= aired,
    ).length;
    return behind + Math.max(0, aired - watched);
  }, 0);
};

// The first episode TMDB numbers that is not marked watched, or nothing when every episode is.
// A gap left behind comes first, because it is the first one missing.
export const nextUnwatched = (show) => {
  for (const season of show.seasons) {
    const watched = seen(show, season.number);
    for (let episode = 1; episode <= season.episodeCount; episode += 1)
      if (!watched.includes(episode)) return { season: season.number, episode };
  }
  return null;
};

// The furthest episode marked watched, or nothing when none is.
export const lastWatched = (show) => {
  for (let at = show.seasons.length - 1; at >= 0; at -= 1) {
    const number = show.seasons[at].number;
    const watched = seen(show, number);
    if (watched.length) return { season: number, episode: Math.max(...watched) };
  }
  return null;
};

// Every episode up to and including this one, in the order TMDB numbers them. This is what a
// reader means by "I had seen everything up to here".
export const upTo = (show, season, episode) => {
  const marks = {};
  for (const one of show.seasons) {
    if (one.number > season) continue;
    const last = one.number === season ? episode : one.episodeCount;
    marks[one.number] = Array.from({ length: last }, (_, at) => at + 1);
  }
  return marks;
};

// How many of the episodes up to this point are not marked watched yet.
export const missingUpTo = (show, season, episode) => {
  const wanted = upTo(show, season, episode);
  return Object.entries(wanted).reduce((count, [number, episodes]) => {
    const watched = seen(show, number);
    return count + episodes.filter((one) => !watched.includes(one)).length;
  }, 0);
};

// The title of one episode, from the seasons the record contains.
export const titleAt = (show, at) =>
  [...(show.episodes ?? []), show.last, ...(show.upcoming ?? [])].find(
    (episode) =>
      episode && episode.season === at.season && episode.episode === at.episode,
  )?.title ?? "";

// The seasons a card speaks of: the one the next episode is in, and the one the furthest
// watched episode is in.
const namedSeasons = (show) =>
  [...new Set([nextUnwatched(show)?.season, lastWatched(show)?.season])].filter(
    (number) => number !== undefined,
  );

// Whether the record contains the episodes of every season the card will name.
export const knowsNamedSeasons = (show) =>
  namedSeasons(show).every((number) =>
    show.episodes?.some((episode) => episode.season === number),
  );
