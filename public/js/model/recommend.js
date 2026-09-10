import { episodesWatched } from "./progress.js";

const MIDDLE = 5;
const UNRATED = 7;

// What a rating is worth as a vote: the distance from the middle. A 6 barely speaks, an
// 8 speaks three times as loudly, and a 3 argues against.
//
//   1   2   3   4  5  6  7  8  9  10
//  -4  -3  -2  -1  0  1  2  3  4   5
const voteOf = (rating) => rating - MIDDLE;

// A show you have started watching votes with what you make of it.
export const weightOf = (show) =>
  episodesWatched(show) ? voteOf(show.rating ?? UNRATED) : 0;

// Past three shows saying the same thing, another one says nothing new. A show that
// argues against always counts: agreement saturates, an objection does not.
const MAX_VOTES = 3;

const strongest = (weights) => {
  const backing = weights.filter((weight) => weight > 0).sort((a, b) => b - a);
  const against = weights.filter((weight) => weight < 0);
  return [...backing.slice(0, MAX_VOTES), ...against].reduce(
    (sum, weight) => sum + weight,
    0,
  );
};

// What everyone else makes of a show, in tenths of a point. A rating from few people is
// moved back towards the average, so 5.9 from 26 votes settles at 6.8 while 5.9 from two
// thousand stays at 5.9.
//
// AVERAGE is the mean TMDB rating, measured once over 773 suggestions. PRIOR is how many
// votes a show needs before its own rating outweighs that average.
const AVERAGE = 73;
const PRIOR = 50;

const settled = ({ vote, votes }) => {
  if (!vote) return AVERAGE;
  const tenths = Math.round(vote * 10);
  return Math.round((votes * tenths + PRIOR * AVERAGE) / (votes + PRIOR));
};

// Every sum above is a whole number, because floating point addition gives different last
// bits for different orders, which turns equal scores into an arbitrary order. One
// division at the end puts the result back on the scale the cards show.
//
// One point of your rating is worth fifty. What everyone else thinks is a difference from
// AVERAGE in tenths, which runs about -23 to +17, so it separates the suggestions your own
// shows score identically without ever crossing a whole rating point.
const TASTE = 50;
const BEST = TASTE * MAX_VOTES * voteOf(10);

// A show suggested by several of your shows counts several times, each vote worth what
// that show is worth.
export const rank = (votes, exclude) => {
  const found = new Map();

  for (const { name, weight, suggestions } of votes) {
    for (const suggestion of suggestions) {
      if (exclude.has(String(suggestion.id))) continue;

      const seen = found.get(suggestion.id) ?? { ...suggestion, backers: [] };
      seen.backers.push({ name, weight });
      found.set(suggestion.id, seen);
    }
  }

  // A suggestion scores 10 when three shows you rate 10 all make it, then moves a little
  // with what everyone else makes of it.
  const ranked = [...found.values()]
    .map((suggestion) => ({
      ...suggestion,
      score:
        ((TASTE * strongest(suggestion.backers.map((backer) => backer.weight)) +
          settled(suggestion) -
          AVERAGE) /
          BEST) *
        10,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Every backer did suggest the show, so which one to name is free. Naming the one named
  // least so far spreads the reasons over the shelf. Naming the loudest instead puts the show
  // you rate highest on nearly every card, which then says nothing about any of them.
  const named = new Map();
  for (const suggestion of ranked) {
    const order = [...suggestion.backers].sort(
      (a, b) =>
        (named.get(a.name) ?? 0) - (named.get(b.name) ?? 0) ||
        b.weight - a.weight,
    );
    named.set(order[0].name, (named.get(order[0].name) ?? 0) + 1);
    suggestion.from = order.map((backer) => backer.name);
    delete suggestion.backers;
  }
  return ranked;
};
