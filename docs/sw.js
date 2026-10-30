// Bump this version whenever a shipped asset changes. An active game keeps its
// current worker; the new version activates after all old game tabs close.
const VERSION = 'debrief-v74-redacted-speaker';
const DEVELOPMENT = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const SCOPE = new URL('./', self.location.href).pathname;
const CACHE_PREFIX = `debrief:${SCOPE}:`;
const CACHE = CACHE_PREFIX + VERSION;
const FILES = ['./image-viewer.js','./image-viewer.css','./','./index.html','./style.css','./art.css','./field-kit.css','./mobile.css','./pager.css','./pager.js','./decision-copy.js','./art.js','./app.js','./progress.js','./sharing.js','./share.css','./audio.js','./audio-events.js','./assets/crickets.mp3','./assets/footstep.mp3','./assets/leaves.mp3','./assets/radio-static.mp3','./assets/lost-in-a-bad-place.mp3','./pressure-word.js','./engine.js','./ending-requirements.js','./encounters.js','./field.js','./field-ui.js','./guide.js','./renderer.js','./watch-story.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./assets/encounter-radio.webp','./assets/encounter-tracks.webp','./assets/encounter-lantern.webp','./assets/encounter-unattended-lamp.webp','./assets/encounter-extra-step.webp','./assets/encounter-second-call.webp','./assets/encounter-moved-crossing.webp','./assets/encounter-two-towers.webp','./assets/encounter-future-call.webp','./assets/encounter-root-knot.webp','./assets/encounter-your-outline.webp','./assets/encounter-last-follower.webp','./assets/debrief-desk.webp','./assets/field-corner.webp','./assets/field-drain.webp','./assets/field-pump.webp','./assets/field-sighting.webp','./assets/pump-stove.webp','./assets/notebook-paper.webp','./assets/specimen-studies.webp','./assets/station-kit.webp','./assets/survey-paper.webp','./assets/watch-corn.webp','./assets/watch-figure.webp','./assets/watch-retrieval.webp','./assets/watch-anatomy.webp','./assets/field-retrieval.webp','./assets/watch-hazmat.webp','./assets/field-hazmat.webp'];
for (const code of ['01','02','02-team','03','04','05','06','07','08','09']) FILES.push(`./share/${code}/`, `./share/${code}/preview.jpg`);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // A new worker must not populate its new cache with an older HTTP-cached build.
  // Store under canonical URLs so module imports and offline navigation agree.
  await Promise.all(FILES.map(async file=>{
    const canonical=new URL(file,self.location.href);
    const download=new URL(canonical);
    download.searchParams.set('release',VERSION);
    const response=await fetch(download.href,{cache:'reload'});
    if(!response.ok)throw new Error(`Could not download ${file}: ${response.status}`);
    await cache.put(canonical.href,response);
  }));
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
