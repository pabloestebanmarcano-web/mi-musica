/* Mi música: recibe las notificaciones aunque la app esté cerrada.
   No guarda nada en caché, para no interferir con las actualizaciones. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Mi música";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Hay una versión nueva de la app.",
    icon: "icono.png",
    badge: "icono.png",
    tag: d.tag || "mi-musica",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: "check-update" }); return; } }
    await self.clients.openWindow(url);
  })());
});
