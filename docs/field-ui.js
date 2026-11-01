import { FIELD_SITES, investigationComplete, nearbySite, currentSiteScene } from './engine.js';
import { FIELD_PATHS, fieldStepCost, planFieldRoute } from './field.js';
import { FIELD_ART, landmarkDrawing } from './art.js';
import { watchSummary } from './watch-play.js';

const descriptions={pump:'A light beneath the pump-house door.',corner:'Something pale at the edge of the field.',drain:'Water moving against the slope.',tower:'The ladder. The radio. A way out.'};
const percent=(n,size)=>`${(n+.5)/size*100}%`;
const cost=n=>(Math.ceil(n*10)/10).toFixed(1);

export class FieldMap {
  constructor(root) {
    this.root=root;this.selected=null;this.style='quiet';this.travel=null;this.lastKey='';
    root.innerHTML=`<header class="field-heading"><button class="field-protocol" data-action="rogue-menu">Break protocol ↗</button><p class="eyebrow" id="field-night"></p><button id="field-watch-record" class="watch-record-link" data-action="watch-record" hidden></button><div class="field-exposure"><span>EXPOSURE <b id="field-exposure-value"></b></span><div class="field-meter"><i id="field-exposure-fill"></i></div></div></header>
      <div class="field-board"><span class="field-north" aria-label="North">N<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 1L21 29L12 23L3 29Z" fill="#e8e3c9" stroke="currentColor" stroke-width="1.5"/><path d="M12 1V23L3 29Z" fill="currentColor"/></svg></span><div class="field-map-surface">
        <svg viewBox="-.5 -.5 11 9" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="corn-rows" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M.2 .15L.15 .8M.55 .15L.5 .8M.85 .15L.8 .8" stroke="#768352" stroke-opacity=".18" stroke-width=".025"/></pattern></defs><rect x="-.5" y="-.5" width="11" height="9" fill="url(#corn-rows)"/>
        ${FIELD_PATHS.map(points=>`<polyline points="${points.map(p=>p.join(',')).join(' ')}" class="field-path"/>`).join('')}<g id="field-footprints"></g><polyline id="field-route" class="field-route"/><g id="field-traces"></g></svg>
        ${FIELD_SITES.map(p=>`<button class="field-landmark" data-action="field-select" data-value="${p.id}" style="left:${percent(p.x,11)};top:${percent(p.y,9)}"><span class="field-site-icon" aria-hidden="true">${landmarkDrawing(p.id)}</span><span>${p.label}</span><small></small></button>`).join('')}
        <span id="field-player" class="field-player" aria-hidden="true"></span>
      </div></div>
      <section class="field-route-card" aria-label="Travel plan"><img id="field-route-photo" class="field-route-photo" width="300" height="200" alt="" hidden><div class="field-destination"><div><h3 id="field-destination"></h3></div></div><p id="field-route-note"></p>
        <div class="field-route-options" role="group" aria-label="Choose your route"><button data-action="field-style" data-value="quiet"><b>Follow paths</b><span id="field-quiet-cost"></span></button><button data-action="field-style" data-value="direct"><b>Cut through rows</b><span id="field-direct-cost"></span></button></div>
        <p id="field-risk" role="status"></p><button class="field-go" data-action="field-go"></button><button class="field-stop" data-action="field-stop" hidden>Stop</button>
        <button id="field-dungeon" class="secondary" data-action="dungeon-enter" hidden>Follow the drain below ground ↘</button>
      </section>`;
  }
  reset() { this.selected=null;this.travel=null;this.lastKey=''; }
  choose(s,id) {
    if(this.travel)return;
    s.fieldEvents.journey=null;
    const site=FIELD_SITES.find(p=>p.id===id);if(site)this.selected=id;
    this.render(s);
  }
  recommend(s) {
    const candidates=FIELD_SITES.filter(p=>p.id!=='tower'&&!s.inspected.includes(p.id));
    return candidates.sort((a,b)=>planFieldRoute(s,a).exposure-planFieldRoute(s,b).exposure)[0]?.id||'tower';
  }
  route(s,style=this.style) { return planFieldRoute(s,FIELD_SITES.find(p=>p.id===this.selected),style); }
  start(s) {
    if(this.travel||s.fieldEvents.pending)return false;
    const route=this.route(s);
    if(!route||s.exposure+route.exposure>=100)return false;
    s.fieldEvents.journey={destination:this.selected,style:this.style};
    this.travel={steps:[...route.steps],elapsed:0,interval:this.style==='direct'?.22:.38};this.lastKey='';return true;
  }
  stop(s) { this.travel=null;this.lastKey='';if(s)s.fieldEvents.journey=null; }
  tick(s,dt,step,arrive) {
    if(!this.travel||s.fieldEvents.pending)return;
    this.travel.elapsed+=dt;
    if(this.travel.elapsed<this.travel.interval)return;
    this.travel.elapsed=0;
    const next=this.travel.steps.shift();
    if(next&&!step(next.x-s.player.x,next.y-s.player.y)){this.stop();return;}
    if(s.phase!=='field'){this.stop();return;}
    if(s.fieldEvents.pending)return;
    if(!this.travel.steps.length){this.stop(s);arrive();}
  }
  updateSelection(s,holdDiscovery=false) {
    // The open discovery belongs to the current landmark, not the suggested next
    // stop. Keep the inspection change pending until its card is closed.
    if(holdDiscovery){
      const current=nearbySite(s);
      if(current)this.selected=current.id;
      return;
    }
    if(!this.selected&&s.fieldEvents.journey){this.selected=s.fieldEvents.journey.destination;this.style=s.fieldEvents.journey.style;}
    if(!this.selected||(s.inspected.includes(this.selected)&&!this.travel&&this.lastInspected!==s.inspected.join(',')))this.selected=this.recommend(s);
    this.lastInspected=s.inspected.join(',');
  }
  render(s,paused=false,holdDiscovery=false) {
    const active=s.phase==='field';this.root.hidden=!active;
    if(!active){this.reset();return;}
    this.updateSelection(s,holdDiscovery);
    const key=[s.shift,s.player.x,s.player.y,s.exposure,s.inspected.join(','),this.selected,this.style,!!this.travel,paused,s.fieldEvents.journal.length,!!s.fieldEvents.pending,!!s.expedition?.active].join(':');
    if(key===this.lastKey)return;this.lastKey=key;
    const q=id=>this.root.querySelector(`#${id}`), complete=investigationComplete(s),site=FIELD_SITES.find(p=>p.id===this.selected),quiet=this.route(s,'quiet'),direct=this.route(s,'direct'),here=nearbySite(s)?.id===site.id;
    const route=this.travel?{steps:this.travel.steps,exposure:this.travel.steps.reduce((total,p)=>total+fieldStepCost(s,p.x,p.y),0)}:this.route(s);
    const returning=planFieldRoute({...s,player:site},FIELD_SITES.find(p=>p.id==='tower'));
    const fatal=s.exposure+route.exposure>=100,unsafeReturn=s.exposure+route.exposure+returning.exposure>=100;
    this.root.querySelector('.field-protocol').disabled=paused;
    q('field-night').textContent=`NIGHT 0${s.shift+1}`;
    q('field-watch-record').hidden=!s.watch?.shots;
    if(s.watch?.shots){const record=watchSummary(s);q('field-watch-record').textContent=`Watch · ${record.score} pts ↗`;q('field-watch-record').setAttribute('aria-label',`Watch record. Grade ${record.grade}, ${record.score} points.`);q('field-watch-record').disabled=paused;}
    q('field-exposure-value').textContent=`${Math.floor(s.exposure)} / 100`;
    q('field-exposure-fill').style.width=`${s.exposure}%`;
    this.root.classList.toggle('field-danger',s.exposure>=70);
    this.root.classList.toggle('is-walking',!!this.travel);
    for(const p of FIELD_SITES) {
      const done=s.inspected.includes(p.id),button=this.root.querySelector(`[data-value="${p.id}"]`);
      button.classList.toggle('searched',done);button.classList.toggle('selected',p.id===this.selected);
      button.setAttribute('aria-pressed',String(p.id===this.selected));button.disabled=paused||!!this.travel;
      button.querySelector('small').textContent=p.id==='tower'?'':done?'✓':'◇';
      button.querySelector('small').hidden=p.id==='tower';
      button.querySelector('small').setAttribute('aria-hidden','true');
      button.setAttribute('aria-label',`${p.label}. ${p.id==='tower'?'Return to tower':done?'Searched':'Unread discovery'}`);
    }
    const player=q('field-player');player.style.left=percent(s.player.x,11);player.style.top=percent(s.player.y,9);
    player.classList.toggle('at-landmark',!!nearbySite(s));
    q('field-footprints').innerHTML=s.visited.filter(p=>typeof p==='string').map(p=>{const [x,y]=p.split(',').map(Number);return `<circle cx="${x}" cy="${y}" r=".06" fill="#c6b789" opacity=".5"/>`;}).join('');
    q('field-traces').innerHTML=s.fieldEvents.journal.map(j=>`<path d="M${j.x-.12} ${j.y-.12}l.24 .24m0 -.24l-.24 .24" stroke="#803f2f" stroke-width=".065"/>`).join('');
    const visibleSteps=this.travel?this.travel.steps:route.steps;
    q('field-route').setAttribute('points',[s.player,...visibleSteps].map(p=>`${p.x},${p.y}`).join(' '));
    q('field-destination').textContent=site.label;
    const photo=q('field-route-photo'),art=FIELD_ART[site.id];
    photo.hidden=site.id!=='tower'&&!s.inspected.includes(site.id);
    if(!photo.hidden){const src=`./assets/${art.file}.webp`;if(photo.getAttribute('src')!==src)photo.setAttribute('src',src);photo.alt=art.alt;}
    const scene=here?currentSiteScene(s):null;
    q('field-route-note').textContent=this.travel?['The rows close behind your light.','Footsteps keep time on the other side of the row.','Your breathing comes back through the radio.'][s.shift]:scene?scene.cue:descriptions[site.id];
    q('field-quiet-cost').textContent=`+${cost(quiet.exposure)} exposure`;
    q('field-direct-cost').textContent=`+${cost(direct.exposure)} exposure`;
    this.root.querySelectorAll('[data-action="field-style"]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.value===this.style));b.disabled=paused||!!this.travel;});
    this.root.querySelector('.field-route-options').hidden=here;
    q('field-risk').textContent=fatal?'Route blocked: exposure would reach 100.':unsafeReturn?'Too much exposure to make it back.':site.id==='tower'&&!complete?'Search all three sites before debrief.':'';
    q('field-risk').hidden=!q('field-risk').textContent;
    q('field-risk').classList.toggle('risky',fatal||unsafeReturn);
    const go=this.root.querySelector('.field-go');go.hidden=!!this.travel;
    go.textContent=here?(site.id==='tower'?(complete?'Debrief ↗':'Choose a landmark'):scene?scene.label:s.inspected.includes(site.id)?'Location searched':'Inspect'):(site.id==='tower'?'Return ↑':'Walk →');
    go.disabled=paused||fatal||(here&&(site.id==='tower'?!complete:s.inspected.includes(site.id)&&!scene));
    const stop=this.root.querySelector('.field-stop');stop.hidden=!this.travel;stop.disabled=paused;
    // The next suggested landmark can change as soon as the drain is inspected.
    // Keep its new passage available at the player's actual location.
    const dungeon=q('field-dungeon');
    dungeon.hidden=nearbySite(s)?.id!=='drain'||!s.inspected.includes('drain')||!!this.travel;
    dungeon.disabled=paused||!!s.fieldEvents.pending||!!s.expedition?.active;
  }
}
