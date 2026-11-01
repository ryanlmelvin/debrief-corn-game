import { rescueStatus } from './rescue.js';

function waveform(offset) {
  return Array.from({ length: 121 }, (_, index) => {
    const phase = index / 120 * Math.PI * 4 + offset / 12 * Math.PI * 2;
    const breath = Math.sin(phase) * .7 + Math.sin(phase * 2) * .2;
    return `${index ? 'L' : 'M'}${(index * 3).toFixed(1)} ${(44 - breath * 25).toFixed(1)}`;
  }).join(' ');
}

const boot = (index, x) => `<g data-rescue-boot="${index}" transform="translate(${x} 0)">
  <g class="rescue-boot-shape"><path d="M-26 31h38l3 64 28 17q9 7 3 17h-70q-10-6-10-16z" fill="#4b4d38" stroke="#c3ba94" stroke-width="2"/><path d="M-17 41h22M-17 51h23M-17 61h24M-17 71h25M-26 121h72" stroke="#9b9c76" stroke-width="2"/></g>
  <g class="rescue-boot-roots" fill="none" stroke="#baa67c" stroke-width="3" stroke-linecap="round"><path d="M-70 146q35-64 93-47t37 48M-63 165q15-67 49-57t64 14M-44 95q28-22 64-5M-28 102l-32-24m17 9-2-24M19 111l35-38m-11 14 24-3M-2 132l-9 34m8-20 22 24"/></g>
  <text x="0" y="193" text-anchor="middle" class="rescue-boot-label">${index ? 'RIGHT BOOT' : 'LEFT BOOT'}</text>
</g>`;

export function rescueMarkup() {
  return `<section class="rescue-game" aria-labelledby="rescue-title">
    <header class="rescue-heading"><div><p class="rescue-eyebrow">AT THE LANTERN / TWO VOICES</p><h2 id="rescue-title" tabindex="-1">Give me your hands.</h2></div><p class="rescue-count"><b data-rescue-count>0 / 4</b><span>GRIPS COMPLETED</span></p></header>
    <div class="rescue-layout">
      <div class="rescue-scene">
        <div class="rescue-scene-art" aria-hidden="true"></div>
        <div class="rescue-field-diagram"><svg viewBox="0 0 380 210" aria-hidden="true"><path d="M5 147q75-18 145 3t225-6" fill="none" stroke="#707957" stroke-width="2" stroke-dasharray="3 8"/>${boot(0, 110)}${boot(1, 265)}</svg></div>
        <div class="rescue-root-state"><span class="rescue-status-lamp" aria-hidden="true"></span><span data-rescue-root-state>ROOTS HOLDING</span></div>
        <div class="rescue-breath-track" aria-label="Breathing cycle"><span class="rescue-quiet-zone"></span><i data-rescue-breath-needle></i><span class="rescue-quiet-label">QUIET</span></div>
        <div class="rescue-grips" aria-label="Completed grips">${Array.from({length:4}, (_,i)=>`<span data-rescue-grip="${i}"><i></i></span>`).join('')}</div>
      </div>
      <div class="rescue-controls">
        <div class="rescue-tape-console">
          <div class="rescue-wave-labels"><span><i class="rescue-radio-key"></i>RADIO</span><span><i class="rescue-tape-key"></i>YOUR TAPE</span></div>
          <svg class="rescue-waves" viewBox="0 0 360 88" role="img" aria-label="Radio and tape breathing traces"><path d="M0 44H360" stroke="#778361" stroke-width=".5"/><path data-rescue-radio class="rescue-radio-wave"/><path data-rescue-tape class="rescue-tape-wave"/></svg>
          <div class="rescue-tape-position"><span>TAPE POSITION</span><span data-rescue-offset>01 / 12</span></div>
        </div>
        <p class="rescue-cue" data-rescue-cue role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="rescue-instruction" data-rescue-instruction></p>
        <div class="rescue-align-controls" data-rescue-align-controls><div class="rescue-nudge-controls"><button class="secondary" data-action="resolution-game" data-value="earlier" aria-label="Move tape earlier">← Earlier</button><button class="secondary" data-action="resolution-game" data-value="later" aria-label="Move tape later">Later →</button></div><button class="primary" data-action="resolution-game" data-value="align">Play together</button></div>
        <div class="rescue-pull-controls" data-rescue-pull-controls hidden><button class="primary rescue-pull-button" data-action="resolution-game" data-value="pull" data-hold="pull" aria-pressed="false">Hold to pull</button><button class="secondary" data-action="resolution-game" data-value="release">Release</button></div>
        <p class="rescue-keyboard-help"><span data-rescue-keys>← / → move tape · Enter plays</span><span>Sound is optional.</span></p>
      </div>
    </div>
  </section>`;
}

export class RescueUI {
  constructor(root) { this.root = root; this.mounted = false; }
  reset() { this.mounted = false; this.root.innerHTML = ''; }
  render(r, disabled = false) {
    const view = rescueStatus(r);
    if (!view) { this.root.hidden = true; return; }
    this.root.hidden = false;
    if (!this.mounted || !this.root.querySelector('.rescue-game')) {
      this.root.innerHTML = rescueMarkup();
      this.mounted = true;
    }
    const q = selector => this.root.querySelector(selector);
    const setText = (selector, text) => { const node = q(selector); if (node.textContent !== text) node.textContent = text; };
    const panel = q('.rescue-game');
    panel.dataset.stage = view.stage;
    panel.classList.toggle('rescue-is-quiet', view.safe && !view.warning);
    panel.classList.toggle('rescue-is-warning', view.warning);
    panel.classList.toggle('rescue-is-pulling', view.holding && !view.needsRelease);
    panel.classList.toggle('rescue-is-paused', disabled);
    panel.classList.toggle('rescue-is-aligned', view.aligned);
    q('[data-rescue-align-controls]').hidden = view.stage !== 'align';
    q('[data-rescue-pull-controls]').hidden = view.stage !== 'pull';
    for (const button of this.root.querySelectorAll('button[data-action="resolution-game"]')) {
      button.disabled = disabled || view.stage === 'complete' || (button.dataset.value === 'align' && !view.aligned);
    }
    q('[data-value="release"]').disabled = disabled || !view.holding && !view.needsRelease;
    q('[data-value="pull"]').setAttribute('aria-pressed', String(view.holding));
    setText('[data-value="pull"]', view.needsRelease ? 'Let go · reset grip' : view.holding ? 'Pulling…' : 'Hold to pull');
    setText('[data-rescue-count]', `${view.pulls} / ${view.totalPulls}`);
    setText('[data-rescue-cue]', disabled ? 'Your hands are resting.' : view.cue);
    setText('[data-rescue-instruction]', view.instruction);
    setText('[data-rescue-offset]', `${String(view.offset + 1).padStart(2, '0')} / 12`);
    setText('[data-rescue-keys]', view.stage === 'align' ? '← / → move tape · Enter plays' : 'Hold Space to pull · release Space to rest');
    setText('[data-rescue-root-state]', view.stage === 'complete' ? 'BOTH BOOTS FREE' : view.stage === 'align' ? 'ROOTS HOLDING' : view.warning ? 'TIGHTENING · RELEASE' : view.safe ? 'QUIET · ROOTS LOOSEN' : 'ROOTS TIGHT · WAIT');
    q('[data-rescue-breath-needle]').style.left = `${view.cyclePosition * 100}%`;
    q('[data-rescue-radio]').setAttribute('d', waveform(view.target));
    q('[data-rescue-tape]').setAttribute('d', waveform(view.offset));
    q('.rescue-waves').setAttribute('aria-label', view.aligned ? 'Radio and tape breaths match.' : 'Radio is a solid line. Tape is dashed. Move the tape until the traces match.');
    for (const [index, state] of view.boots.entries()) {
      const node = q(`[data-rescue-boot="${index}"]`);
      node.classList.toggle('rescue-boot-free', state.freed);
      node.querySelector('.rescue-boot-shape').style.transform = `translateY(${-state.progress * 20}px)`;
      node.querySelector('.rescue-boot-roots').style.opacity = String(state.freed ? .15 : .9 - state.progress * .4);
      node.querySelector('.rescue-boot-label').textContent = `${index ? 'RIGHT' : 'LEFT'} BOOT${state.freed ? ' · FREE' : ''}`;
    }
    for (let index = 0; index < view.totalPulls; index++) {
      const node = q(`[data-rescue-grip="${index}"]`);
      const filled = index < view.pulls ? 1 : index === view.pulls ? view.progress : 0;
      node.classList.toggle('rescue-grip-done', index < view.pulls);
      node.querySelector('i').style.width = `${filled * 100}%`;
    }
    q('.rescue-grips').setAttribute('aria-label', `${view.pulls} of ${view.totalPulls} grips completed. ${view.boots.filter(boot => boot.freed).length} of 2 boots free.`);
  }
}
