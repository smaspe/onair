# ONAIR

A TV tracker. It remembers which episode you have seen, what you thought of a show, and when the
next episode airs.

<https://github.com/smaspe/onair>

## What it does

Four views, chosen by the URL fragment:

- **Shows** - what you track, in progress sections: watching, saved but not
  started, caught up but not rated, caught up, and finished. Finished starts folded.
- **Upcoming** - every episode scheduled to air across your whole library, grouped by month.
- **Recommended** - Recommendations based on the shows you watched and whether you liked them.
- **Dropped** - what you gave up on, kept separate, with restore and permanent delete.

On a card, `✓` marks the next episode, `✓✓` the rest of the season, `✓✓✓` everything that has
aired, and `✗` steps back one.

## How it works

It is a static page. **No build step, no bundler, no framework compilation**.

- **Alpine** provides reactivity.
- **Components are HTML files.** `parts/show-card.html` is mounted by writing
  `<show-card>`. `js/parts.js` defines each custom element and injects the file's markup.
- **No router.** Views switch with CSS. `:target` shows the view whose id matches the fragment. 
- **Show data comes from TMDB.**
- **Your progress is stored in `localStorage`** under one key, with export and import buttons.

The one trap worth knowing: **a record must be reached through the store, never handed down
from an `x-for`.** Alpine gives a child scope a copy of the loop item, so writes to it render
and are then lost. `js/card.js` passes an id and reads the record back. Its comment explains
this, and `js/parts.js` points at it.

## Documents

**[architecture/](architecture/README.md)** is where to start. It shows what the system looks
like, what exists today, and the order to build the rest in, and it indexes the roadmap, the
hosting, the TMDB proxy, the user data and the recommendation formula.

## Running it

Any file server will do. ES modules need an `http://` origin, so opening `index.html` from
the filesystem does not work.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> and paste a TMDB API key into the header. From step 2 of the
roadmap the key moves into the Worker and that form disappears.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.
