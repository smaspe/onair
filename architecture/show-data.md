# Show data

Everything about a show — its name, its seasons, its episodes and their air dates — comes
from TMDB. None of it is stored. Only the watch progress is.

## Why a proxy

The TMDB key must stay secret, and a static page cannot hold a secret. The Worker holds it
instead, and caches the responses in one place for every user.

## Why it does not authenticate

Anonymous users need show data as much as signed-in users do, so a token check would break
the mode the app promises. The endpoint is public. These limits keep it from becoming a
general purpose TMDB mirror:

- **A fixed list of endpoints.** `/tv/{id}`, `/tv/{id}/season/{n}`, `/search/tv`,
  `/tv/{id}/recommendations`, `/genre/tv/list`. Nothing else is forwarded.
- **Validated input.** Numeric ids, season numbers in range, a length cap on the query.
- **Whole responses.** The body is forwarded as it arrives; `js/tmdb.js` already shapes it,
  and doing that twice would put the same knowledge in two places. Trimming to the fields the
  client reads would shrink the cache, and is worth doing only if payload size becomes a
  problem.
- **CORS limited to the app origin.** This stops another site's JavaScript. It does not stop
  a script, and it is not meant to.
- **Rate limits by IP**, once the Worker runs on a zone. Those rules run before the Worker,
  so they protect the request count as well.

The response body never contains the key. Abuse costs quota and standing with TMDB. It does
not leak a credential.

**Posters bypass the Worker.** `image.tmdb.org` needs no key and serves the bulk of the bytes,
so the client links to it directly.

## TTLs

The Worker decides how long each answer lives, through the `Cache-Control` it returns:

- An **ended** show never changes. Days.
- A **running** show has air dates that move. Hours.
- `stale-while-revalidate` serves the stale copy and refreshes behind it, so a long TTL never
  makes a user wait.

TMDB's terms cap any cache at six months.

## Licensing

TMDB is free for non-commercial use with attribution. A commercial licence starts at $149 a
month **from the first pound of revenue**, and their terms count advertising and affiliate
links as commercial. There is no small-revenue tier.

That is a decision for the day the app takes money. TheTVDB is free below $50,000 of annual
revenue and $1,000 a year above it; TVmaze publishes its data under CC BY-SA, which permits
commercial use with attribution and cannot be withdrawn the way a permission can.

The proxy is the seam that makes a change of provider a small job. What is not small is the
show id: it is the key of every stored row. `imdb_id` rides along in the schema for exactly
this reason — see [user data](user-data.md).

## JustWatch

TMDB's watch provider data comes from JustWatch, and attribution is mandatory whatever you do
with it: *"In order to use this data you must attribute the source of the data as JustWatch."*
Non-compliance means revoked API access. The response carries a `link` to the JustWatch page,
which is both the simplest presentation and the attribution.
