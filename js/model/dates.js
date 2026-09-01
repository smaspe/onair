export const code = (season, episode) =>
  `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;

export const formatDate = airDate => new Date(airDate + "T00:00:00")
  .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export const monthOf = airDate => new Date(airDate + "T00:00:00")
  .toLocaleDateString(undefined, { month: "long", year: "numeric" });

export const daysUntil = airDate => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(airDate + "T00:00:00") - today) / 86400000);
};

export const countdown = days => {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days}d` : `${-days}d ago`;
};

export const airsIn = episode => countdown(daysUntil(episode.airDate));

export const airsSoon = episode => daysUntil(episode.airDate) <= 3;
