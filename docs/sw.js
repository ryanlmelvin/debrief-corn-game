// Bump this version whenever a shipped asset changes. An active game keeps its
// current worker; the new version activates after all old game tabs close.
const VERSION = 'debrief-v13';
const DEVELOPMENT = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const SCOPE = new URL('./', self.location.href).pathname;
const CACHE_PREFIX = `debrief:${SCOPE}:`;
const CACHE = CACHE_PREFIX + VERSION;
const FILES = ['./','./index.html','./style.css','./app.js','./engine.js','./guide.js','./renderer.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(FILES);
  if(DEVELOPMENT)await self.skipWaiting();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(DEVELOPMENT){try{const response=await fetch(event.request);if(response.ok)return response;}catch{ /* Use cached assets while offline. */ }}
    const cached=await cache.match(event.request,{ignoreSearch:true});
    if(cached)return cached;
    try{return await fetch(event.request);}
    catch(error){if(event.request.mode==='navigate')return await cache.match('./index.html');throw error;}
  })());
});
