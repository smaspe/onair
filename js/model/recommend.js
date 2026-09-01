import { episodesWatched } from "./progress.js";

const MIDDLE = 5;
const UNRATED = 7;

// What a rating is worth as a vote: the distance from the middle. A 6 barely speaks, an
// 8 speaks three times as loudly, and a 3 argues against.
//
//   1   2   3   4  5  6  7  8  9  10
//  -4  -3  -2  -1  0  1  2  3  4   5
const voteOf = rating => rating - MIDDLE;

// A show you have started watching votes with what you make of it.
export const weightOf = show =>
  episodesWatched(show) ? voteOf(show.rating ?? UNRATED) : 0;

// Past three shows saying the same thing, another one says nothing new. A show that
// argues against always counts: agreement saturates, an objection does not.
const MAX_VOTES = 3;

const strongest = weights => {
  const backing = weights.filter(weight => weight > 0).sort((a, b) => b - a);
  const against = weights.filter(weight => weight < 0);
  return [...backing.slice(0, MAX_VOTES), ...against]
    .reduce((sum, weight) => sum + weight, 0);
};

// What everyone else makes of a show, in tenths of a point, pulled towards the middle of
// the field while few people have voted: 5.9 from 26 votes says much less than 5.9 from
// two thousand.
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
// A vote is worth fifty, a tenth of a community point is worth one. So the field can
// order the suggestions your shows back equally, and can never overturn them.
const TASTE = 50;
const BEST = TASTE * MAX_VOTES * voteOf(10);

// A show suggested by several of your shows counts several times, each vote worth what
// that show is worth. A show you dropped only puts its name against a suggestion.
export const rank = (votes, exclude) => {
  const found = new Map();

  for (const { source, weight, suggestions } of votes){
    for (const suggestion of suggestions){
      if (exclude.has(String(suggestion.id))) continue;

      const seen = found.get(suggestion.id) ?? { ...suggestion, weights: [], from: [], dropped: [] };
      if (source.dropped) seen.dropped.push(source.name);
      else {
        seen.weights.push(weight);
        seen.from.push(source.name);
      }
      found.set(suggestion.id, seen);
    }
  }

  // A suggestion scores 10 when three shows you rate 10 all make it, then moves a little
  // with what everyone else makes of it.
  return [...found.values()]
    .filter(suggestion => suggestion.weights.length)
    .map(suggestion => ({
      ...suggestion,
      score: (TASTE * strongest(suggestion.weights) + settled(suggestion) - AVERAGE) / BEST * 10
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};
