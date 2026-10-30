import { stepGuide, turnGuide, inspectGuide, spareGuide, fireGuide, focusGuide, nearbyGuideSite, projectGuide } from './guide.js';
import { createGame, startShift, advance, reload, shoot, focusNext, enterField, move, inspect, canEatCrop, eatCrop, nearbySite, investigationPressure, investigationComplete, beginDebrief, chooseFieldEncounter, continueFieldEncounter, getQuestion, getEnding, answer, serialize, restore, BRIEFINGS, EVIDENCE, ENDINGS, DATES, REPORT_DATES, SHIFT_LENGTH } from './engine.js';
import { Renderer } from './renderer.js';
import { FieldMap } from './field-ui.js';
import { dialogArtwork, evidenceMount, notebookMarkup, encounterMarkup } from './art.js';

const $ = id => document.getElementById(id);
const canvas=$('field'), renderer=new Renderer(canvas), dialog=$('paper-dialog');
const fieldMap=new FieldMap($('field-exploration'));
const menu=$('game-menu');
const menuOpen=()=>menu.matches(':popover-open');
menu.addEventListener('toggle',()=>{syncAudio();if(menuOpen())save();});
menu.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('[popovertarget]'))menu.hidePopover();});
const HISTORY_KEY=`debrief-history-v1:${new URL('.',location.href).pathname}`;
const SAVE_KEY=`debrief-save-v1:${new URL('.',location.href).pathname}`;
let game=null, paused=false, modalKind='', lastModalKey='', lastControlsKey='', lastLog='', lastFrame=0, lastSave=0, lastUI=0, toastTimer, installPrompt=null;
let audioContext=null, master=null, ambient=null, soundEnabled=false, storageWarned=false;
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readSave() { try { return restore(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
let history={ collected: [], runs: [] };
try { const stored=JSON.parse(localStorage.getItem(HISTORY_KEY)); if(stored && Array.isArray(stored.collected) && Array.isArray(stored.runs)){history.collected=stored.collected.filter(id=>Object.hasOwn(ENDINGS,id));history.runs=stored.runs.filter(r=>r&&typeof r.id==='string'&&Object.hasOwn(ENDINGS,r.ending)&&Array.isArray(r.reports)).slice(0,30);} } catch {}
function updateHistoryCount(){ $('records').textContent=`Records · ${history.collected.length}/6`; }
updateHistoryCount();
function archiveRun(){
  if(!game || game.phase!=='ending' || history.runs.some(r=>r.id===game.runId))return;
  const e=getEnding(game);
  if(!history.collected.includes(game.ending))history.collected.push(game.ending);
  history.runs.unshift({id:game.runId,ending:game.ending,title:e.title,text:e.text,last:e.last,reports:game.reports.map(r=>({...r})),date:new Date().toISOString()});
  history.runs=history.runs.slice(0,30);
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{toast('Records are available for this session. Your browser could not save them.');}
  updateHistoryCount();
}
$('records').addEventListener('click',()=>{
  archiveRun();
  const collection=Object.entries(ENDINGS).map(([id,e])=>`<li class="ending-slot ${history.collected.includes(id)?'collected':''}"><span>${e.code}</span> ${history.collected.includes(id)?esc(e.title):'Unrecorded'}</li>`).join('');
  const runs=history.runs.map(r=>`<details class="past-run"><summary>${esc(r.title)} · ${esc(new Date(r.date).toLocaleDateString())}</summary><p>${esc(r.text)}</p><p class="note">${esc(r.last)}</p>${r.reports.map(t=>`<p class="small"><b>SHIFT ${Number(t.shift)+1}</b><br>${esc(t.question)}<br>YOU: ${esc(t.answer)}${t.supervisorReply?`<br>SUPERVISOR: ${esc(t.supervisorReply)}`:''}</p>`).join('')}</details>`).join('');
  showModal('records',paper('Your records.',`<p class="small">${history.collected.length} of 6 endings recorded on this device.</p><ol class="ending-collection">${collection}</ol>${runs||'<p class="small">No testimony on file.</p>'}<button class="primary" data-action="close">Close records ↗</button>`,'PRIVATE ARCHIVE'));
});
let saved=readSave();
$('resume').hidden=!saved;
function save() {
  if(!game)return;
  try { localStorage.setItem(SAVE_KEY,serialize(game));saved=game;$('save-status').textContent='PROGRESS SAVED ON THIS DEVICE'; }
  catch { $('save-status').textContent='SAVING UNAVAILABLE';if(!storageWarned){toast('Your browser is blocking local saves. Keep this tab open to retain your progress.');storageWarned=true;} }
}
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000); }
const REDACTED_TOWN = '<span class="censor-bar" role="img" aria-label="Town name redacted"></span>';
function paper(title,body,tag='PERSONNEL COPY',footer='DEPARTMENT OF AGRICULTURAL CONTAINMENT') {
  return `<article class="paper"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="paper-top"><span>STATION 04 / ${REDACTED_TOWN}, ILLINOIS<br>RESTRICTED FIELD OPERATIONS</span><span>${tag}<br>FILE NO. 04–${game?String(game.shift+1).padStart(2,'0'):'00'}</span></div><h2 id="dialog-title" tabindex="-1">${title}</h2>${body}<div class="paper-footer"><span>${footer}</span><span>KEEP FOR YOUR RECORDS</span></div></article>`;
}
function showModal(kind,html) {
  if(menuOpen())menu.hidePopover();
  modalKind=kind;$('dialog-content').innerHTML=html;
  dialog.dataset.kind=kind;
  const artwork=dialogArtwork(kind,game?.shift);
  if(artwork)$('dialog-content').querySelector('.paper')?.insertAdjacentHTML('afterbegin',artwork);
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  $('dialog-title')?.focus({preventScroll:true});
  syncAudio();
}
function closeModal() {dialog.close();modalKind='';syncAudio();(game?.phase==='field'?$('field-exploration').querySelector('.field-go'):canvas).focus({preventScroll:true});}
function begin(mode,fromSave=false) {
  game=fromSave?readSave():createGame(mode);
  if(!game){toast('The saved shift could not be read. You can start a new one.');return;}
  paused=false;lastModalKey='';lastControlsKey='';lastLog='';
  fieldMap.reset();
  $('notebook').hidden=false;$('menu-radio').hidden=false;
  $('welcome').hidden=true;$('sidebar').hidden=false;$('pause').hidden=false;document.body.classList.add('playing');
  if(dialog.open)closeModal();updateUI(true);save();
}
function sceneDialog() {
  if(!game)return;
  const pending=game.fieldEvents.pending;
  const key=`${game.phase}:${game.shift}:${game.question}:${game.ending}:${game.incident}:${pending?.id}:${pending?.choice}`;
  if(key===lastModalKey)return;
  lastModalKey=key;
  if(game.phase==='field'&&pending){showModal('encounter',encounterMarkup(game));save();return;}
  if(game.phase==='briefing') {
    const b=BRIEFINGS[game.shift];
    showModal('briefing',paper(b.title,`<p class="eyebrow">SHIFT ${game.shift+1} / ${DATES[game.shift]}, <span class="redacted-text">19XX</span></p><p>${esc(b.text).replaceAll('██████', REDACTED_TOWN)}</p><ol class="orders">${b.orders.map((o,i)=>`<li><span>0${i+1}</span>${o}</li>`).join('')}</ol>${b.note?`<p class="note">${b.note}</p>`:''}${game.shift===0?'<p class="small">Click or tap to fire. <b>X</b> aims, <b>Space</b> fires, <b>R</b> reloads.</p>':''}<button class="primary" data-action="start">Take your post <span>↗</span></button>`, 'SHIFT ORDERS'));
  } else if(game.phase==='tower' && game.incident && !game.incidentPrompted) {
    game.incidentPrompted=true;
    showModal('sighting',paper('Movement in the field.', '<p>Someone went into the rows. A thought follows, too quickly to feel like your own: <em>investigate.</em></p><p class="note">For a moment, you can feel the roots under the tower. Like fingers you have forgotten how to move.</p><p class="small">Leaving now means any loose crops can cross the perimeter.</p><div class="paper-actions"><button class="primary" data-action="confirm-enter">Follow the thought ↗</button><button class="secondary" data-action="close">Stay at my post</button></div>', 'FIELD OBSERVATION'));
    save();
  } else if(game.phase==='decision') {
    showModal('compulsion',`<article class="compulsion-scene"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><p class="compulsion-time">RELIEF HAS ARRIVED / YOUR WATCH IS OVER</p><div class="compulsion-word" aria-hidden="true">investigate</div><h2 id="dialog-title" tabindex="-1">You did not decide to move.</h2><p>You held your post. You waited for relief.<br>The thought waited with you.</p><p>Now someone is calling up from below. You try to answer. Your mouth shapes a different word. Your hands lift the latch.</p><p class="compulsion-refusal">You tell yourself: <em>stay in the tower.</em><br>Your body starts down the ladder.</p><p>Below the soil, something vast loosens its grip. It no longer needs to pull. The thought has become the part of you that moves.</p><p class="compulsion-verdict">You kept the corn inside.<br>You could not keep it out of your head.</p><button class="primary" data-action="accept-compulsion">Your feet reach the soil <span>→</span></button></article>`);
    save();
  } else if(game.phase==='debrief') {
    const q=getQuestion(game);
    showModal('debrief',paper('For the record.',`<p class="eyebrow">${REPORT_DATES[game.shift]}, <span class="redacted-text">19XX</span></p><span class="question-num">${game.question === 3 ? 'INTERVIEW CLOSED' : `QUESTION 0${game.question+1} / 03`}</span><p><strong>[SUPERVISOR]</strong><br>${esc(q.prompt)}</p><p class="note">${esc(q.context)}</p><div class="choices">${q.options.map(o=>`<button class="choice" data-action="answer" data-value="${o.id}" ${o.disabled?'disabled':''}>${esc(o.label)}${o.detail?`<small>${esc(o.detail)}</small>`:''}</button>`).join('')}</div>`, 'DEBRIEF TRANSCRIPT'));
  } else if(game.phase==='guide' && game.guide.steps === 0) {
    showModal('guide-intro',paper('Between the rows.', '<p>Three recovery personnel wait beneath the tower. You take the rifle. They take lamps.</p><p class="note">“You know the way,” one of them says.</p><p class="small"><b>W/S</b> or <b>↑/↓</b> walk · <b>A/D</b> or <b>←/→</b> turn · <b>E</b> examine.</p><button class="primary" data-action="close">Lead them in ↗</button>', 'RECOVERY DETAIL'));
  } else if(game.phase==='ending') {
    archiveRun();
    const e=getEnding(game);
    showModal('ending',paper(e.title,`<p class="eyebrow">ENDING ${e.code} / 06</p><p>${e.text}</p><p class="note">${e.last}</p><div class="stamp">${e.stamp}</div><div class="receipt-stats"><span>CROPS CONTAINED<strong>${game.kills}</strong></span><span>EXHIBITS RETAINED<strong>${game.evidence.length}</strong></span><span>PERIMETER BREACHES<strong>${game.breaches}</strong></span></div><p class="small">Based on <i>Debrief</i> by Ryan L. Melvin.</p><div class="paper-actions"><button class="primary" data-action="restart">Another assignment ↗</button><button class="secondary" data-action="export">Keep the transcript ↓</button><button class="secondary" data-action="records">View records · ${history.collected.length}/6</button></div>`, 'FINAL DISPOSITION'));
  }
}
function stat(label,value,sub='',percent=null,warning=false) {return `<div class="stat ${warning?'warning':''}"><label>${label}</label><strong>${value}</strong><small> ${sub}</small>${percent!==null?`<div class="meter"><span style="width:${Math.min(100,Math.max(0,percent))}%"></span></div>`:''}</div>`;}
function updateUI(force=false) {
  if(!game)return;
  document.body.dataset.phase=game.phase;
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
    pressureLayer.dataset.stage=pressure.stage;
    pressureLayer.style.setProperty('--pressure',String(pressure.strength));
    if($('pressure-voice').textContent!==pressure.thought)$('pressure-voice').textContent=pressure.thought;
    $('pressure-echo').textContent=pressure.echo;
  }
  $('tower-hud').hidden=!active;
  $('hud-ammo').textContent=`${game.rounds} / ${game.reserve} · .22`;
  $('hud-reload').disabled=paused||game.reload>0||game.rounds===6||game.reserve===0;
  $('hud-reload').textContent=game.reload>0?'↻ Reloading…':'↻ Reload';
  $('hud-reload').setAttribute('aria-label',`Reload rifle. ${game.rounds} rounds loaded, ${game.reserve} in reserve.`);
  $('controls').hidden=active||field;
  $('evidence-count').textContent=String(game.evidence.length).padStart(2,'0');
  $('control-hint').textContent=field?'ARROWS / WASD TO MOVE · E TO INSPECT':active?'CLICK / TAP FIRE · R RELOAD':'STATION 04';
  canvas.setAttribute('aria-label',field?`Field survey. Your position is column ${game.player.x+1}, row ${game.player.y+1}. ${site?site.label+'. ':''}Gold page markers show tonight’s unread discoveries. Check marks show searched locations. Use arrow keys or WASD to move. E to inspect. Watchtower is column 2 row 8; pump house column 4 row 4; drainage channel column 8 row 6; northeast corner column 10 row 2.`:'Watchtower shooting gallery. Click moving corn to fire. X selects a crop. Space fires. R reloads.');
  const controlKey=[phase,paused,game.incident,game.rounds,game.reserve,game.reload>0,site?.id,game.inspected.join(',')].join(':');
  if(phase!=='guide'&&(force||controlKey!==lastControlsKey)) {
    lastControlsKey=controlKey;
    const focusedAction=$('controls').contains(document.activeElement)?document.activeElement.dataset.action:null;
    let html='';
    if(field){
      html='<div class="dpad" aria-label="Walk through the field"><button class="up" data-action="move" data-value="0,-1" aria-label="Move north">↑</button><button class="left" data-action="move" data-value="-1,0" aria-label="Move west">←</button><button class="down" data-action="move" data-value="0,1" aria-label="Move south">↓</button><button class="right" data-action="move" data-value="1,0" aria-label="Move east">→</button></div>';
      if(site?.id==='tower'){if(investigationComplete(game))html+='<button class="primary" data-action="debrief">Return / submit report ↗</button>';}
      else if(site)html+=`<button class="primary" data-action="inspect" ${game.inspected.includes(site.id)?'disabled':''}>${game.inspected.includes(site.id)?'Location searched':'Inspect '+site.label.toLowerCase()}</button>`;
      if(canEatCrop(game))html+='<button data-action="corn">Examine the boiling corn</button>';
      else if(!site)html+='<small>Walk to a marked location to inspect it. Each move costs exposure.</small>';
    }
    $('controls').innerHTML=html;
    if(paused)$('controls').querySelectorAll('button').forEach(button=>button.disabled=true);
    if(focusedAction)$('controls').querySelector(`[data-action="${focusedAction}"]`)?.focus({preventScroll:true});
  }
  const logKey=JSON.stringify(game.log);
  if(logKey!==lastLog){lastLog=logKey;$('radio-log').innerHTML=game.log.slice(0,6).map(l=>`<li class="${['story','alert'].includes(l.tone)?l.tone:''}">${esc(l.message)}</li>`).join('');$('announcement').textContent=game.log[0]?.message||'';}
  $('scene-caption').hidden=!field;
  if(field)$('scene-caption').textContent='';
  $('pause-layer').hidden=!paused;
  $('pause').textContent=paused?'Resume':'Pause';
  fieldMap.render(game,paused);
  canvas.hidden=field;
  if (phase === 'guide') updateGuideUI();
  sceneDialog();
}
function updateGuideUI() {
  const g=game.guide, escaping=g.stage==='escape';
  $('phase-label').textContent='RECOVERY DETAIL';
  $('station-status').textContent='RADIO SILENT';
  $('objective').textContent=escaping?'The team is leaving.':'Lead them through.';
  $('objective-detail').textContent=escaping?'The lights are heading south.':'Follow the crossings to the northeast corner.';
  $('stats').innerHTML=stat('CROSSINGS SEARCHED',g.clues.length,'/ 3')+stat('RIFLE',6-g.fired,'rounds');
  $('control-hint').textContent='W/S WALK · A/D TURN · E EXAMINE · X AIM · SPACE FIRE';
  canvas.setAttribute('aria-label', `First-person cornfield. ${g.message} ${escaping?'The team is heading south. X aims at a visible person; Space fires. You can lower your rifle to let them leave.':'Follow the row north to the first crossing, then the central crossing, then the northeast corner.'}`);
  const key=`guide:${g.stage}:${g.clues.length}:${g.x}:${g.y}:${g.angle}:${g.fired}`;
  if(lastControlsKey===key)return;
  lastControlsKey=key;
  $('controls').innerHTML=`<div class="dpad"><button class="up" data-action="guide-step" data-value="1">Walk forward ↑</button><button class="left" data-action="guide-turn" data-value="-1">Turn left ↶</button><button class="down" data-action="guide-step" data-value="-1">Step back ↓</button><button class="right" data-action="guide-turn" data-value="1">Turn right ↷</button></div>${escaping?'<button data-action="guide-focus">Aim at movement</button><button data-action="guide-fire">Fire rifle</button><button class="primary" data-action="guide-spare">Lower rifle. Let them leave.</button>':`<button data-action="guide-inspect" ${nearbyGuideSite(game)?'':'disabled'}>Examine in the light</button><small>${['Follow the row north to the first crossing.','Find the central crossing: east, then north.','Northeast corner: east to the far row, then north.'][g.clues.length]}</small>`}`;
  if(paused)$('controls').querySelectorAll('button').forEach(button=>button.disabled=true);
}
function act(action,value) {
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
  if(action==='records'){$('records').click();return;}
  if(action==='guide-step')stepGuide(game,Number(value));
  if(action==='guide-turn')turnGuide(game,Number(value));
  if(action==='guide-inspect')inspectGuide(game);
  if(action==='guide-spare')spareGuide(game);
  if(action==='guide-focus'){const p=focusGuide(game);if(p)renderer.pointer=p;}
  if(action==='guide-fire'){const t=game?.guide?.team.find(t=>t.id===game.guide.focused&&t.status==='running');const p=t&&projectGuide(game.guide,t);if(p)renderer.pointer={x:p.x,y:p.y-p.height*.5};fire(renderer.pointer);}
  if(action==='close'){if(game?.phase==='decision'&&modalKind==='compulsion')return;closeModal();if(game&&['briefing','debrief','ending','decision'].includes(game.phase)){lastModalKey='';updateUI(true);}return;}
  if(action==='start'){closeModal();startShift(game);canvas.focus({preventScroll:true});}
  if(action==='answer'){closeModal();answer(game,value);}
  if(action==='reload')reload(game);
  if(action==='focus'){const p=focusNext(game);if(p)renderer.pointer=p;else toast('No moving crops in view.');canvas.focus({preventScroll:true});}
  if(action==='confirm-enter'&&game?.phase==='tower'&&!paused){closeModal();enterField(game);}
  if(action==='accept-compulsion'&&game?.phase==='decision'){closeModal();enterField(game);}
  if(action==='move'){fieldMap.stop(game);const [dx,dy]=value.split(',').map(Number);move(game,dx,dy);}
  if(action==='corn' && canEatCrop(game))showModal('corn',paper('Something warm.',`<p>On a camping stove beside the treatment drums, ears of corn roll gently in a pot. A clean plate waits beside butter and a shaker of salt. The smell is sweet enough to make your stomach ache. You cannot remember when you last ate.</p><p>A notice above the stove reads: DO NOT CONSUME THE CROP.</p><div class="paper-actions"><button class="primary" data-action="eat-crop">Butter an ear. Take a bite.</button><button class="secondary" data-action="close">Leave it untouched.</button></div>`,'PUMP HOUSE'));
  if(action==='eat-crop' && eatCrop(game))closeModal();
  if(action==='inspect'){
    const id=inspect(game);
    if(id){const e=EVIDENCE[id];showModal('evidence',paper(e.title,`<p class="eyebrow">${e.code} / ${e.where.toUpperCase()}</p>${evidenceMount(id)}<p>${e.text}</p>${canEatCrop(game)?'<button class="primary" data-action="corn">Examine the boiling corn</button>':''}<button class="primary" data-action="close">Close notebook ↗</button>`,'PRIVATE OBSERVATION'));}
  }
  if(action==='debrief')beginDebrief(game);
  if(action==='restart'){closeModal();begin(game.mode);return;}
  if(action==='new-confirm'){closeModal();begin($('difficulty').value);return;}
  if(action==='export'){exportRecord();return;}
  save();updateUI(true);syncAudio();
  if(['confirm-enter','accept-compulsion'].includes(action)&&game?.phase==='field')$('field-exploration').querySelector('.field-go')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)act(button.dataset.action,button.dataset.value);});
$('new-game').addEventListener('click',()=>{
  if(readSave())showModal('confirm',paper('A new assignment.',`<p>Starting a new assignment replaces the saved shift on this device.</p><div class="paper-actions"><button class="primary" data-action="new-confirm">Start a new shift ↗</button><button class="secondary" data-action="close">Keep my place</button></div>`));
  else begin($('difficulty').value);
});
$('resume').addEventListener('click',()=>begin(null,true));
function togglePause(force) {if(!game||dialog.open)return;paused=typeof force==='boolean'?force:!paused;updateUI();save();syncAudio();}
$('pause').addEventListener('click',()=>togglePause());$('unpause').addEventListener('click',()=>{togglePause(false);canvas.focus({preventScroll:true});});
dialog.addEventListener('cancel',event=>{if(['briefing','debrief','ending','compulsion','encounter'].includes(modalKind))event.preventDefault();else{event.preventDefault();closeModal();}});
$('manual').addEventListener('click',()=>showModal('manual',paper('The field manual.',`<ol class="orders"><li><span>01</span>Watch the corn. Shoot any that try to escape.</li><li><span>02</span>Remain in the watchtower.</li><li><span>03</span>Do not consume the crop.</li><li><span>04</span>Remember any irregularities for your debrief at the end of the night.</li></ol><button class="primary" data-action="close">Understood ↗</button>`)));

$('notebook').addEventListener('click',()=>{
  if(game)showModal('notebook',notebookMarkup(game,Math.max(0,game.evidence.length-1)));
});

canvas.addEventListener('pointermove',event=>{if(['tower','guide'].includes(game?.phase)){renderer.pointer=renderer.coords(event);game.focused=null;}});
canvas.addEventListener('pointerdown',event=>{
  if(!game||paused||dialog.open||menuOpen())return;
  canvas.focus({preventScroll:true});
  if(game.phase==='guide'){renderer.pointer=renderer.coords(event);fire(renderer.pointer);}
  else if(game.phase==='tower'){
    const p=renderer.coords(event);renderer.pointer=p;
    fire(p,event.pointerType==='touch'?22/Math.max(.1,renderer.view.scale):0);
  }
});
function fire(p,padding=0) {const result=game.phase==='guide'?fireGuide(game,p.x,p.y):shoot(game,p.x,p.y,padding);if(!['blocked','empty'].includes(result))shotSound(result==='hit');else if(result==='empty')toast('Rifle empty. Press R or tap Reload.');updateUI();save();}
document.addEventListener('keydown',event=>{
  if(!game||dialog.open||menuOpen()||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  const k=event.key.toLowerCase();
  if(k==='p'||k==='escape'){event.preventDefault();togglePause();return;}
  if(paused)return;
  if(game.phase==='tower'){
    if(event.repeat && k===' ')return;
    if(k==='x'){event.preventDefault();act('focus');}
    if(k==='r'){event.preventDefault();act('reload');}
    if(k===' '&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();const target=game.targets.find(t=>t.id===game.focused);if(target)renderer.pointer={x:target.x,y:target.y-34};fire(renderer.pointer);}
  }
  if(game.phase==='guide'){
    if(event.repeat)return;
    const actions={w:['guide-step','1'],arrowup:['guide-step','1'],s:['guide-step','-1'],arrowdown:['guide-step','-1'],a:['guide-turn','-1'],arrowleft:['guide-turn','-1'],d:['guide-turn','1'],arrowright:['guide-turn','1'],e:['guide-inspect'],x:['guide-focus'],' ':['guide-fire']};
    if(actions[k] && !(k===' ' && ['BUTTON','A'].includes(event.target.tagName))){event.preventDefault();act(...actions[k]);}
  }
  if(game.phase==='field'){
    const directions={arrowup:'0,-1',w:'0,-1',arrowdown:'0,1',s:'0,1',arrowleft:'-1,0',a:'-1,0',arrowright:'1,0',d:'1,0'};
    if(directions[k]){event.preventDefault();act('move',directions[k]);}
    if(k==='e'){event.preventDefault();fieldMap.stop(game);act(nearbySite(game)?.id==='tower'?'debrief':'inspect');}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(game&&!dialog.open)togglePause(true);audioContext?.suspend();}else syncAudio();});
window.addEventListener('pagehide',save);
function exportRecord() {
  const e=getEnding(game);
  const body=`DEBRIEF — PRIVATE TRANSCRIPT\nBased on the story by Ryan L. Melvin\n\n${e.title}\n${e.stamp}\n\n${e.text}\n${e.last}\n\nTESTIMONY\n\n${game.reports.map(r=>`SHIFT ${r.shift+1}\nQ: ${r.question}\nA: ${r.answer}${r.redacted?' [official wording]':''}${r.supervisorReply ? `\nSUPERVISOR: ${r.supervisorReply}` : ''}`).join('\n\n')}\n\nEXHIBITS\n\n${game.evidence.map(id=>`${EVIDENCE[id].title}\n${EVIDENCE[id].text}`).join('\n\n')}`;
  const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='debrief-private-transcript.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function initAudio() {
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){toast('Sound is not available in this browser.');return false;}
  if(!audioContext){
    audioContext=new Audio();master=audioContext.createGain();master.gain.value=.08;master.connect(audioContext.destination);
    const buffer=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate),data=buffer.getChannelData(0);let previous=0;
    for(let i=0;i<data.length;i++){previous=(previous+Math.random()*.04-.02)/1.02;data[i]=previous;}
    ambient=audioContext.createBufferSource();ambient.buffer=buffer;ambient.loop=true;const gain=audioContext.createGain();gain.gain.value=.5;ambient.connect(gain);gain.connect(master);ambient.start();
  }
  await audioContext.resume();return true;
}
function syncAudio(){if(!audioContext)return;if(!soundEnabled||paused||dialog.open||menuOpen()||document.hidden)audioContext.suspend();else audioContext.resume().catch(()=>{});}
$('sound').addEventListener('click',async()=>{
  if(!soundEnabled){try{if(!await initAudio())return;}catch{toast('Sound could not start. You can keep playing silently.');return;}}
  soundEnabled=!soundEnabled;$('sound').textContent=soundEnabled?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(soundEnabled));syncAudio();
});
function shotSound(hit) {
  if(!soundEnabled||!audioContext)return;
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
  oscillator.type='triangle';oscillator.frequency.setValueAtTime(hit?170:130,now);oscillator.frequency.exponentialRampToValueAtTime(45,now+.14);
  gain.gain.setValueAtTime(.9,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);oscillator.connect(gain);gain.connect(master);oscillator.start(now);oscillator.stop(now+.2);
}
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function refreshInstallGuide() {
  if(modalKind !== 'install' || !dialog.open)return;
  const button=$('install-now');
  button.hidden=isInstalled() || !installPrompt;
  $('install-status').textContent=isInstalled() ? 'Debrief is running as an installed app.' : installPrompt ? 'Ready to install.' : 'Install through your browser menu:';
}
function showInstallGuide() {
  save();
  showModal('install',paper('Install on device.',`
    <h3>1. Add Debrief to your device</h3>
    <p class="small" id="install-status" role="status"></p>
    <button class="primary" id="install-now" hidden>Install now ↗</button>
    <ul class="small">
      <li><b>iPhone / iPad:</b> Open this page in Safari, open Share (sometimes inside the page menu), choose Add to Home Screen, enable Open as Web App if offered, then tap Add.</li>
      <li><b>Android:</b> Open the browser menu and choose Install app or Add to Home screen, then confirm.</li>
      <li><b>Computer:</b> Look for the install icon in the address bar or Install app in the browser menu. In Safari on Mac, use File → Add to Dock. If unavailable, try a browser that supports installation.</li>
    </ul>
    <p class="small">Open the new icon once online to prepare for offline play. Browsers and installed apps may keep separate saves.</p>
    <h3>2. Protect local storage</h3>
    <p class="small">Keep saves during automatic browser cleanup. Your browser may decide without a prompt.</p>
    <button id="protect-storage" class="secondary">Request persistent storage</button>
    <p id="storage-status" class="small" role="status" aria-live="polite">Storage protection has not been checked.</p>
    <p class="note"><b>Installation is not a backup.</b> Clearing this site’s data deletes saves even with storage protection. Private browsing may discard them when closed.</p>
    <button class="primary" data-action="close">Done ↗</button>`, 'DEVICE SETUP'));
  refreshInstallGuide();
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
      status.textContent=granted ? 'Persistent storage is enabled.' : 'The browser did not grant persistent storage. You can keep playing; try again after installing and opening the app.';
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
      if(modalKind==='install' && dialog.open)$('install-status').textContent=choice.outcome==='accepted' ? 'Installed. Open the new icon to play.' : 'Installation canceled. You can install later using your browser menu.';
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
    if(now-lastUI>100){updateUI();lastUI=now;}
    if(now-lastSave>1200){save();lastSave=now;}
  }
  if(game?.phase!=='field')renderer.draw(game,now,!game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
