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

A page with no build step — **no bundler, no framework compilation**. The files in this
repository are the files the browser runs. Behind it, one Cloudflare Worker serves those
files and answers `/api` with show data, so the app is run with wrangler rather than a file
server.

- **Alpine** provides reactivity.
- **Components are HTML files.** `parts/show-card.part.html` is mounted by writing
  `<show-card>`. `js/parts.js` defines each custom element and injects the file's markup.
  The address drops the `.html` — Cloudflare treats `/parts/show-card.part` as the canonical
  one and would redirect the longer form to it.
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

```bash
npx wrangler dev
```

Then open <http://localhost:8787>.

Wrangler runs both halves: the files, and the Worker that answers `/api`. It needs the TMDB
key in `.dev.vars`, which git ignores:

```
TMDB_KEY=your-tmdb-v3-key
```

Deployed at <https://onair.smaspe.workers.dev>. See `cloudflare.md`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.
