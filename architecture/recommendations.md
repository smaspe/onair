# Recommendations

Each show you have started casts a vote for everything TMDB suggests from it.

```
vote       = your_rating - 5      →  -4 … 5.  A show you have started but not rated
                                     counts as a 7, so it votes 2.
backing    = the three largest votes for a suggestion
against    = every negative vote for it
community  = (votes × rating + 50 × 7.3) / (votes + 50)   in tenths of a point

points     = 50 × (backing + against) + (community - 73)
score      = points / 750 × 10    →  10 when three shows you rate 10 all suggest it
```

750 is the best `points` can be: fifty a point, three votes, five points each.

A 6 doesn't make strong suggestions while an 8 does. A 3 argues against
it. Agreement saturates after three shows say the same thing; an objection never does, because
disagreement is different information from more of the same agreement.

The `community` term is what everyone else thinks, and it is deliberately weak. Your own
ratings decide the order; this only separates suggestions your shows back equally.

A rating from a handful of people says little, so we move it back towards 7.3. That number was
measured once: across the 773 suggestions a 58 show library produced, the mean TMDB rating was
7.31 and the median 7.30. TMDB ratings sit in a narrow band, so a single sample is enough, but
it is a constant in the code and nothing re-measures it.

The `50` in that line is the number of votes it takes before a show's own rating outweighs
that average:

- 5.9 from 26 votes becomes **6.8**, most of the way back to average.
- 5.9 from 2000 votes stays **5.9**, because the crowd is large enough to trust.

The two terms are then sized so one cannot drown the other. One point of your rating is worth
50. The community term is a difference from 7.3 in tenths, so across the ratings that occur in
practice it runs from about -23 for a poorly received show to +17 for an acclaimed one. Two
suggestions therefore cannot differ by 50 on that term alone: it reorders suggestions your
shows score identically, and never moves one past a suggestion a full rating point ahead.