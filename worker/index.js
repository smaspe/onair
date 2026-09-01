// The TMDB proxy. It holds the key and forwards a fixed list of paths.
//
// Every other request on this site matches a static file and never reaches this code:
// wrangler.jsonc runs the Worker first only for /api/*.

const TMDB = "https://api.themoviedb.org/3";

const HOUR = 3600;
const DAY = 24 * HOUR;

// A search term longer than this is a mistake or an attack, not a show name.
const MAX_QUERY = 120;

// The five shapes the client asks for. Anything else is a 404 here, so this cannot be used
// as a general TMDB mirror.
//
// `query` names the parameters a caller may pass on. Every other parameter is dropped, so
// TMDB's own defaults stand: a search cannot be widened to adult results, another language
// or a deeper page.
const ROUTES = [
  { path: /^\/tv\/\d{1,9}$/ },
  { path: /^\/tv\/\d{1,9}\/season\/\d{1,3}$/, maxAge: DAY },
  { path: /^\/tv\/\d{1,9}\/recommendations$/, maxAge: DAY },
  { path: /^\/search\/tv$/, maxAge: HOUR, query: ["query"] },
  { path: /^\/genre\/tv\/list$/, maxAge: 30 * DAY },
];

// A show that has ended never gains an episode, so it keeps for a week. One still running
// gains air dates, and its next episode is the thing the app exists to report.
const showMaxAge = (body) => {
  try {
    const { status } = JSON.parse(body);
    return status === "Ended" || status === "Canceled" ? 7 * DAY : 6 * HOUR;
  } catch {
    return 6 * HOUR;
  }
};

const fail = (status, message) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return fail(405, "GET only");
    if (!env.TMDB_KEY) return fail(500, "no TMDB key on this Worker");

    const url = new URL(request.url);
    const path = url.pathname.slice("/api".length);
    const route = ROUTES.find((candidate) => candidate.path.test(path));
    if (!route) return fail(404, "not a route this proxy forwards");

    const upstream = new URL(TMDB + path);
    upstream.searchParams.set("api_key", env.TMDB_KEY);
    for (const name of route.query ?? []) {
      const value = url.searchParams.get(name);
      if (value) upstream.searchParams.set(name, value.slice(0, MAX_QUERY));
    }

    const response = await fetch(upstream);
    if (!response.ok) return fail(response.status, "TMDB said no");

    // The body is passed through, and the headers are not: TMDB's own cache directives are
    // replaced, and a response carrying Set-Cookie would never be cached at all.
    const body = await response.text();
    const maxAge = route.maxAge ?? showMaxAge(body);

    return new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${maxAge}, stale-while-revalidate=${DAY}`,
      },
    });
  },
};
