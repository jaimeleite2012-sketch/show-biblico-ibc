const CACHE_NAME='concurso-biblico-v13-6-fases-20260623';
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./phaseBankManifest.js','./phases/fase1.js','./phases/fase2.js','./phases/fase3.js','./phases/fase4.js','./phases/fase5.js','./phases/desafio_final.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)).catch(()=>caches.match('./index.html')))});
