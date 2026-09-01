import { monthOf } from "./dates.js";
import { isEnded, sectionOf } from "./progress.js";

// The air dates only matter once every aired episode is watched.
const SECTIONS = [
  { key: "watching", title: "Watching" },
  { key: "notStarted", title: "Saved, not started" },
  { key: "unrated", title: "Caught up, not rated", airDates: true },
  { key: "caughtUp", title: "Caught up", airDates: true },
  { key: "finished", title: "Finished", collapsible: true },
];

const byName = (a, b) => a.name.localeCompare(b.name);

// Soonest to come back first, and the shows that never come back last.
const byReturnDate = (a, b) => {
  if (isEnded(a) !== isEnded(b)) return isEnded(a) ? 1 : -1;
  const next = [a.upcoming?.[0], b.upcoming?.[0]];
  if (next[0] && next[1]) return next[0].airDate.localeCompare(next[1].airDate);
  if (next[0]) return -1;
  if (next[1]) return 1;
  return byName(a, b);
};

export const trackedShows = (shows) =>
  Object.values(shows).filter((show) => !show.dropped);

export const droppedShows = (shows) =>
  Object.values(shows)
    .filter((show) => show.dropped)
    .sort(byName);

export const sectionsOf = (shows) =>
  SECTIONS.map((section) => ({
    ...section,
    shows: trackedShows(shows)
      .filter((show) => sectionOf(show) === section.key)
      .sort(section.airDates ? byReturnDate : byName),
  })).filter((section) => section.shows.length);

export const upcomingMonths = (shows) => {
  const entries = trackedShows(shows)
    .flatMap((show) =>
      (show.upcoming ?? []).map((episode) => ({ episode, show })),
    )
    .sort((a, b) => a.episode.airDate.localeCompare(b.episode.airDate));

  const months = new Map();
  for (const { episode, show } of entries) {
    const month = monthOf(episode.airDate);
    if (!months.has(month)) months.set(month, []);
    months
      .get(month)
      .push({
        ...episode,
        label: show.name,
        key: `${show.id}:${episode.airDate}`,
      });
  }
  return [...months].map(([title, episodes]) => ({ title, episodes }));
};
