import { createGame, startShift, advance, reload, shoot, focusNext, enterField, move, inspect, nearbySite, beginDebrief, getQuestion, answer, serialize, restore, BRIEFINGS, EVIDENCE, ENDINGS, DATES, REPORT_DATES, SHIFT_LENGTH } from './engine.js';
import { Renderer } from './renderer.js';

const $ = id => document.getElementById(id);
const canvas=$('field'), renderer=new Renderer(canvas), dialog=$('paper-dialog');
const SAVE_KEY=`debrief-save-v1:${new URL('.',location.href).pathname}`;
let game=null, paused=false, modalKind='', lastModalKey='', lastControlsKey='', lastLog='', lastFrame=0, lastSave=0, lastUI=0, toastTimer, installPrompt=null;
let audioContext=null, master=null, ambient=null, soundEnabled=false, storageWarned=false;
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readSave() { try { return restore(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
let saved=readSave();
$('resume').hidden=!saved;
function save() {
  if(!game)return;
  try { localStorage.setItem(SAVE_KEY,serialize(game));saved=game;$('save-status').textContent='PROGRESS SAVED ON THIS DEVICE'; }
  catch { $('save-status').textContent='SAVING UNAVAILABLE';if(!storageWarned){toast('Your browser is blocking local saves. Keep this tab open to retain your progress.');storageWarned=true;} }
}
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000); }
function paper(title,body,tag='PERSONNEL COPY',footer='DEPARTMENT OF AGRICULTURAL CONTAINMENT') {
  return `<article class="paper"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="paper-top"><span>STATION 04 / ILLINOIS<br>RESTRICTED FIELD OPERATIONS</span><span>${tag}<br>FILE NO. 04–${game?String(game.shift+1).padStart(2,'0'):'00'}</span></div><h2 id="dialog-title" tabindex="-1">${title}</h2>${body}<div class="paper-footer"><span>${footer}</span><span>KEEP FOR YOUR RECORDS</span></div></article>`;
}
function showModal(kind,html) {
  modalKind=kind;$('dialog-content').innerHTML=html;
  if(!dialog.open)dialog.showModal();
  $('dialog-title')?.focus({preventScroll:true});
  syncAudio();
}
function closeModal() {dialog.close();modalKind='';syncAudio();canvas.focus({preventScroll:true});}
function begin(mode,fromSave=false) {
  game=fromSave?readSave():createGame(mode);
  if(!game){toast('The saved shift could not be read. You can start a new one.');return;}
  paused=false;lastModalKey='';lastControlsKey='';lastLog='';
  $('welcome').hidden=true;$('sidebar').hidden=false;$('pause').hidden=false;document.body.classList.add('playing');
  if(dialog.open)closeModal();updateUI(true);save();
}
function sceneDialog() {
  if(!game)return;
  const key=`${game.phase}:${game.shift}:${game.question}:${game.ending}`;
  if(key===lastModalKey)return;
  lastModalKey=key;
  if(game.phase==='briefing') {
    const b=BRIEFINGS[game.shift];
    showModal('briefing',paper(b.title,`<p class="eyebrow">SHIFT ${game.shift+1} / ${DATES[game.shift]}, <span class="redacted-text">19XX</span></p><p>${b.text}</p><ol class="orders">${b.orders.map((o,i)=>`<li><span>0${i+1}</span>${o}</li>`).join('')}</ol><p class="note">${b.note}</p>${game.shift===0?'<p class="small">Aim and click or tap moving corn. <b>X</b> selects a crop, <b>Space</b> fires, and <b>R</b> reloads. Each watch lasts 55 seconds. Six total breaches end your assignment.</p>':''}<button class="primary" data-action="start">Take your post <span>↗</span></button>`, 'SHIFT ORDERS'));
  } else if(game.phase==='debrief') {
    const q=getQuestion(game);
    showModal('debrief',paper('For the record.',`<p class="eyebrow">${REPORT_DATES[game.shift]}, <span class="redacted-text">19XX</span> / RECORDED INTERVIEW</p><span class="question-num">${game.question === 3 ? 'INTERVIEW CLOSED' : `QUESTION 0${game.question+1} / 03`}</span><p><strong>[SUPERVISOR]</strong><br>${esc(q.prompt)}</p><p class="note">${esc(q.context)}</p><div class="choices">${q.options.map(o=>`<button class="choice" data-action="answer" data-value="${o.id}" ${o.disabled?'disabled':''}>${esc(o.label)}<small>${esc(o.detail)}</small></button>`).join('')}</div>`, 'DEBRIEF TRANSCRIPT'));
  } else if(game.phase==='ending') {
    const e=ENDINGS[game.ending];
    showModal('ending',paper(e.title,`<p class="eyebrow">ENDING ${e.code} / 06</p><p>${e.text}</p><p class="note">${e.last}</p><div class="stamp">${e.stamp}</div><div class="receipt-stats"><span>CROPS CONTAINED<strong>${game.kills}</strong></span><span>EXHIBITS RETAINED<strong>${game.evidence.length}</strong></span><span>PERIMETER BREACHES<strong>${game.breaches}</strong></span></div><p class="small">Based on <i>Debrief</i> by Ryan L. Melvin. Game scenes and alternate outcomes expand on the original story.</p><div class="paper-actions"><button class="primary" data-action="restart">Another assignment ↗</button><button class="secondary" data-action="export">Keep the transcript ↓</button></div>`, 'FINAL DISPOSITION'));
  }
}
function stat(label,value,sub='',percent=null,warning=false) {return `<div class="stat ${warning?'warning':''}"><label>${label}</label><strong>${value}</strong><small> ${sub}</small>${percent!==null?`<div class="meter"><span style="width:${Math.min(100,Math.max(0,percent))}%"></span></div>`:''}</div>`;}
function updateUI(force=false) {
  if(!game)return;
  const phase=game.phase,field=phase==='field',site=nearbySite(game),active=phase==='tower';
  $('date-label').textContent=`${DATES[game.shift]}, ████`;
  $('station-status').textContent=field?'RADIO SIGNAL WEAK':phase==='ending'?'FILE CLOSED':'PERIMETER ACTIVE';
  $('phase-label').textContent=field?'FIELD INVESTIGATION':phase==='debrief'?'RECORDED INTERVIEW':'WATCHTOWER';
  $('shift-number').textContent=`0${game.shift+1} / 03`;
  $('objective').textContent=field?(site?.label||'Find your way through.'):phase==='decision'?'Your relief has arrived.':'Maintain the perimeter.';
  $('objective-detail').textContent=field?'Visit marked locations. Return to the tower before exposure reaches 100.':phase==='decision'?'Investigate the northeast corner, or submit your report.':'Shoot moving stalks. White figures are not targets.';
  $('stats').innerHTML=field?stat('EXPOSURE',Math.floor(game.exposure),' / 100',game.exposure,game.exposure>=70)+stat('EXHIBITS',String(game.evidence.length).padStart(2,'0'),'retained'):stat('RELIEF IN',Math.max(0,Math.ceil(SHIFT_LENGTH-game.time)),'sec',(SHIFT_LENGTH-game.time)/SHIFT_LENGTH*100)+stat('BREACHES',game.breaches,'/ 6',game.breaches/6*100,game.breaches>=3);
  $('evidence-count').textContent=String(game.evidence.length).padStart(2,'0');
  $('control-hint').textContent=field?'ARROWS / WASD TO MOVE · E TO INSPECT':active?'CLICK / TAP TO FIRE · X SELECT · SPACE FIRE · R RELOAD':'REVIEW YOUR ORDERS. KEEP YOUR OWN RECORD.';
  canvas.setAttribute('aria-label',field?`Field survey. Your position is column ${game.player.x+1}, row ${game.player.y+1}. ${site?site.label+'. ':''}Use arrow keys or WASD to move. E to inspect. Watchtower is column 2 row 8; pump house column 4 row 4; drainage channel column 8 row 6; northeast corner column 10 row 2.`:'Watchtower shooting gallery. Click moving corn to fire. X selects a crop. Space fires. R reloads. White figures are not targets.');
  const controlKey=[phase,paused,game.incident,game.rounds,game.reserve,game.reload>0,site?.id,game.inspected.join(',')].join(':');
  if(force||controlKey!==lastControlsKey) {
    lastControlsKey=controlKey;
    const focusedAction=$('controls').contains(document.activeElement)?document.activeElement.dataset.action:null;
    let html='';
    if(active){
      html=`<button class="half" data-action="reload" ${game.reload>0||game.rounds===6||game.reserve===0?'disabled':''}>${game.reload>0?'Reloading…':`Reload · ${game.rounds}/6`}</button><button class="half" data-action="focus">Find movement</button>`;
      if(game.incident)html+='<button class="primary" data-action="enter">Leave the tower ↗</button><small>Loose crops escape if you leave early. Waiting for relief makes departure safer.</small>';
      else html+='<small>Red brackets mark moving crops. Watch the rows; wait for your radio.</small>';
    } else if(phase==='decision')html='<button class="primary" data-action="enter">Investigate the field ↗</button><button data-action="debrief">Remain / submit report</button>';
    else if(field){
      html='<div class="dpad" aria-label="Walk through the field"><button class="up" data-action="move" data-value="0,-1" aria-label="Move north">↑</button><button class="left" data-action="move" data-value="-1,0" aria-label="Move west">←</button><button class="down" data-action="move" data-value="0,1" aria-label="Move south">↓</button><button class="right" data-action="move" data-value="1,0" aria-label="Move east">→</button></div>';
      if(site?.id==='tower')html+='<button class="primary" data-action="debrief">Return / submit report ↗</button>';
      else if(site)html+=`<button class="primary" data-action="inspect" ${game.inspected.includes(site.id)?'disabled':''}>${game.inspected.includes(site.id)?'Location searched':'Inspect '+site.label.toLowerCase()}</button>`;
      else html+='<small>Walk to a marked location to inspect it. Each move costs exposure.</small>';
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
  sceneDialog();
}
function act(action,value) {
  if(action==='close'){closeModal();return;}
  if(action==='start'){closeModal();startShift(game);canvas.focus({preventScroll:true});}
  if(action==='answer'){closeModal();answer(game,value);}
  if(action==='reload')reload(game);
  if(action==='focus'){const p=focusNext(game);if(p)renderer.pointer=p;else toast('No moving crops in view.');canvas.focus({preventScroll:true});}
  if(action==='enter') {
    const loose=game.targets.filter(t=>t.kind==='corn').length;
    if(game.phase==='tower'){
      showModal('departure',paper('Leave your post?',`<p>${loose?`${loose} mobile crop${loose===1?' is':'s are'} still in the field. Leaving now will let ${loose===1?'it':'them'} escape.`:'There are no loose crops in view. You can leave now, before the next movement.'}</p><p class="note">There is someone in the northeast corner. The handbook does not say what to do.</p><div class="paper-actions"><button class="primary" data-action="confirm-enter">Enter the field ↗</button><button class="secondary" data-action="close">Stay at my post</button></div>`));return;
    }
    enterField(game);
  }
  if(action==='confirm-enter'){closeModal();enterField(game);canvas.focus({preventScroll:true});}
  if(action==='move'){const [dx,dy]=value.split(',').map(Number);move(game,dx,dy);}
  if(action==='inspect'){
    const id=inspect(game);
    if(id){const e=EVIDENCE[id];showModal('evidence',paper(e.title,`<p class="eyebrow">${e.code} / ${e.where.toUpperCase()}</p><p>${e.text}</p><p class="small">Retained in your private notebook. You decide what goes into the official record.</p><button class="primary" data-action="close">Close notebook ↗</button>`,'PRIVATE OBSERVATION'));}
  }
  if(action==='debrief')beginDebrief(game);
  if(action==='restart'){closeModal();begin(game.mode);return;}
  if(action==='new-confirm'){closeModal();begin($('difficulty').value);return;}
  if(action==='export'){exportRecord();return;}
  save();updateUI(true);syncAudio();
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)act(button.dataset.action,button.dataset.value);});
$('new-game').addEventListener('click',()=>{
  if(readSave())showModal('confirm',paper('A new assignment.',`<p>Starting a new assignment replaces the saved shift on this device.</p><div class="paper-actions"><button class="primary" data-action="new-confirm">Start a new shift ↗</button><button class="secondary" data-action="close">Keep my place</button></div>`));
  else begin($('difficulty').value);
});
$('resume').addEventListener('click',()=>begin(null,true));
function togglePause(force) {if(!game||dialog.open)return;paused=typeof force==='boolean'?force:!paused;updateUI();save();syncAudio();}
$('pause').addEventListener('click',()=>togglePause());$('unpause').addEventListener('click',()=>{togglePause(false);canvas.focus({preventScroll:true});});
dialog.addEventListener('cancel',event=>{if(['briefing','debrief','ending'].includes(modalKind))event.preventDefault();else{event.preventDefault();closeModal();}});
$('manual').addEventListener('click',()=>showModal('manual',paper('The field manual.',`<p class="small">REVISION 4 / SOME PAGES WITHHELD</p><ol class="orders"><li><span>01</span><div><b>Keep watch.</b> Click or tap moving corn to fire. Red brackets mark mobile crops. White figures are people. Your rifle holds six rounds; reloading takes a moment.</div></li><li><span>02</span><div><b>Choose your moment.</b> Each watch lasts 55 seconds. You may investigate after the sighting. Loose crops escape if you leave before relief arrives. Six breaches across all shifts end the assignment.</div></li><li><span>03</span><div><b>Go off the record.</b> Walk to the northeast corner, pump house, or drainage channel. Inspect what you find. Every step raises exposure. Return to the tower to leave; reaching 100 exposure ends your assignment.</div></li><li><span>04</span><div><b>Answer carefully.</b> Your debrief changes with what you found. Evidence, testimony, and your final decision determine the ending. Exposure falls slightly between shifts; breaches remain.</div></li></ol><p class="small"><b>KEYBOARD</b><br>X select next crop · Space fire · R reload<br>Arrows / WASD walk · E inspect · P pause<br>Touch players can use the on-screen movement buttons.</p><p class="small">Progress saves on this device. The game pauses when this tab is hidden. For offline play, load the game once while connected. Where supported, install it through your browser; on iPhone or iPad use Share → Add to Home Screen.</p><p class="small">Contains fictional body horror and firearm use. No jump scares. Sound is optional. Story intensity slows crops and reduces exposure costs; choose it before a new assignment.</p><button class="primary" data-action="close">Understood ↗</button>`)));
$('notebook').addEventListener('click',()=>{
  const exhibits=game.evidence.map(id=>{const e=EVIDENCE[id];return `<section class="exhibit"><small>${e.code} / ${e.where.toUpperCase()}</small><h3>${e.title}</h3><p>${e.text}</p></section>`;}).join('');
  const reports=game.reports.map(r=>`<p><b>SHIFT ${r.shift+1} / ${esc(r.question)}</b>${r.redacted?'<span class="redacted-text">OBSERVATION WITHHELD</span> ':''}${esc(r.answer)}${r.supervisorReply ? `<br><b>SUPERVISOR</b>${esc(r.supervisorReply)}` : ''}</p>`).join('');
  showModal('notebook',paper('Your private record.',`<p class="small">These notes have not been reviewed by your supervisor.</p><div class="exhibits">${exhibits||'<p>No exhibits retained. The field may tell you more.</p>'}</div>${reports?`<h3>Previous testimony</h3><div class="transcript">${reports}</div>`:''}<button class="primary" data-action="close">Back to duty ↗</button>`,'DO NOT FILE'));
});
canvas.addEventListener('pointermove',event=>{if(game?.phase==='tower'){renderer.pointer=renderer.coords(event);game.focused=null;}});
canvas.addEventListener('pointerdown',event=>{
  if(!game||paused||dialog.open)return;
  canvas.focus({preventScroll:true});
  if(game.phase==='tower'){
    const p=renderer.coords(event);renderer.pointer=p;
    const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/960,rect.height/600);
    fire(p,event.pointerType==='touch'?Math.max(0,22/scale-24):0);
  }
  else if(game.phase==='field') {
    const p=renderer.coords(event),x=Math.floor((p.x-125)/58),y=Math.floor((p.y-74)/58);
    if(x===game.player.x&&y===game.player.y)act('inspect');
    else if(Math.abs(x-game.player.x)+Math.abs(y-game.player.y)===1)act('move',`${x-game.player.x},${y-game.player.y}`);
    else toast('Use the arrows to walk, or tap a neighboring square.');
  }
});
function fire(p,padding=0) {const result=shoot(game,p.x,p.y,padding);if(!['blocked','empty'].includes(result))shotSound(result==='hit');else if(result==='empty')toast('Rifle empty. Press R or tap Reload.');updateUI();save();}
document.addEventListener('keydown',event=>{
  if(!game||dialog.open||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  const k=event.key.toLowerCase();
  if(k==='p'||k==='escape'){event.preventDefault();togglePause();return;}
  if(paused)return;
  if(game.phase==='tower'){
    if(event.repeat && k===' ')return;
    if(k==='x'){event.preventDefault();act('focus');}
    if(k==='r'){event.preventDefault();act('reload');}
    if(k===' '&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();const target=game.targets.find(t=>t.id===game.focused);if(target)renderer.pointer={x:target.x,y:target.y-34};fire(renderer.pointer);}
  }
  if(game.phase==='field'){
    const directions={arrowup:'0,-1',w:'0,-1',arrowdown:'0,1',s:'0,1',arrowleft:'-1,0',a:'-1,0',arrowright:'1,0',d:'1,0'};
    if(directions[k]){event.preventDefault();act('move',directions[k]);}
    if(k==='e'){event.preventDefault();act('inspect');}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(game&&!dialog.open)togglePause(true);audioContext?.suspend();}else syncAudio();});
window.addEventListener('pagehide',save);
function exportRecord() {
  const e=ENDINGS[game.ending];
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
function syncAudio(){if(!audioContext)return;if(!soundEnabled||paused||dialog.open||document.hidden)audioContext.suspend();else audioContext.resume().catch(()=>{});}
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
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
$('install').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}});
window.addEventListener('appinstalled',()=>{$('install').hidden=true;toast('Debrief installed. Your saved shift stays on this device.');});
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
  if(game&&!paused&&!dialog.open&&!document.hidden){
    advance(game,dt);
    const focused=game.targets.find(t=>t.id===game.focused);if(focused)renderer.pointer={x:focused.x,y:focused.y-34};
    if(now-lastUI>100){updateUI();lastUI=now;}
    if(now-lastSave>1200){save();lastSave=now;}
  }
  renderer.draw(game,now,!game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
