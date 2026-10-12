// Service worker do Muscle Land: guarda o app para funcionar sem internet.
const CACHE = "ciclo-de-ferro-51e03262ab";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "fonts/anton-latin-400-normal.woff2", "fonts/barlow-semi-condensed-latin-400-normal.woff2", "fonts/barlow-semi-condensed-latin-500-normal.woff2", "fonts/barlow-semi-condensed-latin-600-normal.woff2", "fonts/barlow-semi-condensed-latin-700-normal.woff2", "fonts/permanent-marker-latin-400-normal.woff2", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/og-image.jpg", "vendor/chart.umd.js", "vendor/zxing.min.js"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("ciclo-de-ferro-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts e outros: direto da rede

  if (req.mode === "navigate"){
    // Página: tenta a rede (pega atualizações) e cai para o cache quando offline
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("index.html", copy));
        return res;
      }).catch(() => caches.match("index.html", {ignoreSearch:true}).then(r => r || caches.match("./")))
    );
    return;
  }
  // Fontes, ícones e bibliotecas: do cache primeiro
  event.respondWith(caches.match(req, {ignoreSearch:true}).then(hit => hit || fetch(req).then(res => {
    if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
