// A minimal installable shell. Never cache APIs, accounts, or user content.
const CACHE='edutech-static-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/static/styles.css','/static/favicon.svg','/static/offline.html'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('edutech-static-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/static/offline.html')));});
