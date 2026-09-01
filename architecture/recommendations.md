# Recommendations

Each show you have started casts a vote for everything TMDB suggests from it.

```
vote            = your_rating - 5              →  -4 … 5, and 7 when unrated
backing         = the three largest votes for a suggestion
against         = every negative vote for it
community       = (votes × rating + 50 × 7.3) / (votes + 50)   in tenths of a point

score           = 50 × (backing + against) + (community - 73)
```

A 6 barely speaks for a suggestion and an 8 speaks three times as loudly. A 3 argues against
it. Agreement saturates after three shows say the same thing; an objection never does, because
disagreement is different information from more of the same agreement.

The field's own opinion is pulled towards the average while few people have voted, so 5.9 from
26 votes counts for much less than 5.9 from two thousand. A vote is worth fifty and a tenth of
a community point is worth one, so the field can order the suggestions your shows back equally
and can never overturn them.

Every sum is a whole number. Floating point addition gives different last bits depending on
the order of the terms, which turns equal scores into an arbitrary order and stops any
tie-break from ever firing. One division at the end puts the result on the 0–10 scale the
cards show.

## What it is not

The score says nothing about whether two shows resemble each other. Similarity between shows
was measured and rejected — genre, network, era and runtime carry no personal signal at all.
The details are in the project memory, under rejected approaches.
