import './image-viewer.js';
import { watchNight, sightingPromptReady } from './watch-story.js';
import { guideTravel, guideRouteStatus, inspectGuide, spareGuide, fireGuide, focusGuide, nearbyGuideSite, guideDebrief, answerGuideDebrief, isGuideAftermath } from './guide.js';
import { createGame, startShift, advance, reload, shoot, focusNext, enterField, move, inspect, canEatCrop, eatCrop, nearbySite, investigationPressure, investigationComplete, beginDebrief, chooseFieldEncounter, continueFieldEncounter, getQuestion, getEnding, answer, serialize, restore, BRIEFINGS, EVIDENCE, ENDINGS, DATES, REPORT_DATES, SHIFT_LENGTH, COMPULSION_NOTICE } from './engine.js';
import { Renderer, visibleGuideTarget } from './renderer.js';
import { FieldMap } from './field-ui.js';
import { dialogArtwork, evidenceMount, notebookMarkup, encounterMarkup, interviewRecord } from './art.js';
import { GameAudio, loadMusic, loadEffects } from './audio.js';
import { SoundEvents } from './audio-events.js';
import { pressureWordMarkup } from './pressure-word.js';
import { DialogPager } from './pager.js';
import { endingShareData, shareEnding } from './sharing.js';
import { decisionQuestion } from './decision-copy.js';
import { InstallHandoff, recoverInstallHandoff, progressSnapshot, encodeProgress, decodeProgress, storeProgress, MAX_PROGRESS_BYTES } from './progress.js';

const $ = id => document.getElementById(id);
const canvas=$('field'), renderer=new Renderer(canvas), dialog=$('paper-dialog');
const pager=new DialogPager(dialog);
let modalReturnFocus=null;
const fieldMap=new FieldMap($('field-exploration'));
$('investigate-urge').innerHTML=pressureWordMarkup();
const menu=$('game-menu');
const menuOpen=()=>menu.matches(':popover-open');
menu.addEventListener('toggle',()=>{syncAudio();if(menuOpen())save();});
menu.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('[popovertarget]'))menu.hidePopover();});
const HISTORY_KEY=`debrief-history-v1:${new URL('.',location.href).pathname}`;
const SAVE_KEY=`debrief-save-v1:${new URL('.',location.href).pathname}`;
const progressKeys={save:SAVE_KEY,history:HISTORY_KEY};
const progressPath=new URL('.',location.href).pathname;
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installHandoff=new InstallHandoff(document,progressPath,isInstalled);
let game=null, paused=false, modalKind='', lastModalKey='', lastControlsKey='', lastLog='', lastFrame=0, lastSave=0, lastUI=0, toastTimer, installPrompt=null;
let audioContext=null, soundscape=null, soundEnabled=false, storageWarned=false;
const soundEvents=new SoundEvents();
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let carriedProgress=false;
try { if(isInstalled())carriedProgress=await recoverInstallHandoff(document,progressPath,localStorage,progressKeys); } catch {}
function readSave() { try { return restore(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
let history={ collected: [], runs: [] };
try { const stored=JSON.parse(localStorage.getItem(HISTORY_KEY)); if(stored && Array.isArray(stored.collected) && Array.isArray(stored.runs)){history.collected=stored.collected.filter(id=>Object.hasOwn(ENDINGS,id));history.runs=stored.runs.filter(r=>r&&typeof r.id==='string'&&Object.hasOwn(ENDINGS,r.ending)&&Array.isArray(r.reports)).slice(0,30);} } catch {}
function updateHistoryCount(){ $('records').textContent=`Records · ${history.collected.length}/${Object.keys(ENDINGS).length}`; }
updateHistoryCount();
function archiveRun(){
  if(!game || game.phase!=='ending')return;
  const e=getEnding(game);
  const existing=history.runs.find(r=>r.id===game.runId);
  if(existing){
    if(existing.stamp===e.stamp)return;
    // A resumed ending can fill in the outcome omitted by older archives.
    existing.stamp=e.stamp;
  }else{
    if(!history.collected.includes(game.ending))history.collected.push(game.ending);
    history.runs.unshift({id:game.runId,ending:game.ending,title:e.title,text:e.text,last:e.last,stamp:e.stamp,reports:game.reports.map(r=>({...r})),date:new Date().toISOString()});
  }
  history.runs=history.runs.slice(0,30);
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{toast('Records are available for this session. Your browser could not save them.');}
  updateHistoryCount();
  installHandoff.update(game||readSave(),history);
}
function showRecords() {
  archiveRun();
  const collection=Object.entries(ENDINGS).map(([id,e])=>`<li class="ending-slot ${history.collected.includes(id)?'collected':''}"><span>${e.code}</span> ${history.collected.includes(id)?esc(e.title):'Unrecorded'}</li>`).join('');
  const runs=history.runs.map((r,i)=>`<button class="choice" data-action="record-run" data-value="${i}">${esc(r.title)}<small>${esc(new Date(r.date).toLocaleDateString())} · Read transcript →</small></button>`).join('');
  showModal('records',paper('Your records.',`<p class="small">${history.collected.length} of ${Object.keys(ENDINGS).length} endings recorded on this device.</p><ol class="ending-collection">${collection}</ol>${runs?`<h3>Past assignments</h3><div class="choices">${runs}</div>`:'<p>No completed assignments yet.</p>'}<button class="primary" data-action="close">Close records ↗</button>`,'PRIVATE ARCHIVE'));
}
$('records').addEventListener('click',showRecords);
let saved=readSave();
$('resume').hidden=!saved;
installHandoff.update(saved,history);
if(carriedProgress)toast('Your browser progress is ready. Continue your shift or open Records.');
function save() {
  if(!game)return;
  try { localStorage.setItem(SAVE_KEY,serialize(game));saved=game;$('save-status').textContent='PROGRESS SAVED ON THIS DEVICE';installHandoff.update(game,history); }
  catch { $('save-status').textContent='SAVING UNAVAILABLE';if(!storageWarned){toast('Your browser is blocking local saves. Keep this tab open to retain your progress.');storageWarned=true;} }
}
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000); }
const compulsionNotice=$('compulsion-notice');
let compulsionTimer;
function showCompulsionNotice() {
  const available=game?.phase==='field'&&!paused&&!dialog.open&&!menuOpen();
  if(!available){if(compulsionNotice.matches(':popover-open'))compulsionNotice.hidePopover();return;}
  if(!game.compulsionNotice||compulsionNotice.matches(':popover-open'))return;
  $('compulsion-message').textContent=COMPULSION_NOTICE;
  compulsionNotice.showPopover();
  clearTimeout(compulsionTimer);
  compulsionTimer=setTimeout(()=>{if(compulsionNotice.matches(':popover-open'))compulsionNotice.hidePopover();},8000);
  save();
}
compulsionNotice.addEventListener('beforetoggle',event=>{
  if(event.newState!=='closed')return;
  clearTimeout(compulsionTimer);
  if(game)game.compulsionNotice=false;
  save();syncAudio();
});
const REDACTED_TOWN = '<span class="censor-bar" role="img" aria-label="Town name redacted"></span>';
function paper(title,body,tag='') {
  return `<article class="paper"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button>${tag?`<div class="paper-top"><span>STATION 04</span><span>${tag}</span></div>`:''}<h2 id="dialog-title" tabindex="-1">${title}</h2>${body}</article>`;
}
function showModal(kind,html) {
  modalReturnFocus=menuOpen()?$('game-menu-toggle'):null;
  if(menuOpen())menu.hidePopover();
  modalKind=kind;$('dialog-content').innerHTML=html;
  dialog.dataset.kind=kind;
  const artwork=dialogArtwork(kind,game?.shift);
  if(artwork)$('dialog-content').querySelector('.paper')?.insertAdjacentHTML('afterbegin',artwork);
  if(kind==='debrief')$('dialog-content').querySelector('.interview-scene')?.insertAdjacentHTML('beforeend',interviewRecord(game));
  if(!dialog.open)dialog.showModal();
  pager.refresh();
  dialog.scrollTop=0;
  $('dialog-title')?.focus({preventScroll:true});
  syncAudio();
}
function closeModal() {dialog.close();modalKind='';syncAudio();const target=modalReturnFocus||(game?.phase==='field'?$('field-exploration').querySelector('button.field-go:not([hidden]),button.field-stop:not([hidden])'):canvas);target?.focus({preventScroll:true});modalReturnFocus=null;}
function begin(mode,fromSave=false) {
  if(compulsionNotice.matches(':popover-open'))compulsionNotice.hidePopover();
  clearTimeout(compulsionTimer);
  if($('guide-aftermath').matches(':popover-open'))$('guide-aftermath').hidePopover();
  game=fromSave?readSave():createGame(mode);
  if(!game){toast('The saved shift could not be read. You can start a new one.');return;}
  soundEvents.reset(game);
  paused=false;lastModalKey='';lastControlsKey='';lastLog='';
  fieldMap.reset();
  $('notebook').hidden=false;$('menu-radio').hidden=false;$('assignment').hidden=false;
  $('welcome').hidden=true;$('sidebar').hidden=false;$('pause').hidden=false;document.body.classList.add('playing');
  if(dialog.open)closeModal();updateUI(true);save();
}
function sceneDialog() {
  if(!game)return;
  const pending=game.fieldEvents.pending;
  const key=`${game.phase}:${game.shift}:${game.question}:${game.ending}:${game.incident}:${sightingPromptReady(game)}:${pending?.id}:${pending?.choice}:${game.guide?.stage}:${game.guide?.debriefQuestion}`;
  if(key===lastModalKey)return;
  lastModalKey=key;
  if(game.phase==='field'&&pending){showModal('encounter',encounterMarkup(game));save();return;}
  if(game.phase==='briefing') {
    const b=BRIEFINGS[game.shift];
    showModal('briefing',paper(b.title,`<p class="eyebrow">SHIFT ${game.shift+1} / ${DATES[game.shift]}, <span class="redacted-text">19XX</span></p><p>${esc(b.text).replaceAll('██████', REDACTED_TOWN)}</p><ol class="orders">${b.orders.map((o,i)=>`<li><span>0${i+1}</span>${o}</li>`).join('')}</ol>${b.note?`<p class="note">${b.note}</p>`:''}${game.shift===0?'<p class="small"><span class="touch-help">Tap moving corn to fire. Tap Reload to refill your rifle. People are not targets.</span><span class="keyboard-help">Click to fire. <b>X</b> aims, <b>Space</b> fires, <b>R</b> reloads. People are not targets.</span></p>':''}<button class="primary" data-action="start">Take your post <span>↗</span></button>`, 'SHIFT ORDERS'));
  } else if(sightingPromptReady(game) && !game.incidentPrompted) {
    game.incidentPrompted=true;
    showModal('sighting',paper('Movement in the field.', `<p>${watchNight(game.shift).notice}</p><p class="small">Leaving now means any loose crops can cross the perimeter.</p><div class="paper-actions"><button class="primary" data-action="confirm-enter">Investigate now ↗</button><button class="secondary" data-action="close">Stay at my post</button></div>`, 'FIELD OBSERVATION'));
    save();
  } else if(game.phase==='debrief') {
    const q=decisionQuestion(game);
    showModal('debrief',paper('For the record.',`<p class="eyebrow">${REPORT_DATES[game.shift]}, <span class="redacted-text">19XX</span></p>${game.question<3?`<span class="question-num" aria-label="Question ${game.question+1} of 3">${game.question+1} / 3</span>`:''}<div class="interview-question"><span class="speaker-label">SUPERVISOR</span><p>${esc(q.prompt)}</p></div><p class="note"><span class="decision-note-label">${esc(q.contextLabel)}</span> ${esc(q.context)}</p><div class="choices" role="group" aria-label="Your response"><span class="speaker-label">YOUR RESPONSE</span>${q.options.map((o,i)=>`<button class="choice" data-action="answer" data-value="${o.id}" ${o.disabled?'disabled':''}><span class="response-key" aria-hidden="true">${String.fromCharCode(65+i)}</span><span>${esc(o.label)}${o.detail?`<small>${esc(o.detail)}</small>`:''}${o.requirements?`<small class="ending-requirements">${o.requirements.map(r=>`<span class="ending-requirement ${r.met?'requirement-met':'requirement-unmet'}"><span aria-hidden="true">${r.met?'✓':'✗'}</span> <span class="sr-only">${r.met?'Met':'Unmet'}: </span>${esc(r.label)}${r.target>1?` ${r.current}/${r.target}`:''}</span>`).join('')}</small>`:''}</span></button>`).join('')}</div>`, 'DEBRIEF TRANSCRIPT'));
  } else if(game.phase==='guide' && game.guide.stage==='debrief') {
    const q=guideDebrief(game);
    showModal('guide-debrief',paper('After the recovery.',`<p class="eyebrow">RECOVERY DETAIL / RECORDED INTERVIEW</p><span class="question-num" aria-label="Question ${game.guide.debriefQuestion+1} of 2">${game.guide.debriefQuestion+1} / 2</span><div class="interview-question"><span class="speaker-label">${esc(q.speaker||'SUPERVISOR')}</span><p>${esc(q.prompt)}</p></div><p class="note">${esc(q.context)}</p><div class="choices" role="group" aria-label="Your response"><span class="speaker-label">YOUR RESPONSE</span>${q.options.map((o,i)=>`<button class="choice" data-action="guide-answer" data-value="${o.id}"><span class="response-key" aria-hidden="true">${String.fromCharCode(65+i)}</span><span>${esc(o.label)}</span></button>`).join('')}</div>`, 'RECOVERY DEBRIEF'));
  } else if(game.phase==='guide' && game.guide.steps === 0) {
    showModal('guide-intro',paper('Between the rows.', '<p>Three recovery personnel wait beneath the tower. You take the rifle. They take lamps.</p><p class="note">“You know the way,” one of them says.</p><p class="small"><span class="touch-help">Tap Lead to follow the path. The team stops at each discovery so you can examine it.</span><span class="keyboard-help"><b>Space</b> or <b>W</b> leads onward or stops. The path turns for you. Press <b>E</b> to examine each discovery.</span></p><button class="primary" data-action="close">Lead them in ↗</button>', 'RECOVERY DETAIL'));
  } else if(game.phase==='ending') {
    archiveRun();
    const e=getEnding(game);
    if(isGuideAftermath(game)){
      $('aftermath-message').textContent=e.last;
      if(!$('guide-aftermath').matches(':popover-open'))$('guide-aftermath').showPopover();
      return;
    }
    showModal('ending',paper(e.title,`<p class="eyebrow">ENDING ${e.code} / ${String(Object.keys(ENDINGS).length).padStart(2,'0')}</p><p>${e.text}</p><p class="note">${e.last}</p><div class="stamp">${e.stamp}</div><div class="receipt-stats"><span>CROPS CONTAINED<strong>${game.kills}</strong></span><span>EXHIBITS RETAINED<strong>${game.evidence.length}</strong></span><span>PERIMETER BREACHES<strong>${game.breaches}</strong></span></div><div class="paper-actions"><button class="primary" data-action="restart">Another assignment ↗</button><button class="secondary" data-action="share-ending">Share ending ↗</button><button class="secondary" data-action="export">Keep the transcript ↓</button><button class="secondary" data-action="records">Records</button></div>`, 'FINAL DISPOSITION'));
  }
}
function stat(label,value,sub='',percent=null,warning=false) {return `<div class="stat ${warning?'warning':''}"><label>${label}</label><strong>${value}</strong><small> ${sub}</small>${percent!==null?`<div class="meter"><span style="width:${Math.min(100,Math.max(0,percent))}%"></span></div>`:''}</div>`;}
function updateUI(force=false) {
  if(!game)return;
  document.body.dataset.phase=game.phase;
  const aftermath=isGuideAftermath(game);
  $('stats').hidden=aftermath;
  $('pause').hidden=game.phase==='ending';
  const phase=game.phase,field=phase==='field',site=nearbySite(game),active=phase==='tower';
  $('date-label').textContent=`${DATES[game.shift]}, ████`;
  $('station-status').textContent=field?'RADIO SIGNAL WEAK':phase==='ending'?'FILE CLOSED':'PERIMETER ACTIVE';
  $('phase-label').textContent=field?'FIELD INVESTIGATION':phase==='debrief'?'RECORDED INTERVIEW':'WATCHTOWER';
  $('shift-number').textContent=`0${game.shift+1} / 03`;
  $('objective').textContent=field?(site?.label||'Find your way through.'):'Watch the corn.';
  $('objective-detail').textContent=field?(investigationComplete(game)?'Return to the watchtower.':'Follow the unread markers.'):'Shoot any that try to escape.';
  $('stats').innerHTML=field?stat('EXPOSURE',Math.floor(game.exposure),' / 100',game.exposure,game.exposure>=70)+stat('SEARCHED',['corner','pump','drain'].filter(id=>game.inspected.includes(id)).length,'/ 3'):stat('RELIEF IN',Math.max(0,Math.ceil(SHIFT_LENGTH-game.time)),'sec',(SHIFT_LENGTH-game.time)/SHIFT_LENGTH*100)+stat('BREACHES',game.breaches,'/ 6',game.breaches/6*100,game.breaches>=3);
  const pressure=investigationPressure(game), pressureLayer=$('investigation-pressure');
  pressureLayer.hidden=!pressure||paused;
  pressureLayer.classList.toggle('pressure-held',dialog.open||menuOpen());
  if(pressure){
    pressureLayer.style.setProperty('--growth',String(Math.max(0,(pressure.strength-.22)/.78)));
    pressureLayer.style.setProperty('--pressure',String(pressure.strength));
  }
  $('tower-hud').hidden=!active;
  $('hud-ammo').textContent=`${game.rounds} / ${game.reserve} · .22`;
  $('hud-reload').disabled=paused||game.reload>0||game.rounds===6||game.reserve===0;
  $('hud-reload').classList.toggle('needs-reload',active&&!$('hud-reload').disabled&&game.rounds===0);
  $('hud-reload').textContent=game.reload>0?'↻ Reloading…':'↻ Reload';
  $('hud-reload').setAttribute('aria-label',`Reload rifle. ${game.rounds} rounds loaded, ${game.reserve} in reserve.`);
  $('controls').hidden=active||field;
  $('evidence-count').textContent=String(game.evidence.length).padStart(2,'0');
  $('control-hint').textContent=field?'ARROWS / WASD TO MOVE · E TO INSPECT':active?'CLICK / TAP FIRE · R RELOAD':'STATION 04';
  if(phase!=='guide'&&!aftermath)canvas.setAttribute('aria-label',field?`Field survey. Your position is column ${game.player.x+1}, row ${game.player.y+1}. ${site?site.label+'. ':''}Gold page markers show tonight’s unread discoveries. Check marks show searched locations. Use arrow keys or WASD to move. E to inspect. Watchtower is column 2 row 8; pump house column 4 row 4; drainage channel column 8 row 6; northeast corner column 10 row 2.`:'Watchtower shooting gallery. Click moving corn to fire. X selects a crop. Space fires. R reloads.');
  const controlKey=[phase,paused,game.incident,game.rounds,game.reserve,game.reload>0,site?.id,game.inspected.join(',')].join(':');
  if(phase!=='guide'&&(force||controlKey!==lastControlsKey)) {
    lastControlsKey=controlKey;
    const focusedAction=$('controls').contains(document.activeElement)?document.activeElement.dataset.action:null;
    let html=aftermath?'<button class="primary" data-action="restart">Another assignment ↗</button><button class="secondary" data-action="records">View records</button><button class="secondary" data-action="share-ending">Share ending ↗</button><button class="secondary" data-action="export">Keep the transcript ↓</button>':'';
    if(field){
      html='<div class="dpad" aria-label="Walk through the field"><button class="up" data-action="move" data-value="0,-1" aria-label="Move north">↑</button><button class="left" data-action="move" data-value="-1,0" aria-label="Move west">←</button><button class="down" data-action="move" data-value="0,1" aria-label="Move south">↓</button><button class="right" data-action="move" data-value="1,0" aria-label="Move east">→</button></div>';
      if(site?.id==='tower'){if(investigationComplete(game))html+='<button class="primary" data-action="debrief">Return / submit report ↗</button>';}
      else if(site)html+=`<button class="primary" data-action="inspect" ${game.inspected.includes(site.id)?'disabled':''}>${game.inspected.includes(site.id)?'Location searched':'Inspect '+site.label.toLowerCase()}</button>`;
      if(canEatCrop(game))html+='<button data-action="corn">Follow the cooking smell</button>';
      else if(!site)html+='<small>Walk to a marked location to inspect it. Each move costs exposure.</small>';
    }
    $('controls').innerHTML=html;
    if(paused)$('controls').querySelectorAll('button').forEach(button=>button.disabled=true);
    if(focusedAction)$('controls').querySelector(`[data-action="${focusedAction}"]`)?.focus({preventScroll:true});
  }
  const logKey=JSON.stringify(game.log);
  if(logKey!==lastLog){lastLog=logKey;$('radio-log').innerHTML=game.log.slice(0,6).map(l=>`<li class="${['story','alert'].includes(l.tone)?l.tone:''}">${esc(l.message)}</li>`).join('');$('announcement').textContent=game.compulsionNotice?'':game.log[0]?.message||'';}
  $('scene-caption').hidden=!field;
  if(field)$('scene-caption').textContent='';
  $('pause-layer').hidden=!paused;
  $('pause').textContent=paused?'Resume':'Pause';
  fieldMap.render(game,paused);
  canvas.hidden=field;
  $('guide-message').hidden=phase!=='guide'||game.guide?.stage==='debrief'||paused;
  if (phase === 'guide') updateGuideUI();
  if(aftermath){
    $('phase-label').textContent='RECOVERY DETAIL';
    $('station-status').textContent='RADIO SILENT';
    $('objective').textContent='';$('objective-detail').textContent='';
    $('control-hint').textContent='END OF ASSIGNMENT';
    canvas.setAttribute('aria-label',`${game.guide.team.filter(t=>t.status==='shot').length} fallen lights in the corn rows. The field is still.`);
  }
  sceneDialog();
  showCompulsionNotice();
  syncAudio();
}
function updateGuideUI() {
  const g=game.guide, escaping=g.stage==='escape', route=guideRouteStatus(game);
  if(g.stage==='debrief'){
    $('phase-label').textContent='RECOVERY DEBRIEF';$('station-status').textContent='ON RECORD';
    $('objective').textContent='Account for the team.';$('objective-detail').textContent='Your statement stays on tape.';
    $('controls').innerHTML='';$('stats').hidden=true;return;
  }
  const committed=escaping&&g.fired>0;
  const stops=['First crossing','Central crossing','Northeast corner'];
  const destinations=['Lead to the first crossing','Continue to the central crossing','Lead to the northeast corner'];
  const examination=['Examine the boot print','Examine the radio','Search the bare earth'];
  const remaining=g.team.filter(t=>t.status==='running').length, revealing=escaping&&g.time<.65;
  $('phase-label').textContent='RECOVERY DETAIL';
  $('station-status').textContent='RADIO SILENT';
  $('objective').textContent=escaping?'The team is leaving.':'Lead them through.';
  $('objective-detail').textContent=escaping?(committed?'Your hands will not lower the rifle.':'The team is leaving for the road.'):'Your light leads. The team follows.';
  $('stats').innerHTML=escaping?stat('LIGHTS STILL MOVING',remaining,'/ 3')+stat('RIFLE',6-g.fired,'rounds'):stat('ROUTE SEARCHED',g.clues.length,'/ 3')+stat('FOLLOWING YOU',3,'people');
  $('control-hint').textContent=escaping?(committed?'X AIM · SPACE FIRE':'X AIM · SPACE FIRE · L LOWER RIFLE'):'SPACE / W LEAD OR STOP · E EXAMINE';
  const description=`Recovery team in the cornfield. ${g.message} ${escaping?`The team is moving toward cover. X aims at a person; Space fires. ${committed?'The order has taken over. You cannot lower the rifle.':'L lowers your rifle and lets them leave. Firing commits you to the order.'}`:`${stops[g.clues.length]}. Space or W leads onward or stops walking. The route turns automatically and stops at each discovery. E examines a discovery.`}`;
  if(canvas.getAttribute('aria-label')!==description)canvas.setAttribute('aria-label',description);
  if($('guide-message').textContent!==g.message)$('guide-message').textContent=g.message;
  const key=`guide:${paused}:${g.stage}:${g.clues.length}:${route?.walking}:${route?.ready}:${g.fired}:${remaining}:${revealing}`;
  if(lastControlsKey!==key){
    lastControlsKey=key;
    const focused=$('controls').contains(document.activeElement);
    const focusedAction=focused?document.activeElement.dataset.action:null;
    $('controls').innerHTML=escaping
      ? `<div class="guide-deck guide-decision"><p class="guide-instruction">${committed?'Shoot any that try to escape.':'They are leaving for the road.'}</p><div class="guide-actions"><button data-action="guide-focus">Aim at next light</button><button data-action="guide-fire" ${g.fired>=6||revealing?'disabled':''}>Fire rifle</button>${committed?'':`<button class="primary" data-action="guide-spare" ${revealing?'disabled':''}>Lower rifle · let them leave</button>`}</div><p class="guide-help">${committed?'Your hands will not lower the rifle. Keep firing.':'Once you fire, the order will not let you stop.'}</p></div>`
      : `<div class="guide-deck"><ol class="guide-route" aria-label="Search route">${stops.map((label,i)=>`<li class="${i<g.clues.length?'searched':i===g.clues.length?'current':''}" ${i===g.clues.length?'aria-current="step"':''}><span>${i<g.clues.length?'✓':String(i+1).padStart(2,'0')}</span>${label}</li>`).join('')}</ol><div class="guide-progress" aria-hidden="true"><i></i></div><button class="${route.ready||!route.walking?'primary':'secondary'}" data-action="${route.ready?'guide-inspect':'guide-travel'}">${route.ready?examination[g.clues.length]:route.walking?'Stop here':destinations[g.clues.length]}</button><p class="guide-help">${route.ready?'The team waits while you examine the ground.':route.walking?'Your light follows the path. You can stop at any time.':'Follow the path. You stop at each discovery.'}</p></div>`;
    if(paused)$('controls').querySelectorAll('button').forEach(button=>button.disabled=true);
    if(focused)($('controls').querySelector(`[data-action="${focusedAction}"]`)||$('controls').querySelector('button'))?.focus({preventScroll:true});
  }
  const progress=$('controls').querySelector('.guide-progress i');
  if(progress)progress.style.width=`${route.progress*100}%`;
}
function act(action,value) {
  if(action==='select-share-link'){const input=dialog.querySelector('.share-link');input?.focus();input?.select();return;}
  if(action==='share-ending'){if(game?.phase==='ending')shareDisposition(game.ending,getEnding(game).stamp);return;}
  if(action==='share-record'){const run=history.runs[Number(value)];if(run)shareDisposition(run.ending,run.stamp);return;}
  if(action==='guide-answer'){
    if(!game||game.phase!=='guide'||game.guide.stage!=='debrief'||modalKind!=='guide-debrief')return;
    if(!answerGuideDebrief(game,value))return;
    closeModal();lastModalKey='';save();updateUI(true);return;
  }
  if(action.startsWith('guide-')&&(!game||game.phase!=='guide'||paused||dialog.open||menuOpen()))return;
  if(action==='encounter-choice') {
    if(!chooseFieldEncounter(game,value))return;
    if(game.phase==='ending')closeModal();
    lastModalKey='';save();updateUI(true);return;
  }
  if(action==='encounter-continue'||action==='encounter-map') {
    const journey=game.fieldEvents.journey;
    if(!continueFieldEncounter(game))return;
    closeModal();fieldMap.stop(game);
    if(action==='encounter-continue'&&journey) {
      fieldMap.choose(game,journey.destination);fieldMap.style=journey.style;
      if(!fieldMap.start(game))toast('The walk is no longer safe. Choose a lower-exposure route.');
    }
    lastModalKey='';save();updateUI(true);return;
  }
  if(action==='notebook-page'){
    if(game&&modalKind==='notebook')showModal('notebook',notebookMarkup(game,value));
    return;
  }
  if(action.startsWith('field-')) {
    if(!game||game.phase!=='field'||paused||dialog.open||menuOpen())return;
    if(action==='field-select')fieldMap.choose(game,value);
    if(action==='field-style'&&['quiet','direct'].includes(value)&&!fieldMap.travel)fieldMap.style=value;
    if(action==='field-stop')fieldMap.stop(game);
    if(action==='field-go') {
      const site=nearbySite(game);
      if(site?.id===fieldMap.selected) {
        if(site.id==='tower'){act('debrief');return;}
        act(canEatCrop(game)?'corn':'inspect');return;
      }
      fieldMap.start(game);
    }
    fieldMap.render(game,paused);save();return;
  }
  if(action==='record-run') {
    const r=history.runs[Number(value)];if(!r)return;
    showModal('record',paper(esc(r.title),`<p>${esc(r.text)}</p><p class="note">${esc(r.last)}</p><div class="transcript">${r.reports.map(t=>`<section><p class="eyebrow">${t.kind==='recovery'?'RECOVERY DEBRIEF':`SHIFT ${Number(t.shift)+1}`}</p><p>${esc(t.question)}</p><p><b>YOU</b> ${esc(t.answer)}</p>${t.supervisorReply?`<p class="note">${esc(t.replySpeaker||'SUPERVISOR')}: ${esc(t.supervisorReply)}</p>`:''}</section>`).join('')}</div><div class="paper-actions"><button class="secondary" data-action="share-record" data-value="${Number(value)}">Share ending ↗</button><button class="primary" data-action="records">Back to records</button><button class="secondary" data-action="close">Close</button></div>`,'PAST ASSIGNMENT'));return;
  }
  if(action==='records'){$('records').click();return;}
  if(action==='guide-travel')guideTravel(game);
  if(action==='guide-inspect')inspectGuide(game);
  if(action==='guide-spare')spareGuide(game);
  if(action==='guide-focus'){
    let aim=null;
    for(let i=0;i<game.guide.team.length;i++){
      const p=focusGuide(game);if(!p)break;
      const target=game.guide.team.find(t=>t.id===game.guide.focused);
      if(visibleGuideTarget(game.guide,target,renderer.view)){aim=p;break;}
    }
    if(aim)renderer.pointer=aim;
    else {game.guide.focused=null;toast(game.guide.fired?'They have reached cover. Someone is calling for help.':'The lights have reached cover. You can let them leave.');}
  }
  if(action==='guide-fire'){const t=game?.guide?.team.find(t=>t.id===game.guide.focused&&t.status==='running');const p=t&&visibleGuideTarget(game.guide,t,renderer.view);if(t&&!p){game.guide.focused=null;toast(game.guide.fired?'They have reached cover. Someone is calling for help.':'The lights have reached cover. You can let them leave.');return;}if(p)renderer.pointer={x:p.x,y:p.y-p.height*.5};fire(renderer.pointer);}
  if(action==='close'){closeModal();if(game&&(['briefing','debrief','ending'].includes(game.phase)||game.guide?.stage==='debrief')){lastModalKey='';updateUI(true);}return;}
  if(action==='start'){closeModal();startShift(game);canvas.focus({preventScroll:true});}
  if(action==='answer'){closeModal();answer(game,value);}
  if(action==='reload')reload(game);
  if(action==='focus'){const p=focusNext(game);if(p)renderer.pointer=p;else toast('No moving crops in view.');canvas.focus({preventScroll:true});}
  if(action==='confirm-enter'&&game?.phase==='tower'&&!paused){closeModal();enterField(game);}
  if(action==='move'){fieldMap.stop(game);const [dx,dy]=value.split(',').map(Number);move(game,dx,dy);}
  if(action==='corn' && canEatCrop(game))showModal('corn',paper('Something warm.',`<p>Corn boils on a stove beside the treatment drums. Butter, salt, and a clean plate wait. The sweet smell makes your stomach ache. You cannot remember when you last ate.</p><p>A notice above the stove reads: DO NOT CONSUME THE CROP.</p><div class="paper-actions"><button class="primary" data-action="eat-crop">Butter an ear. Take a bite.</button><button class="secondary" data-action="close">Leave it untouched.</button></div>`,'PUMP HOUSE'));
  if(action==='eat-crop' && eatCrop(game))closeModal();
  if(action==='inspect'){
    const id=inspect(game);
    if(id){const e=EVIDENCE[id];showModal('evidence',paper(e.title,`<p class="eyebrow">${e.code} / ${e.where.toUpperCase()}</p>${evidenceMount(id)}<p>${e.text}</p>${canEatCrop(game)?'<p>A sweet cooking smell drifts from behind the treatment drums.</p><button class="primary" data-action="corn">Follow the cooking smell</button>':''}<button class="primary" data-action="close">Close notebook ↗</button>`,'PRIVATE OBSERVATION'));}
  }
  if(action==='debrief')beginDebrief(game);
  if(action==='restart'){closeModal();begin(game.mode);return;}
  if(action==='new-confirm'){closeModal();begin($('difficulty').value);return;}
  if(action==='export'){exportRecord();return;}
  save();updateUI(true);syncAudio();
  if(action==='confirm-enter'&&game?.phase==='field')$('field-exploration').querySelector('.field-go')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)act(button.dataset.action,button.dataset.value);});
$('new-game').addEventListener('click',()=>{
  if(readSave())showModal('confirm',paper('A new assignment.',`<p>Starting a new assignment replaces the saved shift on this device.</p><div class="paper-actions"><button class="primary" data-action="new-confirm">Start a new shift ↗</button><button class="secondary" data-action="close">Keep my place</button></div>`));
  else begin($('difficulty').value);
});
$('resume').addEventListener('click',()=>begin(null,true));
function togglePause(force) {if(!game||game.phase==='ending'||dialog.open)return;paused=typeof force==='boolean'?force:!paused;updateUI();save();syncAudio();}
$('pause').addEventListener('click',()=>togglePause());$('unpause').addEventListener('click',()=>{togglePause(false);canvas.focus({preventScroll:true});});
dialog.addEventListener('cancel',event=>{if(['briefing','debrief','guide-debrief','ending','encounter'].includes(modalKind))event.preventDefault();else{event.preventDefault();closeModal();}});
$('manual').addEventListener('click',()=>showModal('manual',paper('The field manual.',`<ol class="orders"><li><span>01</span>Watch the corn. Shoot any that try to escape.</li><li><span>02</span>Remain in the watchtower.</li><li><span>03</span>Do not consume the crop.</li><li><span>04</span>Remember any irregularities for your debrief at the end of the night.</li></ol><button class="primary" data-action="close">Understood ↗</button>`)));

$('about').addEventListener('click',()=>showModal('about',paper('About Debrief.', '<p>An interactive adaptation of the short story by Ryan L. Melvin.</p><p>Three shifts. About ten minutes. Headphones optional.</p><p class="small">Music: <a href="https://opengameart.org/content/lost-in-a-bad-place-horror-ambience-loop" target="_blank" rel="noopener">Lost in a Bad Place</a> by congusbongus · <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p><p class="small">Field sounds (CC0): <a href="https://opengameart.org/content/crickets-ambient-noise-loopable" target="_blank" rel="noopener">crickets by Ted Kerr</a>; <a href="https://opengameart.org/content/random-sounds-samples" target="_blank" rel="noopener">footsteps and leaves by Brandon Morris</a>; <a href="https://opengameart.org/content/static" target="_blank" rel="noopener">radio static by xhunterko</a>.</p><p>The goal is to find your way through every possible ending. New endings added all the time.</p><p class="small">Your progress and records stay in this browser or app, on this device. Clearing site data deletes them; installation is not a backup.</p><button class="primary" data-action="close">Back ↗</button>', 'STATION 04')));
$('assignment').addEventListener('click',()=>{
  if(!game)return;
  showModal('assignment',paper($('objective').textContent,`<p>${esc($('objective-detail').textContent)}</p><p class="small">Shift ${game.shift+1} of 3 · ${esc($('station-status').textContent)}</p><button class="primary" data-action="close">Return to duty ↗</button>`, 'CURRENT ORDERS'));
});
$('menu-radio').addEventListener('click',()=>{
  if(!game)return;
  showModal('radio',paper('Radio / field notes.',`<div class="radio-entries">${game.log.slice(0,6).map(l=>`<p>${esc(l.message)}</p>`).join('')}</div><button class="primary" data-action="close">Back to the field ↗</button>`, 'STATION 04'));
});

$('notebook').addEventListener('click',()=>{
  if(game)showModal('notebook',notebookMarkup(game,Math.max(0,game.evidence.length-1)));
});

canvas.addEventListener('pointermove',event=>{if(['tower','guide'].includes(game?.phase)){renderer.pointer=renderer.coords(event);game.focused=null;if(game.guide)game.guide.focused=null;}});
canvas.addEventListener('pointerdown',event=>{
  if(!game||paused||dialog.open||menuOpen())return;
  canvas.focus({preventScroll:true});
  if(game.phase==='guide'&&game.guide.stage==='escape'){game.guide.focused=null;renderer.pointer=renderer.coords(event);fire(renderer.pointer);}
  else if(game.phase==='tower'){
    const p=renderer.coords(event);renderer.pointer=p;
    fire(p,event.pointerType==='touch'?22/Math.max(.1,renderer.view.scale):0);
  }
});
function fire(p,padding=0) {const result=game.phase==='guide'?fireGuide(game,p.x,p.y):shoot(game,p.x,p.y,padding);if(!['blocked','empty'].includes(result))shotSound(result==='hit');updateUI();save();}
document.addEventListener('keydown',event=>{
  if(!game||dialog.open||menuOpen()||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  const k=event.key.toLowerCase();
  if(k==='escape'&&compulsionNotice.matches(':popover-open')){event.preventDefault();compulsionNotice.hidePopover();return;}
  if(k==='escape'&&$('guide-aftermath').matches(':popover-open')){event.preventDefault();$('guide-aftermath').hidePopover();return;}
  if(k==='p'||k==='escape'){event.preventDefault();togglePause();return;}
  if(paused)return;
  if(game.phase==='tower'){
    if(event.repeat && k===' ')return;
    if(k==='x'){event.preventDefault();act('focus');}
    if(k==='r'){event.preventDefault();act('reload');}
    if(k===' '&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();const target=game.targets.find(t=>t.id===game.focused);if(target)renderer.pointer={x:target.x,y:target.y-34};fire(renderer.pointer);}
  }
  if(game.phase==='guide'){
    if(event.repeat||game.guide.stage==='debrief')return;
    const escaping=game.guide.stage==='escape';
    const actions=escaping?{x:['guide-focus'],' ':['guide-fire'],l:['guide-spare']}:{w:['guide-travel'],arrowup:['guide-travel'],e:['guide-inspect'],' ':[nearbyGuideSite(game)?'guide-inspect':'guide-travel']};
    if(!escaping&&['s','arrowdown'].includes(k)&&game.guide.walking){event.preventDefault();act('guide-travel');return;}
    if(actions[k] && !(escaping&&k==='l'&&game.guide.fired>0) && !(k===' ' && ['BUTTON','A'].includes(event.target.tagName))){event.preventDefault();act(...actions[k]);}
  }
  if(game.phase==='field'){
    const directions={arrowup:'0,-1',w:'0,-1',arrowdown:'0,1',s:'0,1',arrowleft:'-1,0',a:'-1,0',arrowright:'1,0',d:'1,0'};
    if(directions[k]){event.preventDefault();act('move',directions[k]);}
    if(k==='e'){event.preventDefault();fieldMap.stop(game);act(nearbySite(game)?.id==='tower'?'debrief':'inspect');}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(game&&!dialog.open)togglePause(true);}syncAudio();});
window.addEventListener('pagehide',save);
let sharingEnding=false;
async function shareDisposition(ending,stamp) {
  if(sharingEnding)return;
  sharingEnding=true;
  save();
  const collected=[...history.collected];
  try {
    const result=await shareEnding(ending,navigator,collected,stamp);
    if(result==='copied')toast('Ending and link copied. Paste them into a message.');
    if(result==='manual'){
      const data=endingShareData(ending,collected,stamp);
      showModal('share',paper('Pass it on.',`<p class="small">Copy this message and link to share your ending.</p><textarea class="share-link" aria-label="Ending message and link" rows="5" readonly>${esc(data.text+'\n'+data.url)}</textarea><div class="paper-actions"><button class="secondary" data-action="select-share-link">Select message</button><button class="primary" data-action="close">Back to assignment ↗</button></div>`,'SHARE YOUR ENDING'));
    }
  } finally { sharingEnding=false; }
}
function exportRecord() {
  const e=getEnding(game);
  const body=`DEBRIEF — PRIVATE TRANSCRIPT\nBased on the story by Ryan L. Melvin\n\n${e.title}\n${e.stamp}\n\n${e.text}\n${e.last}\n\nTESTIMONY\n\n${game.reports.map(r=>`${r.kind==='recovery'?'RECOVERY DEBRIEF':`SHIFT ${r.shift+1}`}\nQ: ${r.question}\nA: ${r.answer}${r.redacted?' [official wording]':''}${r.supervisorReply ? `\n${r.replySpeaker||'SUPERVISOR'}: ${r.supervisorReply}` : ''}`).join('\n\n')}\n\nEXHIBITS\n\n${game.evidence.map(id=>`${EVIDENCE[id].title}\n${EVIDENCE[id].text}`).join('\n\n')}`;
  const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='debrief-private-transcript.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function initAudio() {
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){toast('Sound is not available in this browser.');return false;}
  if(!audioContext){
    audioContext=new Audio();
  }
  // Resume during the button gesture before building the sound graph (mobile).
  await audioContext.resume();
  if(audioContext.state!=='running')throw new Error('Audio is suspended');
  if(!soundscape){
    const [music,effects]=await Promise.all([loadMusic(audioContext),loadEffects(audioContext)]);
    soundscape=new GameAudio(audioContext,music,effects);
  }
  return true;
}
function syncAudio(){
  const encounter=game?.phase==='field'?game.fieldEvents?.pending:null;
  const held=paused||(dialog.open&&modalKind!=='encounter')||menuOpen()||document.hidden||!game||game.phase==='ending';
  const takeover=game?.phase==='field'&&game.compulsionNotice===true;
  soundscape?.sync({enabled:soundEnabled,held,pressure:game?investigationPressure(game)?.strength||0:0,takeover,scene:game?.phase,night:game?.shift||0,encounter});
  soundEvents.update(game,soundscape,soundEnabled&&!held&&!takeover,fieldMap.style);
}
$('sound').addEventListener('click',async()=>{
  const button=$('sound');button.disabled=true;
  try {
    if(!soundEnabled){
      button.textContent='Sound: loading…';
      if(!await initAudio())return;
    }
    soundEnabled=!soundEnabled;
    button.setAttribute('aria-pressed',String(soundEnabled));syncAudio();
    if(soundEnabled){soundscape.preview();toast('Sound is on. Music resumes when you return to play.');}
    else toast('Sound is off.');
  } catch {toast('Sound could not start. Check your connection and try again.');}
  finally {button.disabled=false;button.textContent=soundEnabled?'Sound: ON · Turn off':'Sound: OFF · Turn on';}
});
function shotSound(hit) {
  if(soundEnabled)soundscape?.shot(hit);
}
function showProgressTransfer() {
  save();archiveRun();
  showModal('progress',paper('Move saved progress.',`
    <p class="small">Carry your current shift, collected endings, and transcripts between the browser and installed app.</p>
    <p class="small">In the browser with your progress, copy it or save a backup. Then open the app’s <b>KIT → Move saved progress</b> and paste the code or open that backup.</p>
    <div class="paper-actions"><button id="copy-progress" class="secondary" disabled>Copy progress</button><button id="download-progress" class="secondary" disabled>Save backup ↓</button></div>
    <p id="progress-export-status" class="small" role="status">Preparing progress…</p>
    <div class="paper-actions"><div class="progress-entry"><label for="progress-code">Progress code</label><textarea id="progress-code" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste the code from your browser here"></textarea></div>
    <button id="restore-progress" class="primary">Restore progress ↗</button><button id="open-progress" class="secondary">Open backup</button>
    <p id="progress-import-status" class="small" role="status"></p></div>
    <input id="progress-file" type="file" accept=".txt,text/plain" hidden>`, 'SAVED PROGRESS'));
  const copy=$('copy-progress'),download=$('download-progress'),input=$('progress-code'),file=$('progress-file');
  const exportStatus=$('progress-export-status'),importStatus=$('progress-import-status');
  let code='';
  try {
    const snapshot=progressSnapshot(game||readSave(),history);
    encodeProgress(snapshot).then(value=>{
      if(!copy.isConnected)return;
      code=value;copy.disabled=false;download.disabled=false;
      exportStatus.textContent='Ready to copy or save. Your original progress stays here.';
    }).catch(()=>{exportStatus.textContent='Progress could not be prepared. Close this window and try again.';});
  } catch {exportStatus.textContent='No saved progress here yet. Bring it over from your browser below.';}
  copy.addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(code);exportStatus.textContent='Copied. Open the other app or browser, choose Move saved progress, and paste the code.';}
    catch {input.value=code;pager.refresh();pager.go(pager.pages.findIndex(page=>page.contains(input)));input.focus();input.select();exportStatus.textContent='Select and copy the code below, or use Save backup.';}
  });
  download.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([code],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='debrief-progress.txt';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const review=async value=>{
    importStatus.textContent='Checking progress…';
    try {
      const snapshot=await decodeProgress(value);
      if(!importStatus.isConnected)return;
      const summary=snapshot.save?`Shift ${snapshot.save.shift+1} of 3 · ${snapshot.save.mode==='hard'?'Hard':'Story'}`:'Completed records';
      const replacement=snapshot.save && (game||readSave())?'This replaces the current shift in this app. ':'';
      showModal('progress-confirm',paper('Restore this progress?',`<p>${esc(summary)}<br>${snapshot.history.collected.length} endings · ${snapshot.history.runs.length} completed assignments</p><p class="small">${replacement}Collected endings are combined. The latest 30 completed assignments are kept.</p><p id="progress-restore-status" class="small" role="status"></p><div class="paper-actions"><button id="confirm-progress" class="primary">Restore progress ↗</button><button id="cancel-progress" class="secondary">Cancel</button></div>`, 'SAVED PROGRESS'));
      $('cancel-progress').addEventListener('click',showProgressTransfer);
      $('confirm-progress').addEventListener('click',()=>{
        try {
          history=storeProgress(localStorage,progressKeys,snapshot,history);
          updateHistoryCount();saved=readSave();$('resume').hidden=!saved;
          if(snapshot.save){game=null;begin('story',true);}else closeModal();
          installHandoff.update(game||saved,history);
          toast('Progress restored. Your endings and records are ready.');
        } catch {$('progress-restore-status').textContent='This browser could not save the transfer. Your existing progress has been kept. Try allowing site storage.';}
      });
    } catch {if(importStatus.isConnected)importStatus.textContent='That progress could not be read. Copy the full code again, or open a Debrief progress backup.';}
  };
  $('restore-progress').addEventListener('click',()=>review(input.value));
  $('open-progress').addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
    const backup=file.files[0];if(!backup)return;
    if(backup.size>MAX_PROGRESS_BYTES*2){importStatus.textContent='That file is too large. Choose a Debrief progress backup.';return;}
    try {await review(await backup.text());}catch {importStatus.textContent='That backup could not be opened. Try choosing it again.';}
  });
}
$('move-progress').addEventListener('click',showProgressTransfer);
function refreshInstallGuide() {
  if(modalKind !== 'install' || !dialog.open)return;
  const button=$('install-now');
  button.hidden=isInstalled() || !installPrompt;
  $('install-status').textContent=isInstalled() ? 'Debrief is running as an installed app.' : installPrompt ? 'Ready to install.' : 'Install through your browser menu:';
}
function showInstallGuide() {
  save();
  showModal('install',paper('Install on device.',`
    <p class="small" id="install-status" role="status"></p>
    <p class="small" id="install-progress-status" role="status">Preparing your progress for installation…</p>
    <button class="primary" id="install-now" hidden>Install now ↗</button>
    <button class="secondary" id="install-transfer">Move saved progress</button>
    <ul class="small">
      <li><b>iPhone / iPad:</b> Open this page in Safari, open Share (sometimes inside the page menu), choose Add to Home Screen, enable Open as Web App if offered, then tap Add.</li>
      <li><b>Android:</b> Open the browser menu and choose Install app or Add to Home screen, then confirm.</li>
      <li><b>Computer:</b> Look for the install icon in the address bar or Install app in the browser menu. In Safari on Mac, use File → Add to Dock. If unavailable, try a browser that supports installation.</li>
    </ul>
    <p class="small">Open the new icon once online to prepare for offline play. Installation carries progress on supported browsers. After installation, browser and app saves may advance separately. For an app already installed, or if progress is missing, use Move saved progress.</p>
    <h3>Protect saves</h3>
    <p class="small">Keep saves during automatic browser cleanup.</p>
    <button id="protect-storage" class="secondary">Request persistent storage</button>
    <p id="storage-status" class="small" role="status" aria-live="polite">Checking storage…</p>
    <p class="note"><b>Installation is not a backup.</b> Clearing this site’s data deletes saves even with storage protection. Private browsing may discard them when closed.</p>
    <button class="primary" data-action="close">Done ↗</button>`, 'DEVICE SETUP'));
  refreshInstallGuide();
  $('install-transfer').addEventListener('click',showProgressTransfer);
  const progressStatus=$('install-progress-status');
  if(isInstalled())progressStatus.textContent='Missing browser progress? Use Move saved progress in both places to bring it here.';
  else installHandoff.update(game||readSave(),history).then(ready=>{
    if(!progressStatus.isConnected)return;
    progressStatus.textContent=ready?'Your progress is prepared for installation. Recent Safari versions carry it into the new app; if it is missing, use Move saved progress.':'Use Move saved progress to keep a copy before installing. This browser could not prepare an automatic transfer.';
  });
  const status=$('storage-status'), protect=$('protect-storage');
  if(!navigator.storage?.persist || !navigator.storage?.persisted){
    status.textContent='This browser cannot request persistent storage. You can still play and save, but automatic cleanup may remove data.';
    protect.disabled=true;
  } else {
    navigator.storage.persisted().then(granted=>{
      if(!status.isConnected || protect.disabled)return;
      status.textContent=granted ? 'Persistent storage is enabled.' : 'Persistent storage is not enabled.';
      if(granted){protect.disabled=true;protect.textContent='Storage protected';}
    }).catch(()=>{if(status.isConnected)status.textContent='Storage status could not be checked. You can try requesting protection.';});
  }
  protect.addEventListener('click',async()=>{
    protect.disabled=true;
    status.textContent='Requesting storage protection…';
    try {
      const granted=await navigator.storage.persist();
      status.textContent=granted ? 'Persistent storage is enabled.' : 'The browser did not grant persistent storage. Try from the installed app.';
      protect.textContent=granted ? 'Storage protected' : 'Try again';
      protect.disabled=granted;
    } catch {
      status.textContent='Storage protection could not be requested. Browser settings or private browsing may prevent it.';
      protect.disabled=false;
    }
  });
  $('install-now').addEventListener('click',async()=>{
    const prompt=installPrompt;
    if(!prompt)return;
    installPrompt=null;
    refreshInstallGuide();
    try {
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(modalKind==='install' && dialog.open)$('install-status').textContent=choice.outcome==='accepted' ? 'Installed. Open the new icon to play.' : 'Installation canceled.';
    } catch {
      if(modalKind==='install' && dialog.open)$('install-status').textContent='Installation could not start. Follow the browser steps below.';
    }
  });
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refreshInstallGuide();});
$('install').addEventListener('click',showInstallGuide);
window.addEventListener('appinstalled',()=>{installPrompt=null;refreshInstallGuide();toast('Debrief installed.');});
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  let waitingWorker = null, applyingUpdate = false, refreshing = false;
  const showUpdate = () => {
    $('update-game').hidden = !waitingWorker;
    const inDialog = $('dialog-update');
    if (inDialog) inDialog.hidden = !waitingWorker;
  };
  const applyUpdate = () => {
    if (!waitingWorker || applyingUpdate) return;
    save();
    applyingUpdate = true;
    paused = true;
    syncAudio();
    document.querySelectorAll('[data-update]').forEach(button => {
      button.disabled = true;
      button.textContent = 'Loading update…';
    });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };
  document.addEventListener('click', event => {
    if (event.target.closest('[data-update]')) applyUpdate();
  });
  // Other open game tabs also save before reloading when the update activates.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    save();
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const announce = () => {
      waitingWorker = reg.waiting;
      showUpdate();
    };
    announce();
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', event => {
        if (event.target.state === 'installed' && navigator.serviceWorker.controller) announce();
      });
    });
    // Check while a playtest stays open, and whenever the player returns to it.
    const check = () => { if (!document.hidden) reg.update().catch(() => {}); };
    setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    new MutationObserver(showUpdate).observe($('dialog-content'), { childList: true });
    check();
  }).catch(() => toast('Offline installation is unavailable. The game still works while this page is open.'));
}

function frame(now) {
  const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
  if(game&&!paused&&!dialog.open&&!menuOpen()&&!document.hidden){
    advance(game,dt);
    if(game.phase==='field')fieldMap.tick(game,dt,(dx,dy)=>move(game,dx,dy),()=>{
      const site=nearbySite(game);
      if(site?.id==='tower'&&investigationComplete(game))act('debrief');
      else if(site&&site.id!=='tower'&&!game.inspected.includes(site.id))act('inspect');
      else {updateUI(true);save();}
    });
    const focused=game.targets.find(t=>t.id===game.focused);if(focused)renderer.pointer={x:focused.x,y:focused.y-34};
    if(game.phase==='guide'&&game.guide.focused){
      const target=game.guide.team.find(t=>t.id===game.guide.focused&&t.status==='running');
      const aim=target&&visibleGuideTarget(game.guide,target,renderer.view);
      if(aim)renderer.pointer={x:aim.x,y:aim.y-aim.height*.5};
      else game.guide.focused=null;
    }
    if(now-lastUI>100){updateUI();lastUI=now;}
    if(now-lastSave>1200){save();lastSave=now;}
  }
  if(game?.phase!=='field')renderer.draw(game,now,!game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
