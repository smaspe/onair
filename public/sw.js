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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
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

// A file is the same file when the server gives it the same tag. Two copies that each have a
// tag, and have different tags, are two versions of the page.
const differs = (held, fresh) => {
  const before = held.headers.get("etag") ?? held.headers.get("last-modified");
  const after = fresh.headers.get("etag") ?? fresh.headers.get("last-modified");
  return Boolean(before && after && before !== after);
};

// The page is already drawn from the copy that was held, so it is the old one. Say so, and it
// can offer to start again.
const announce = async () => {
  const pages = await self.clients.matchAll();
  pages.forEach((page) => page.postMessage({ onair: "renewed" }));
};

// Answer from what is held and ask for a newer copy at the same time. The page draws at once,
// and the newer copy is what the next load is built from.
const freshen = (event, name) =>
  caches.open(name).then(async (cache) => {
    const held = await cache.match(event.request);
    const asked = fetch(event.request)
      .then((response) => {
        if (!usable(response)) return response;
        if (held && differs(held, response)) announce();
        cache.put(event.request, response.clone());
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

  // The page is answered from what is held, like every other file it is made of. Asking the
  // network first would make opening the app wait for a request to time out whenever there is
  // no network, which is the moment this cache exists for.
  if (event.request.mode === "navigate") {
    event.respondWith(freshen(event, SHELL));
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
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // A search is typed once and the answer is never wanted again.
    if (url.pathname.startsWith("/api/search/")) return;
    event.respondWith(freshen(event, DATA));
    return;
  }

  event.respondWith(freshen(event, SHELL));
});
