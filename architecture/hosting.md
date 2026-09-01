# Hosting

Cloudflare serves the page and proxies TMDB. One Worker does both jobs.

## One Worker, two jobs

A Worker can hold a directory of static files and run code. A request that matches a file is
served from the file and never runs the Worker. A request that matches a route in
`run_worker_first` runs the Worker instead.

```jsonc
"assets": {
  "directory": ".",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*"]
}
```

That puts the page and its API on one origin. Three things follow:

- **No CORS between them.** The client calls `/api/...`, a same-origin path.
- **One deploy and one address.** The page and the proxy cannot drift apart.
- **Static files are free.** They do not count against the Workers request limit.

## Caching

| Tier | Lives in | Skips | Controlled by |
| --- | --- | --- | --- |
| Browser cache | the user's device | the network | the `Cache-Control` the Worker returns |
| Workers Cache | a Cloudflare data centre | the Worker and TMDB | the same header, plus `cache.enabled` |
| Posters | browser and Cloudflare | everything | TMDB's own headers |

Workers Cache runs **in front of** the Worker, so a hit returns the response and the code
never executes. The cache key is the request path, the entrypoint, `ctx.props` and the Worker
version, so every deploy starts with a cold cache. The key holds no `Authorization` header,
which is consistent with an endpoint that does not authenticate.

A hit still counts as a request against the Workers quota. It saves the CPU time and the call
to TMDB. **Only the browser cache removes a request from that count.**

The Cloudflare cache is per data centre, so a show is fetched once per data centre per TTL,
not once for the world. Tiered Cache removes that, but it needs a zone and a caching path
through `fetch()` rather than the Cache API. Reach for it when the volume justifies it.

## Limits

The free plan gives 100,000 requests a day and 10ms of CPU per invocation. A user who opens
the app a few times a day costs roughly 2,400 requests a month once the browser cache is
working, so the limit is around two hundred regular users away.

## Address

`wrangler deploy` returns `https://onair.<subdomain>.workers.dev`, free and enough to run the
whole app. A domain of your own can wait.
