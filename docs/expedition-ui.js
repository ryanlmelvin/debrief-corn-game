import { currentSignal, expeditionStatus } from './expedition.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roundRewards=[2,6,12];

export function signalMarkup(game) {
  const signal=currentSignal(game);if(!signal)return '';
  const kit=expeditionStatus(game),outcome=signal.outcome;
  const heading=outcome?outcome.title:signal.label;
  const body=outcome?`<div class="signal-result ${outcome.kind==='wrong'?'signal-lost':''}">
      <div class="signal-result-mark" aria-hidden="true">${outcome.kind==='complete'?'◎':outcome.kind==='wrong'?'∿':'✓'}</div>
      <p>${escape(outcome.text)}</p>
      <div class="signal-rewards" aria-label="Rewards received"><span><strong>−${Number(outcome.relief.toFixed(1))}</strong>EXPOSURE</span><span><strong>+${outcome.score}</strong>FIELD POINTS</span><span><strong>+${outcome.supplies}</strong>SUPPLIES</span></div>
      <p class="signal-result-note">Tonight: ${kit.found} / ${kit.total} signals searched · ${kit.score} field points</p>
    </div><button class="primary signal-return" data-action="signal-finish">Back to the map →</button>`:
    `<p class="signal-description">${escape(signal.description)}</p>
    <div class="signal-instrument">
      <div class="signal-instrument-top"><span>FIELD RECEIVER / 04</span><span class="signal-live"><i></i> CALL SIGN</span></div>
      <div class="signal-readout"><span>LOCK ${signal.round} OF 3</span><div class="signal-locks" aria-label="${signal.round-1} of 3 locks completed">${Array.from({length:3},(_,i)=>`<i class="${i<signal.round-1?'locked':i===signal.round-1?'current':''}">${i<signal.round-1?'✓':i+1}</i>`).join('')}</div><span>${String(Math.round(game.exposure)).padStart(2,'0')} EXP</span></div>
      <p class="signal-memory-message" data-signal-message role="status" aria-live="polite">Watch the call sign.</p>
      <div class="signal-notes" data-signal-notes aria-label="${signal.entered.length} of ${signal.sequence.length} notes matched">${signal.sequence.map((_,i)=>`<i class="${i<signal.entered.length?'matched':''}" aria-hidden="true">${i<signal.entered.length?'✓':'·'}</i>`).join('')}</div>
      <div class="signal-channels" role="group" aria-label="Repeat the call sign on the radio keys">${signal.channels.map(channel=>`<button class="signal-channel" data-action="signal-tune" data-value="${channel.id}" aria-label="Radio key ${channel.id+1}" aria-keyshortcuts="${channel.id+1}" disabled><span class="signal-key-lamp" aria-hidden="true"></span><strong>${channel.id+1}</strong></button>`).join('')}</div>
      <div class="signal-listen-row"><span data-signal-mode>Listen first. Then repeat.</span><button data-action="signal-replay" class="signal-replay" aria-keyshortcuts="R" disabled>Replay call sign ↻</button></div>
      <div class="signal-bank"><span>IN YOUR BANK <b>−${signal.bank} exposure · ${signal.scoreBank} pts</b></span><span>NEXT LOCK <b>−${roundRewards[signal.round-1]} exposure total</b></span></div>
    </div>
    <p class="signal-stakes">A mistake halves your bank. Three call signs earn a supply.</p>
    <div class="paper-actions signal-actions">${signal.bank>0?`<button class="primary" data-action="signal-bank">Bank −${signal.bank} exposure &amp; leave →</button>`:`<button class="secondary" data-action="signal-leave">${signal.kind==='cache'?'Take the supply & leave':'Leave this signal'}</button>`}</div>`;
  return `<article class="paper signal-sheet"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="paper-top"><span>OPTIONAL FIELD SIGNAL</span><span>NIGHT 0${game.shift+1}</span></div><h2 id="dialog-title" tabindex="-1">${escape(heading)}</h2>${body}</article>`;
}

// Playback is a view only. The saved game owns the call sign and the matched
// prefix; replacing a dialog or hiding the tab cannot enter a note or win a lock.
export class SignalPlayback {
  constructor({setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=id=>clearTimeout(id)}={}) {
    this.setTimer=setTimer;this.clearTimer=clearTimer;this.timers=new Set();
    this.signature=null;this.dialog=null;this.instrument=null;this.signal=null;this.ready=false;
  }
  get accepting() { return this.ready && this.visible(); }
  visible() { return !!this.dialog?.open && this.dialog.dataset.kind==='signal' && !this.dialog.ownerDocument?.hidden && this.instrument?.isConnected!==false; }
  clearTimers() { for(const id of this.timers)this.clearTimer(id);this.timers.clear(); }
  pads() { return this.instrument?[...this.instrument.querySelectorAll('[data-action="signal-tune"]')]:[]; }
  message(text) { const node=this.instrument?.querySelector('[data-signal-message]');if(node)node.textContent=text; }
  disable(value) {
    this.pads().forEach(pad=>{pad.disabled=value;pad.classList.remove('signal-key-lit');});
    const replay=this.instrument?.querySelector('[data-action="signal-replay"]');if(replay)replay.disabled=value;
  }
  later(callback,delay) {
    const id=this.setTimer(()=>{this.timers.delete(id);if(!this.visible()){this.stop();return;}callback();},delay);
    this.timers.add(id);
  }
  inputReady() {
    this.ready=true;this.disable(false);
    const matched=this.signal.entered.length,total=this.signal.sequence.length;
    this.message(matched?`Continue at note ${matched+1} of ${total}.`:`Your turn. Repeat ${total} notes.`);
    const mode=this.instrument.querySelector('[data-signal-mode]');if(mode)mode.textContent=matched?`${matched} of ${total} matched`:'No time limit.';
    const notes=this.instrument.querySelector('[data-signal-notes]');
    if(notes){notes.setAttribute('aria-label',`${matched} of ${total} notes matched`);[...notes.children].forEach((note,i)=>{note.classList.toggle('matched',i<matched);note.classList.remove('playing');note.textContent=i<matched?'✓':'·';});}
  }
  mount(game,dialog) {
    const signal=currentSignal(game),instrument=dialog?.querySelector('.signal-instrument');
    if(!signal||signal.outcome||!instrument||!dialog.open||dialog.ownerDocument?.hidden){this.stop();return;}
    const signature=[game.runId,game.shift,signal.id,signal.round,signal.sequence.join(',')].join(':');
    const same=this.signature===signature,wasReady=this.ready,unchanged=this.instrument===instrument;
    this.dialog=dialog;this.instrument=instrument;this.signal=signal;
    if(same&&wasReady){this.inputReady();return;}
    if(same&&unchanged&&this.timers.size)return;
    this.signature=signature;this.play();
  }
  play() {
    this.clearTimers();this.ready=false;this.disable(true);
    this.message(this.signal.entered.length?'Listen again. Your matched notes are saved.':'Watch the call sign.');
    const mode=this.instrument.querySelector('[data-signal-mode]');if(mode)mode.textContent='Listen first. Then repeat.';
    const notes=this.instrument.querySelector('[data-signal-notes]');
    const initial=450,lit=550,gap=250;
    this.signal.sequence.forEach((channel,index)=>{
      this.later(()=>{
        this.pads().forEach(pad=>pad.classList.toggle('signal-key-lit',Number(pad.dataset.value)===channel));
        this.message(`Call sign: ${channel+1}`);
        if(notes)[...notes.children].forEach((note,i)=>note.classList.toggle('playing',i===index));
      },initial+index*(lit+gap));
      this.later(()=>{this.pads().forEach(pad=>pad.classList.remove('signal-key-lit'));this.message('Listen…');if(notes)[...notes.children].forEach(note=>note.classList.remove('playing'));},initial+index*(lit+gap)+lit);
    });
    this.later(()=>this.inputReady(),initial+this.signal.sequence.length*(lit+gap));
  }
  replay(game,dialog) {
    const signal=currentSignal(game);if(!signal||signal.outcome)return false;
    this.stop();this.mount(game,dialog);return true;
  }
  stop() {
    this.clearTimers();this.disable(true);this.ready=false;
    this.signature=null;this.dialog=null;this.instrument=null;this.signal=null;
  }
}
