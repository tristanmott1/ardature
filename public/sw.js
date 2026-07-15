const CACHE_NAME = "ardature-v7";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app-icons/apple-touch-icon.png",
  "./app-icons/icon-192.png",
  "./app-icons/icon-512.png",
  "./caradhras-pass/pass-01.svg",
  "./caradhras-pass/pass-02.svg",
  "./caradhras-pass/pass-03.svg",
  "./caradhras-pass/pass-04.svg",
  "./caradhras-pass/pass-05.svg",
  "./caradhras-pass/pass-06.svg",
  "./caradhras-pass/pass-07.svg",
  "./caradhras-pass/pass-08.svg",
  "./caradhras-pass/pass-09.svg",
  "./caradhras-pass/pass-10.svg",
  "./troops/icons/crow-captured.png",
  "./troops/icons/crow.png",
  "./troops/icons/dwarf.png",
  "./troops/icons/elf.png",
  "./troops/icons/ghost.png",
  "./troops/icons/ghost-head.png",
  "./troops/icons/orc.png",
  "./troops/icons/rohirrim.png",
  "./troops/icons/smeagul-captured.png",
  "./troops/icons/smeagul.png",
  "./troops/icons/uruk-hai.png",
  "./troops/icons/warg.png",
  "./troops/icons/witch-king.png",
  "./troops/icons/wizard.png",
/* __VITE_ASSETS__ */
];

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => {
          if (isNavigationRequest(request)) {
            return caches.match("./index.html");
          }

          return Response.error();
        });
    }),
  );
});
