/* Mi música: notificaciones y app disponible sin conexión.
   - La página se pide siempre primero a internet (así llegan las versiones nuevas) y,
     si no hay conexión o tarda demasiado, se abre la copia guardada en el dispositivo.
   - La comprobación de actualizaciones va siempre a internet: sin conexión no da
     una respuesta falsa de «ya tienes la última versión».
   - Las canciones no pasan por aquí: ya están guardadas dentro de la app. */
const CACHE = "mimusica-app-v2";
const SCOPE = self.registration.scope;
const PAGE = SCOPE; // la app se guarda siempre bajo la dirección raíz
const EXTRA = ["manifest.webmanifest", "icono.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { const r = await fetch(PAGE, { cache: "reload" }); if (r.ok) await c.put(PAGE, r); } catch (_) {}
    await Promise.allSettled(EXTRA.map(u => c.add(new Request(new URL(u, SCOPE).href, { cache: "reload" }))));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("mimusica-app-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const isPage = (req, url) => req.mode === "navigate" ||
  (url.origin === location.origin && (url.href.split(/[?#]/)[0] === SCOPE || /\/index\.html$/.test(url.pathname)));

async function networkFirstPage(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req).then(async r => { if (r.ok && r.type !== "opaqueredirect") await c.put(PAGE, r.clone()); return r; });
  const timeout = new Promise(res => setTimeout(() => res(null), 3500));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
    const cached = await c.match(PAGE);
    return cached || await net;
  } catch (_) {
    const cached = await c.match(PAGE);
    if (cached) return cached;
    throw _;
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => null);
  return cached || (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Comprobación de versión nueva (cache:"reload"): solo internet
  if (req.cache === "reload" && url.origin === location.origin) return;
  if (isPage(req, url)) { e.respondWith(networkFirstPage(req)); return; }
  if (url.origin === location.origin && EXTRA.some(u => url.pathname.endsWith("/" + u))) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  // Todo lo demás (Deezer, portadas, letras…) va a internet como siempre
});

/* ---------- Notificaciones ---------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Mi música", {
    body: d.body || "Hay una versión nueva de la app.",
    icon: "icono.png", badge: "icono.png", tag: d.tag || "mi-musica", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", SCOPE).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(SCOPE)) { await c.focus(); c.postMessage({ type: "check-update" }); return; }
    await self.clients.openWindow(url);
  })());
});
