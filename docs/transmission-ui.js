import { TRANSMISSION_DELAY, TRANSMISSION_EXPOSURE_COST, transmissionGate, transmissionHorror, transmissionStatus } from './transmission.js';

const COMMAND_LABELS = { wait: 'Wait', advance: 'Advance', turn: 'Turn' };
const MARKERS = [[18, 84], [18, 50], [70, 50], [70, 16]];
const GATES = [[18, 66, 0], [44, 50, 90], [70, 32, 0]];

export function transmissionMarkup() {
  return `<div class="transmission-game">
    <header class="transmission-heading"><h2 id="transmission-title" tabindex="-1">The other tower.</h2><div class="transmission-metrics"><div class="transmission-exposure"><label for="transmission-exposure">EXPOSURE <b id="transmission-exposure-value">0</b></label><meter id="transmission-exposure" min="0" max="100" low="60" high="80" optimum="0" value="0">0 / 100</meter></div><p class="transmission-count"><span>CROSSINGS</span><b id="transmission-count">0 / 3</b></p></div></header>
    <div class="transmission-layout">
      <div class="transmission-map-wrap"><svg id="transmission-map" class="transmission-map" viewBox="0 0 100 100" role="img" aria-label="Your earlier light on a three-crossing path. Gold marks the path; striped rows open and close across it.">
        <defs><pattern id="transmission-corn-rows" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M1 0V5M4 0V5" stroke="#72815b" stroke-width=".2" opacity=".25"/></pattern><radialGradient id="transmission-lantern-glow"><stop offset="0" stop-color="#fff1ba" stop-opacity=".65"/><stop offset="1" stop-color="#e4c780" stop-opacity="0"/></radialGradient></defs>
        <rect x="1" y="1" width="98" height="98" rx="1" fill="#17251de8" stroke="#7e896866" stroke-width=".3"/>
        <rect x="2" y="2" width="96" height="96" fill="url(#transmission-corn-rows)"/>
        <path d="M18 84V50H70V16" fill="none" stroke="#111c17" stroke-width="9"/>
        <path d="M18 84V50H70V16" fill="none" stroke="#b5a26b" stroke-width=".65" stroke-dasharray="1.1 1.3"/>
        ${GATES.map(([x,y,rotation], i) => `<g class="transmission-row" data-crossing="${i}" transform="translate(${x} ${y}) rotate(${rotation})" aria-hidden="true"><path class="transmission-row-shadow" d="M-12 0H12"/><path class="transmission-row-roots" d="M-12 0H12"/></g>`).join('')}
        ${MARKERS.map(([x,y], i) => `<g class="transmission-marker" data-marker="${i}" transform="translate(${x} ${y})" aria-hidden="true"><circle r="2.9"/><text x="0" y=".9">${i === 3 ? 'R' : String(i + 1)}</text></g>`).join('')}
        ${MARKERS.slice(1,3).map(([x,y],i)=>`<g class="transmission-horror" data-horror="${i+1}" transform="translate(${x} ${y})" aria-hidden="true"><ellipse class="transmission-horror-shadow" cy="-2" rx="8" ry="9"/><path class="transmission-horror-body" d="M-2-8Q0-12 2-8L3-4Q8-7 7-2L4 1Q7 2 9 0Q8 5 3 3L1 1Q1 6 5 7Q0 8-1 3Q-5 7-8 3Q-3 4-3 0Q-8 1-7-4Q-4-2-3-4Z"/><path class="transmission-horror-tendrils" d="M-2-5Q-6-9-7-6M2-5Q5-10 7-7M-3 0Q-10-1-8-5M3 1Q10 6 11 2M-1 2Q-5 9-7 7"/><path class="transmission-horror-eyes" d="M-1.6-6.5h.8M.8-6.5h.8"/></g>`).join('')}
        <g id="transmission-light" aria-hidden="true"><circle r="8" fill="url(#transmission-lantern-glow)"/><circle r="1.7" fill="#fff2bf" stroke="#171e16" stroke-width=".5"/><path id="transmission-facing" d="M0-2.5L-1-4.6H1Z" fill="#fff2bf"/></g>
        <text x="24" y="88" class="transmission-map-label">YOUR LIGHT</text><text x="70" y="9" text-anchor="middle" class="transmission-map-label">RADIO</text>
      </svg></div>
      <aside class="transmission-console">
        <p id="transmission-step" class="transmission-step">FIRST MOVE</p>
        <p id="transmission-message" class="transmission-message" role="status" aria-live="polite" aria-atomic="true">Press Advance. Your light follows after a short delay.</p>
        <div class="transmission-delivery" hidden><span id="transmission-delivery"></span><div aria-hidden="true"><span id="transmission-delivery-meter"></span></div></div>
        <div class="transmission-buttons" role="group" aria-label="Guide your light"><button class="primary" data-action="resolution-game" data-value="advance">Advance</button><button class="secondary" data-action="resolution-game" data-value="wait" hidden>Wait</button><button class="primary" data-action="resolution-game" data-value="turn" hidden>Turn ↱</button></div>
      </aside>
    </div>
  </div>`;
}

/** Live updates preserve the focused command and every pointer target. */
export class TransmissionUI {
  constructor(root) { this.root = root; this.mounted = false; this.lastMessage = ''; }
  reset() { this.mounted = false; this.lastMessage = ''; }
  render(t, disabled = false, exposure = 0) {
    if (!t) { this.root.hidden = true; this.reset(); return; }
    this.root.hidden = false;
    if (!this.mounted || !this.root.querySelector('.transmission-game')) {
      this.root.innerHTML = transmissionMarkup();
      this.mounted = true;
      this.lastMessage = '';
    }
    const q = selector => this.root.querySelector(selector), status = transmissionStatus(t);
    q('.transmission-game').classList.toggle('transmission-paused', disabled);
    q('#transmission-count').textContent = `${t.crossing} / 3`;
    const exposureValue = Math.max(0, Math.min(100, exposure));
    q('#transmission-exposure-value').textContent = String(Math.floor(exposureValue));
    q('#transmission-exposure').value = exposureValue;
    q('#transmission-exposure').textContent = `${Math.floor(exposureValue)} / 100`;
    q('.transmission-game').classList.toggle('transmission-learning', status.tutorial);
    q('#transmission-step').textContent = status.tutorial ? 'FIRST MOVE' : '';
    q('#transmission-step').hidden = !status.tutorial;
    q('#transmission-light').setAttribute('transform', `translate(${status.position.x} ${status.position.y})`);
    q('#transmission-facing').setAttribute('transform', `rotate(${t.heading === 1 ? 90 : 0})`);
    for (let i = 0; i < 3; i++) {
      const row = q(`[data-crossing="${i}"]`), gate = transmissionGate(t, i), cleared = i < t.crossing;
      row.classList.toggle('is-open', gate.open);
      row.classList.toggle('is-cleared', cleared);
      row.classList.toggle('is-current', i === t.crossing);
      row.querySelector('.transmission-row-roots').setAttribute('d', gate.open ? 'M-12 0H-4.5M4.5 0H12' : 'M-12 0H12');
      row.querySelector('.transmission-row-shadow').setAttribute('d', gate.open ? 'M-12 0H-4.5M4.5 0H12' : 'M-12 0H12');
    }
    this.root.querySelectorAll('[data-marker]').forEach(marker => marker.classList.toggle('is-reached', Number(marker.dataset.marker) <= t.crossing));
    for (let crossing = 1; crossing <= 2; crossing++) {
      const horror = transmissionHorror(t, crossing), figure = q(`[data-horror="${crossing}"]`);
      const atBend = t.crossing === crossing && status.needsTurn;
      figure.classList.toggle('is-present', atBend && horror.present);
      figure.classList.toggle('is-warning', atBend && !horror.present && horror.warning);
    }
    q('.transmission-delivery').hidden = !t.pending;
    q('#transmission-delivery').textContent = t.pending ? `${COMMAND_LABELS[t.pending.action]} arriving · ${status.commandRemaining.toFixed(1)}s` : '';
    q('#transmission-delivery-meter').style.width = t.pending ? `${100 * (1 - status.commandRemaining / TRANSMISSION_DELAY)}%` : '0%';
    const advance = q('[data-value="advance"]'), wait = q('[data-value="wait"]'), turn = q('[data-value="turn"]');
    const focused = this.root.ownerDocument?.activeElement;
    advance.hidden = status.needsTurn || status.complete;
    wait.hidden = status.tutorial || !t.moving || status.complete;
    turn.hidden = !status.needsTurn || status.complete;
    advance.disabled = disabled || !status.canAdvance;
    wait.disabled = disabled || !status.canWait;
    turn.disabled = disabled || !status.canTurn;
    turn.textContent = t.crossing === 1 ? 'Turn →' : 'Turn ↑';
    if ([advance, wait, turn].includes(focused) && focused.hidden) {
      [advance, wait, turn].find(button => !button.hidden && !button.disabled)?.focus({ preventScroll: true });
    }
    const message = status.complete ? 'You reached the radio.' :
      t.pending ? status.tutorial ? 'Radio commands take a moment to arrive.' : '' :
      t.message.startsWith('The row closes') ? `Collision · +${TRANSMISSION_EXPOSURE_COST} exposure` :
      t.message.startsWith('Something waits at the bend') ? `It caught your turn · +${TRANSMISSION_EXPOSURE_COST} exposure` :
      status.needsTurn ? t.version === 2 && t.crossing === 1 ? 'Turn while the shape is gone.' : '' :
      t.moving ? status.tutorial ? 'Follow your light to the next marker.' : '' :
      status.tutorial ? 'Press Advance. Your light follows after a short delay.' :
      '';
    q('#transmission-message').hidden = !message;
    if (this.lastMessage !== message) { q('#transmission-message').textContent = message; this.lastMessage = message; }
    const horror = transmissionHorror(t);
    const description = status.complete ? 'All three crossings cleared. Your earlier self has reached the buried radio.' : `Crossing ${t.crossing + 1} of 3. Your light is ${status.needsTurn ? 'at the bend, waiting to turn' : t.moving ? 'moving' : 'waiting'}. The next row is ${status.gate.open ? 'open' : 'closed'}.${status.needsTurn && t.version === 2 ? horror.present ? ' A horror blocks the bend.' : horror.warning ? ' A shadow is forming at the bend.' : ' The horror has vanished.' : ''} ${t.pending ? `${COMMAND_LABELS[t.pending.action]} is on the air.` : 'The radio is ready.'}`;
    if (q('#transmission-map').getAttribute('aria-label') !== description) q('#transmission-map').setAttribute('aria-label', description);
  }
}
