// Service worker do Muscle Land: guarda o app para funcionar sem internet.
const CACHE = "ciclo-de-ferro-cardio-3";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "fonts/anton-latin-400-normal.woff2", "fonts/barlow-semi-condensed-latin-400-normal.woff2", "fonts/barlow-semi-condensed-latin-500-normal.woff2", "fonts/barlow-semi-condensed-latin-600-normal.woff2", "fonts/barlow-semi-condensed-latin-700-normal.woff2", "fonts/permanent-marker-latin-400-normal.woff2", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/og-image.jpg", "vendor/chart.umd.js", "vendor/fbsdk.js", "vendor/zxing.min.js", "data/taco.js"];

self.addEventListener("install", event => {
  // cache:"reload" pula o cache HTTP do navegador: a versão nova nunca guarda um arquivo velho
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache:"reload"})))).then(() => self.skipWaiting()));
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

// Lembretes (Firebase Cloud Messaging): mostra a notificação e abre o app ao tocar
self.addEventListener("push", event => {
  let p = {};
  try{ p = event.data ? event.data.json() : {}; }catch(e){ p = {data:{body: event.data && event.data.text()}}; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || "Muscle Land", body = d.body || n.body || "";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon:"icons/icon-192.png", badge:"icons/favicon-32.png", tag: d.tag || "lembrete", renotify:true,
    data:{url: d.url || "./"}
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
    for (const c of list){ if (c.url.startsWith(self.registration.scope)){ c.focus(); if ("navigate" in c) c.navigate(url); return; } }
    return self.clients.openWindow(url);
  }));
});
