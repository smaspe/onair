# Episode order

A note, not a plan. Nothing in the app uses this yet.

## The problem

The order of a series is not one fact. A broadcaster can air episodes in an order the producers
did not intend, a DVD can restore the intended one, and a streaming service can use a third.
The audience of each sees a different show.

TMDB numbers every episode once, by season and by position in that season, and that numbering
is what the app reads today.

## What TMDB offers

Two endpoints describe the alternatives.

`GET /tv/{id}/episode_groups` lists the orderings that exist for a series. Each entry has a
`name`, a `description`, an `episode_count`, a `group_count`, a `type`, and **a `network`** —
which is the part that matters here. An ordering is a property of who showed the series, not of
the series.

`GET /tv/episode_group/{group_id}` returns one ordering in full: a list of groups, each with its
episodes.

## Why this is cheap to adopt later

An episode inside a group keeps its canonical `season_number` and `episode_number`, and gains
an `order` field for its position in that group. A group re-sorts and re-groups the same
episodes. It never invents different ones.

So an ordering is a view. As long as the watch state is a set of episodes and not a position in
a sequence, changing the order changes nothing about what a person has watched.

The reverse is also true, and it is the reason this note exists: **a single "watched up to here"
mark cannot survive a change of order.** "Up to episode seven" names a different set of episodes
in each ordering, so the same mark means different things depending on which order is on screen.

## What it would take

The proxy forwards a fixed list of paths, and neither of these is on it. `/tv/{id}/episode_groups`
fits the shapes already there. `/tv/episode_group/{group_id}` does not: the group id is a
24-character hexadecimal string, not a number, so it needs a pattern of its own.

A reader would also have to choose an ordering per series, and that choice would have to be
stored and synced like any other preference.

## What is undecided

The `type` field is an integer and TMDB's reference page does not say what its values mean.
Somebody has to read the values that come back before the app can, for example, prefer a
broadcast order by default.
