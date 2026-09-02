# Roadmap

## Next — Supabase, for a second device

Add accounts and put the watch data of signed-in users in Postgres. Anonymous use keeps
working exactly as it does now, with localStorage and the export and import buttons.

This is the first step with a database, a schema and a merge rule, which is why it comes
last of the three.

See [user data](user-data.md). The commands are in `supabase.md`.

## Later, and maybe never

Ask users, including anonymous ones, for permission to store their watched shows and ratings
under a pseudonym, then look for what people watch together. The payload is a watch history,
so the request has to say so, and it has to be opt in.

Nothing before it depends on this.

## History

**A single file.** 651 lines of HTML, CSS and JavaScript, reading TMDB and keeping progress
in localStorage.

**Files, a rendering library, and a model.** Split into `js/`, `js/model/` and `parts/`. The sections a show falls
into stopped being a flag the user sets and became something derived from progress: watching,
saved, caught up, finished. Hand-written template literals first, then the same app built three
ways — Alpine, uhtml and Preact — and compared. Alpine won on the reactivity being invisible.

**Recommendations.** What your shows suggest, weighted by how you rated them.

**Export and import**, so a browser is not the only copy.

**A palette.** Teal, and a mark that is a studio sign
broadcasting.

**Cloudflare.** The page moved to a Worker on `workers.dev`. The parts became
`*.part.html`, fetched without the `.html`, because Cloudflare treats the shorter address as
the canonical one and redirects to it.

**TMDB proxy on Cloudflare**, so nobody needs a key of their own.
