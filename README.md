# ONAIR

A TV tracker. It remembers which episode you reached, what you made of a show, and when the
next episode airs.

<https://github.com/smaspe/onair>

## What it does

Four views, chosen by the URL fragment:

- **Shows** — what you track, in sections derived from your progress: watching, saved but not
  started, caught up but not rated, caught up, and finished. Finished starts folded.
- **Upcoming** — every episode still to air across your whole library, grouped by month.
- **Recommended** — what your shows suggest, weighted by how you rated them.
- **Dropped** — what you gave up on, kept separate, with restore and delete.

On a card, `✓` marks the next episode, `✓✓` the rest of the season, `✓✓✓` everything that has
aired, and `✗` steps back one.

## How it works

A static page. **No build step, no bundler, no framework compilation** — the files in this
repository are the files the browser runs.

- **Alpine** provides reactivity, pinned to an exact version from a CDN.
- **Components are HTML files.** `parts/show-card.html` is mounted by writing
  `<show-card>`. `js/parts.js` defines each custom element and injects the file's markup.
  There is no shadow DOM, so the stylesheet and Alpine both still reach inside.
- **Views switch with CSS.** `:target` shows the view whose id matches the fragment. No
  router.
- **Sections fold with `<details>`.** The browser holds that state, not the app.
- **Show data comes from TMDB** and is never stored — only your progress is.
- **Your progress lives in `localStorage`**, under one key, with export and import buttons.

The one trap worth knowing: **a record must be reached through the store, never handed down
from an `x-for`.** Alpine gives a child scope a copy of the loop item, so writes to it render
and are then lost. `js/card.js` passes an id and reads the record back. Its comment explains
this, and `js/parts.js` points at it.

## Documents

**[architecture/](architecture/README.md)** is where to start. It shows what the system looks
like, what exists today, and the order to build the rest in, and it indexes the roadmap, the
hosting, the TMDB proxy, the user data and the recommendation formula.

`cloudflare.md` and `supabase.md` hold the setup steps and the commands. They are kept out of
the repository.

## Running it

Any file server will do. ES modules need an `http://` origin, so opening `index.html` from
the filesystem does not work.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> and paste a TMDB API key into the header. From step 2 of the
roadmap the key moves into the Worker and that form disappears.

## References

No secrets here. Keys live in `wrangler secret` and in the Supabase dashboard.

| | |
| --- | --- |
| Repository | `smaspe/onair` |
| Cloudflare account id | _to fill in_ |
| Worker name | `onair` |
| Deployed address | _to fill in — `https://onair.<subdomain>.workers.dev`_ |
| Supabase project ref | _to fill in_ |
| Supabase project URL | _to fill in — `https://<ref>.supabase.co`_ |
| Supabase region | _to fill in_ |
| TMDB account | the key holder, once the proxy exists |

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming
availability, where shown, comes from JustWatch.
