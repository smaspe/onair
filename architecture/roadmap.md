# Roadmap

## Next

Nothing is committed to. The candidates, in the order they look worth doing:

**Where to watch.** TMDB answers `/tv/{id}/watch/providers`, which is one more path on a proxy
that already exists. It answers the question a reader has after deciding to watch something.

**Season by season in one press.** Pressing the last episode of a season marks the whole
season, but only once the season is open and the last row is found.

## Later, and maybe never

Ask users, including anonymous ones, for permission to store their watched shows and ratings
under a pseudonym, then look for what people watch together. The payload is a watch history,
so the request has to say so, and it has to be opt in.

Nothing before it depends on this.

## History

**A single file.** 651 lines of HTML, CSS and JavaScript, reading TMDB and keeping progress
in localStorage.

**Files, a rendering library, and a model.** Split into `js/` and `js/model/`. The sections a
show falls into stopped being a flag the user sets and became something derived from progress.
Hand-written template literals first, then the same app built three ways — Alpine, uhtml and
Preact — and compared. Alpine won on the reactivity being invisible.

**Recommendations.** What your shows suggest, weighted by how you rated them.

**Export and import**, so a browser is not the only copy.

**A palette.** Teal, and a mark that is a studio sign broadcasting.

**Cloudflare.** The page moved to a Worker on `workers.dev`.

**TMDB proxy on Cloudflare**, so nobody needs a key of their own.

**Supabase, for a second device.** Email and password, one row per show, and a realtime
subscription so a tab left open for a week cannot write stale progress over fresh progress.

**A shelf.** The list of sections became a wall of posters with a tab for each state a show can
be in, and a sheet behind each poster. Two designs were built and compared; the list was
deleted rather than kept as an option.

**Offline.** A service worker stores the page, the TMDB answers and the artwork. A change that
cannot reach the table is remembered against the show it belongs to and sent when the
connection returns, and the shelf says how many are waiting.
