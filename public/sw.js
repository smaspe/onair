// Only the watch progress is stored, so a browser with no network knows a list of show ids and
// nothing else: no titles, no seasons, no posters. Three caches supply the rest — the files the
// page is made of, what TMDB said about each show, and the artwork.
const SHELL = "onair-shell-1";
const DATA = "onair-data-1";
const ART = "onair-art-1";
const KEEP = [SHELL, DATA, ART];

const FILES = [
  "/",
  "/index.html",
  "/shelf.css",
  "/shelf.js",
  "/state.js",
  "/mark.svg",
  "/js/account.js",
  "/js/library.js",
  "/js/recommended.js",
  "/js/storage.js",
  "/js/supabase.js",
  "/js/sync.js",
  "/js/tmdb.js",
  "/js/transfer.js",
  "/js/model/progress.js",
  "/js/model/recommend.js",
];

// The tag of the file that stands for the deploy, stored beside the files it was read with.
const BUILT = "/__built";

// One file answers for the whole shell. A deploy replaces every file at the same time, so the
// tag of any one of them says which deploy the other files came from.
const WITNESS = "/shelf.js";

const tagOf = (response) =>
  response.headers.get("etag") ?? response.headers.get("last-modified");

// Read every file of the shell, and record the deploy they came from. They are replaced
// together, so a load draws one deploy and never a mix of two.
const build = async () => {
  const cache = await caches.open(SHELL);
  await cache.addAll(FILES);
  const witness = await cache.match(WITNESS);
  await cache.put(BUILT, new Response((witness && tagOf(witness)) ?? ""));
};

self.addEventListener("install", (event) => {
  event.waitUntil(build().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => !KEEP.includes(name)).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// A stylesheet from another origin answers opaquely: no status to read, and a body this code
// cannot look at. It still replays, which is all a held copy has to do.
const usable = (response) => response.ok || response.type === "opaque";

// The page is already drawn from the copy that was held, so it is the old one. Say so, and it
// can offer to start again.
const announce = async () => {
  const pages = await self.clients.matchAll();
  pages.forEach((page) => page.postMessage({ onair: "renewed" }));
};

// Ask the server which deploy it serves. A different one is read in full before any page hears
// about it, so the reload a page offers gives the reader that deploy.
const renew = async () => {
  try {
    const fresh = await fetch(WITNESS, { cache: "no-cache" });
    if (!fresh.ok) return;
    const tag = tagOf(fresh);
    // A server that gives no tag says nothing about which deploy this is. Silence is the only
    // honest answer.
    if (!tag) return;

    const cache = await caches.open(SHELL);
    const built = await cache.match(BUILT);
    const was = built && (await built.text());
    if (was === tag) return;

    await build();
    // A shell read from a server that gave no tag cannot say which deploy it came from, so the
    // first tag it learns is recorded and no page is told that it runs an old one.
    if (was) await announce();
  } catch {
    /* no network: the pages keep the deploy they have */
  }
};

// A page asks when it opens and whenever the reader comes back to it. Nothing else asks, so a
// page that stays open for a week finds out, and a page nobody looks at costs no requests.
self.addEventListener("message", (event) => {
  if (event.data?.onair === "look") event.waitUntil(renew());
});

// Answer from what is held and ask for a newer copy at the same time. The page draws at once,
// and the newer copy is what the next load is built from.
const freshen = (event, name) =>
  caches.open(name).then(async (cache) => {
    const held = await cache.match(event.request);
    const asked = fetch(event.request)
      .then((response) => {
        if (usable(response)) cache.put(event.request, response.clone());
        return response;
      })
      .catch(() => held);

    if (held) event.waitUntil(asked);
    return held ?? asked;
  });

// For an address that names a version of the thing it points at. What is held is what was
// asked for, so it is never asked for again.
const kept = (event, name) =>
  caches.open(name).then(async (cache) => {
    const held = await cache.match(event.request);
    if (held) return held;
    const response = await fetch(event.request);
    if (usable(response)) cache.put(event.request, response.clone());
    return response;
  });

const IMMUTABLE = ["esm.sh", "fonts.gstatic.com", "fonts.googleapis.com"];

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // The page and the files it is made of are answered from what is held, and they change only
  // when the whole shell is read again. Asking the network first would make opening the app
  // wait for a request to time out whenever there is no network, which is the moment this
  // cache exists for.
  const own = url.origin === self.location.origin;
  if (event.request.mode === "navigate" || (own && FILES.includes(url.pathname))) {
    event.respondWith(kept(event, SHELL));
    return;
  }

  if (url.hostname === "image.tmdb.org") {
    event.respondWith(kept(event, ART));
    return;
  }

  if (IMMUTABLE.includes(url.hostname)) {
    event.respondWith(kept(event, SHELL));
    return;
  }

  // Everything else on another origin is the account and the table it syncs with. Neither
  // answer is worth keeping.
  if (!own) return;

  if (url.pathname.startsWith("/api/")) {
    // A search is typed once and the answer is never wanted again.
    if (url.pathname.startsWith("/api/search/")) return;
    event.respondWith(freshen(event, DATA));
    return;
  }

  event.respondWith(freshen(event, SHELL));
});
