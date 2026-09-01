# Roadmap

Each step ships something usable on its own.

## Step 1 — the page on Cloudflare

Put the static page on a Worker and take the `workers.dev` address. Nothing else changes:
the watch data stays in localStorage and each user still pastes their own TMDB key.

The app is then a real address instead of a directory, and every later step has somewhere to
deploy to.

See [hosting](hosting.md). The commands are in `cloudflare.md`.

## Step 2 — the TMDB proxy

Move the TMDB key into the Worker. The client calls `/api/...` on its own origin instead of
`api.themoviedb.org`, and the key form disappears from the header along with `api-key.js`.

This is what makes the app shareable: until now, a new user had to register with TMDB before
anything worked.

See [show data](show-data.md).

## Step 3 — Supabase, for a second device

Add accounts and put the watch data of signed-in users in Postgres. Anonymous use keeps
working exactly as it does now, with localStorage and the export and import buttons.

This is the first step with a database, a schema and a merge rule, so it is deliberately last.

See [user data](user-data.md). The commands are in `supabase.md`.

## Later, and maybe never

Ask users for permission to contribute their watched shows and ratings under a pseudonym,
then look for what people watch together. Nothing before step 3 depends on this.
