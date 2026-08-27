/* Service Worker für Selbstorga – sorgt dafür, dass die Home-Bildschirm-App
   immer die neueste Version lädt (Network-First für HTML), aber offline
   weiterhin funktioniert (Fallback auf Cache). */
const CACHE = "selbstorga-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Sync-API und Versions-Datei nie cachen – immer frisch aus dem Netz.
  if (url.pathname.includes("/api/") || url.pathname.endsWith("/version.json")) {
    return; // Standard-Netzwerkverhalten
  }

  // HTML/Navigation: Network-First, damit neue Funktionen sofort ankommen.
  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  if (isHTML) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  // Sonstige Ressourcen: Cache-First mit Netz-Nachladen.
  e.respondWith(
    caches.match(req).then((m) => m || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => m))
  );
});
