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

const tagOf = (response) =>
  response.headers.get("etag") ?? response.headers.get("last-modified");

// What the held shell is made of: the tag of every file, in one string. A server gives a file
// the same tag for as long as its content does not change, so two shells with two fingerprints
// were read from two deploys. Asking every file is what makes a deploy that changes one of them
// visible; a single file speaks only for itself.
const fingerprint = async (cache) => {
  const held = await Promise.all(FILES.map((path) => cache.match(path)));
  return held.map((response) => (response && tagOf(response)) ?? "").join("|");
};

// Read every file of the shell. They are replaced together, so a load draws one deploy and
// never a mix of two.
const build = async () => {
  const cache = await caches.open(SHELL);
  await cache.addAll(FILES);
  return fingerprint(cache);
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

// Read the shell again, and say so when what came back is a different deploy from what was
// held. The files are in the cache before any page hears about it, so the reload a page offers
// gives the reader that deploy and not the one after it.
//
// A server that gives no tags fingerprints every deploy the same way and no page is ever told,
// which is the only honest answer when nothing distinguishes one deploy from another.
const renew = async () => {
  try {
    const cache = await caches.open(SHELL);
    const held = await fingerprint(cache);
    if ((await build()) !== held) await announce();
  } catch {
    /* no network: the pages keep the deploy they have */
  }
};

// Reading the shell again costs a request for each of its files, so it happens at most this
// often however many times the pages ask.
const REST = 60_000;
let looked = 0;

// A page asks when it opens and whenever the reader comes back to it. Nothing else asks, so a
// page that stays open for a week finds out, and a page nobody looks at costs no requests.
self.addEventListener("message", (event) => {
  if (event.data?.onair !== "look") return;
  if (Date.now() - looked < REST) return;
  looked = Date.now();
  event.waitUntil(renew());
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
