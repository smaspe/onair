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
- **Components are HTML files.** `parts/show-card.htm` is mounted by writing
  `<show-card>`. `js/parts.js` defines each custom element and injects the file's markup.
  The `.htm` is deliberate: Cloudflare redirects `.html` addresses to an extensionless form,
  and these are fetched by name.
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

Wrangler is needed now rather than any file server, because the TMDB key lives in the Worker.
Put a copy in `.dev.vars`, which git ignores:

```
TMDB_KEY=your-tmdb-v3-key
```

The static half still runs from any file server — but the app fetches show data through
`/api`, so without the Worker nothing loads.

Deployed at <https://onair.smaspe.workers.dev>. See `cloudflare.md`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.
