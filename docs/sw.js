// Bump this version whenever a shipped asset changes. An active game keeps its
// current worker; the new version activates after all old game tabs close.
const VERSION = 'debrief-v107-guided-crossing';
const DEVELOPMENT = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const SCOPE = new URL('./', self.location.href).pathname;
const CACHE_PREFIX = `debrief:${SCOPE}:`;
const CACHE = CACHE_PREFIX + VERSION;
const FILES = ['./assets/rescue-boot.webp','./transmission.js','./transmission-ui.js','./transmission.css','./rescue.js','./rescue-ui.js','./rescue.css','./resolution-games.js','./resolution-games-ui.js','./resolution-games.css','./dungeon-debrief.js','./mini-games.js','./mini-games.css','./dungeon.js','./dungeon-ui.js','./dungeon.css','./seen-endings.js','./rogue.js','./rogue-ui.js','./rogue-endings.js','./rogue.css','./assets/rogue-corn.jpg','./assets/rogue-bullet.png','./assets/rogue-car.png','./alternate-endings.js','./resolution-ui.js','./assets/ending-relief.webp','./assets/ending-witness.webp','./assets/ending-rescue.webp','./assets/ending-vacancy.webp','./assets/ending-transmission.webp','./watch-play.js','./watch-ui.js','./watch-play.css','./image-viewer.js','./image-viewer.css','./','./index.html','./style.css','./art.css','./field-kit.css','./mobile.css','./pager.css','./pager.js','./decision-copy.js','./art.js','./app.js','./progress.js','./sharing.js','./share.css','./audio.js','./audio-events.js','./assets/crickets.mp3','./assets/footstep.mp3','./assets/leaves.mp3','./assets/radio-static.mp3','./assets/lost-in-a-bad-place.mp3','./pressure-word.js','./engine.js','./ending-requirements.js','./encounters.js','./site-encounters.js','./story-random.js','./evidence-scenes.js','./evidence-flavors.js','./assets/discovery-dress.webp','./assets/discovery-ledger.webp','./assets/discovery-roots.webp','./assets/discovery-badge.webp','./assets/discovery-sample.webp','./assets/discovery-teeth.webp','./assets/discovery-map.webp','./assets/discovery-water.webp','./assets/discovery-glove.webp','./encounter-flavors.js','./encounter-detours.js','./ending-paths.js','./field.js','./field-ui.js','./guide.js','./renderer.js','./watch-story.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./assets/encounter-radio.webp','./assets/encounter-tracks.webp','./assets/encounter-lantern.webp','./assets/encounter-unattended-lamp.webp','./assets/encounter-extra-step.webp','./assets/encounter-second-call.webp','./assets/encounter-moved-crossing.webp','./assets/encounter-two-towers.webp','./assets/encounter-future-call.webp','./assets/encounter-root-knot.webp','./assets/encounter-your-outline.webp','./assets/encounter-last-follower.webp','./assets/debrief-desk.webp','./assets/field-corner.webp','./assets/field-drain.webp','./assets/field-pump.webp','./assets/field-sighting.webp','./assets/pump-stove.webp','./assets/pump-drips.webp','./assets/pump-glass.webp','./assets/pump-ledger.webp','./assets/pump-keys.webp','./assets/pump-thread.webp','./assets/pump-window.webp','./assets/notebook-paper.webp','./assets/specimen-studies.webp','./assets/station-kit.webp','./assets/survey-paper.webp','./assets/watch-corn.webp','./assets/watch-figure.webp','./assets/watch-retrieval.webp','./assets/watch-anatomy.webp','./assets/watch-human-anatomy.webp','./assets/field-retrieval.webp','./assets/watch-hazmat.webp','./assets/field-hazmat.webp'];
for (const code of ['01','02','02-team','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24']) FILES.push(`./share/${code}/`, `./share/${code}/preview.jpg`);
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
