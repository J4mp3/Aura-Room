// Service worker de la app de sellos (generado por el TarjetaEditor).
// Permite instalarla y abrirla sin internet. Siempre busca primero la versión más nueva.
const CACHE_NAME = 'sellos-aura-room-2026-10-29.3';
const APP_SHELL = ["./","./index.html","./manifest.json","./icon-192.png","./icon-512.png","./logo.png"];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(CACHE_NAME).then(function(c){ return c.addAll(APP_SHELL).catch(function(){}); })); self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); })); })); self.clients.claim(); });
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function(r){ if(r && r.status === 200){ var cp = r.clone(); caches.open(CACHE_NAME).then(function(c){ c.put(e.request, cp); }); } return r; })
    .catch(function(){ return caches.match(e.request, { ignoreSearch: true }).then(function(m){ return m || caches.match('./index.html'); }); }));
});
