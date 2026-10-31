import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, chooseFieldEncounter, restore, serialize } from '../docs/engine.js';
import { freshFieldEvents, encounterAfterStep } from '../docs/encounters.js';
import { encounterMarkup } from '../docs/art.js';
import { signalMarkup, SignalPlayback } from '../docs/expedition-ui.js';
import { fieldSignals, beginSignal, currentSignal, tuneSignal, protectEncounter } from '../docs/expedition.js';

const field=()=>({...createGame('story',42),phase:'field',entered:true,departure:'chosen',exposure:30,fieldEvents:freshFieldEvents()});
const choice=(html,id)=>html.match(new RegExp(`<button class="choice"[^>]*data-value="${id}"[^>]*>(.*?)</button>`,'s'))?.[1];
function atSignal(s,id='signal-radio') {
  const signal=fieldSignals(s).find(item=>item.id===id);
  s.player={x:signal.x,y:signal.y};
  assert.equal(beginSignal(s,id),true);
}

test('encounter previews match protected exposure and retained equipment, including after restore',()=>{
  let s=field();s.player={x:4,y:4};s.fieldSteps=3;s.exposure=98;
  assert.equal(encounterAfterStep(s),true);
  let html=encounterMarkup(s);
  assert.doesNotMatch(choice(html,'record'),/encounter-benefit|Keep a tape for later nights/);
  assert.match(choice(html,'record'),/\+5 exposure · reaches 100/);
  assert.equal(protectEncounter(s),true);
  s=restore(serialize(s));assert.ok(s);
  html=encounterMarkup(s);
  assert.match(html,/Grounded/);
  assert.doesNotMatch(html,/data-action="encounter-protect"/);
  assert.match(choice(html,'record'),/<s>\+5<\/s> 0 exposure/);
  assert.doesNotMatch(choice(html,'record'),/reaches 100/);
  assert.equal(chooseFieldEncounter(s,'record'),true);
  assert.equal(s.exposure,98);
  assert.match(encounterMarkup(s),/encounter-receipt[^>]*><span>0 exposure/);
  assert.ok(s.fieldEvents.flags.includes('recording'));
});

test('outcome receipt reports the actual change without treating it as a future fatal cost',()=>{
  const s=field();s.player={x:4,y:4};s.fieldSteps=3;s.exposure=93;
  encounterAfterStep(s);chooseFieldEncounter(s,'record');
  const html=encounterMarkup(s);
  assert.match(html,/<span>\+5 exposure<\/span>/);
  assert.doesNotMatch(html,/reaches 100/);
});

test('memory receiver shows four keys without revealing the call sign and survives saved prefixes',()=>{
  let s=field();atSignal(s);
  for(let index=0;index<3;index++) {
    const signal=currentSignal(s),html=signalMarkup(s);
    assert.equal(signal.round,index+1);
    assert.equal((html.match(/data-action="signal-tune"/g)||[]).length,4);
    for(const channel of signal.channels)assert.ok(html.includes(`aria-label="Radio key ${channel.id+1}"`));
    assert.doesNotMatch(html,/strength|bars|signal-bars/);
    assert.equal(html.includes('data-action="signal-bank"'),index>0);
    assert.equal(html.includes('data-action="signal-leave"'),index===0);
    for(const note of signal.sequence) {
      tuneSignal(s,note);
      s=restore(serialize(s));assert.ok(s);
    }
  }
  const html=signalMarkup(s);
  assert.doesNotMatch(html,/data-action="signal-tune"/);
  assert.match(html,/data-action="signal-finish"/);
  assert.match(html,/<strong>−12<\/strong>EXPOSURE/);
  assert.match(html,/<strong>\+300<\/strong>FIELD POINTS/);
  assert.match(html,/<strong>\+1<\/strong>SUPPLIES/);
});

test('a wrong remembered note shows halved winnings and never offers another attempt',()=>{
  const s=field();atSignal(s);
  for(const note of currentSignal(s).sequence)tuneSignal(s,note);
  const signal=currentSignal(s);
  tuneSignal(s,(signal.sequence[0]+1)%4);
  const html=signalMarkup(s);
  assert.match(html,/That voice was too close/);
  assert.match(html,/<strong>−1<\/strong>EXPOSURE/);
  assert.match(html,/<strong>\+25<\/strong>FIELD POINTS/);
  assert.doesNotMatch(html,/data-action="signal-tune"|data-action="signal-bank"/);
});

function clock() {
  let now=0,next=0;const tasks=new Map();
  return {setTimer:(fn,delay)=>{const id=++next;tasks.set(id,{fn,at:now+delay});return id;},clearTimer:id=>tasks.delete(id),
    advance(ms){const end=now+ms;while(true){const job=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!job||job[1].at>end)break;now=job[1].at;tasks.delete(job[0]);job[1].fn();}now=end;},get pending(){return tasks.size;}};
}
function element(dataset={}) {
  const classes=new Set();
  return {dataset,disabled:true,textContent:'',children:[],attributes:{},setAttribute(name,value){this.attributes[name]=value;},
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,force){const on=force??!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}}};
}
function dialogFor(s) {
  const signal=currentSignal(s),pads=Array.from({length:4},(_,id)=>element({value:String(id)}));
  const message=element(),mode=element(),notes=element(),replay=element();notes.children=signal.sequence.map(()=>element());
  const instrument={pads,message,mode,notes,replay,querySelectorAll:()=>pads,querySelector:selector=>({'[data-signal-message]':message,'[data-signal-mode]':mode,'[data-signal-notes]':notes,'[data-action="signal-replay"]':replay})[selector]};
  const dialog={open:true,dataset:{kind:'signal'},ownerDocument:{hidden:false},instrument,querySelector(){return this.instrument;}};
  return dialog;
}

test('playback gates input, flashes the stored sequence, and never changes game state',()=>{
  const s=field();atSignal(s);const saved=serialize(s),sequence=currentSignal(s).sequence,timer=clock(),dialog=dialogFor(s),playback=new SignalPlayback(timer);
  playback.mount(s,dialog);assert.equal(playback.accepting,false);assert.ok(dialog.instrument.pads.every(pad=>pad.disabled));
  timer.advance(450);assert.ok(dialog.instrument.pads[sequence[0]].classList.contains('signal-key-lit'));
  timer.advance(550);assert.ok(dialog.instrument.pads.every(pad=>!pad.classList.contains('signal-key-lit')));
  timer.advance(250);assert.ok(dialog.instrument.pads[sequence[1]].classList.contains('signal-key-lit'));
  timer.advance(10000);assert.equal(playback.accepting,true);assert.ok(dialog.instrument.pads.every(pad=>!pad.disabled));
  assert.match(dialog.instrument.message.textContent,/Your turn/);assert.equal(serialize(s),saved);
});

test('same-round rerenders keep input ready; resumed prefixes replay and clearly request the remaining note',()=>{
  let s=field();atSignal(s);const timer=clock(),dialog=dialogFor(s),playback=new SignalPlayback(timer);
  playback.mount(s,dialog);timer.advance(10000);
  tuneSignal(s,currentSignal(s).sequence[0]);
  dialog.instrument=dialogFor(s).instrument;playback.mount(s,dialog);
  assert.equal(playback.accepting,true);assert.equal(timer.pending,0);
  assert.match(dialog.instrument.message.textContent,/Continue at note 2 of 3/);
  assert.equal(dialog.instrument.notes.children[0].classList.contains('matched'),true);
  s=restore(serialize(s));assert.ok(s);playback.stop();
  dialog.instrument=dialogFor(s).instrument;playback.mount(s,dialog);
  assert.equal(playback.accepting,false);timer.advance(10000);
  assert.match(dialog.instrument.message.textContent,/Continue at note 2 of 3/);
  assert.equal(currentSignal(s).entered.length,1);
  assert.equal(playback.replay(s,dialog),true);assert.equal(playback.accepting,false);timer.advance(10000);
  assert.equal(currentSignal(s).entered.length,1);
});

test('hidden or closed dialogs cancel playback and visible remount starts cleanly',()=>{
  const s=field();atSignal(s);const timer=clock(),dialog=dialogFor(s),playback=new SignalPlayback(timer);
  playback.mount(s,dialog);timer.advance(450);dialog.ownerDocument.hidden=true;timer.advance(550);
  assert.equal(playback.accepting,false);assert.equal(timer.pending,0);assert.ok(dialog.instrument.pads.every(pad=>!pad.classList.contains('signal-key-lit')));
  dialog.ownerDocument.hidden=false;playback.mount(s,dialog);assert.ok(timer.pending>0);timer.advance(10000);assert.equal(playback.accepting,true);
  playback.replay(s,dialog);dialog.open=false;timer.advance(450);assert.equal(timer.pending,0);assert.equal(playback.accepting,false);
});
