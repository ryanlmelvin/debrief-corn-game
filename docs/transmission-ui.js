import { TRANSMISSION_DELAY, transmissionGate, transmissionStatus } from './transmission.js';

const COMMAND_LABELS = { wait: 'Wait', advance: 'Advance', turn: 'Turn' };
const MARKERS = [[18, 84], [18, 50], [70, 50], [70, 16]];
const GATES = [[18, 66, 0], [44, 50, 90], [70, 32, 0]];

export function transmissionMarkup() {
  return `<div class="transmission-game">
    <header class="transmission-heading"><div><p class="transmission-eyebrow">THE OTHER TOWER / SEPTEMBER 30</p><h2 id="transmission-title" tabindex="-1">You’ve heard this before.</h2></div><p class="transmission-count"><span>CROSSINGS</span><b id="transmission-count">0 / 3</b></p></header>
    <div class="transmission-layout">
      <div class="transmission-map-wrap"><svg id="transmission-map" class="transmission-map" viewBox="0 0 100 100" role="img" aria-label="Your earlier light on a three-crossing path. Gold marks the path; striped rows open and close across it.">
        <defs><pattern id="transmission-corn-rows" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M1 0V5M4 0V5" stroke="#72815b" stroke-width=".2" opacity=".25"/></pattern><radialGradient id="transmission-lantern-glow"><stop offset="0" stop-color="#fff1ba" stop-opacity=".65"/><stop offset="1" stop-color="#e4c780" stop-opacity="0"/></radialGradient></defs>
        <rect x="1" y="1" width="98" height="98" rx="1" fill="#17251de8" stroke="#7e896866" stroke-width=".3"/>
        <rect x="2" y="2" width="96" height="96" fill="url(#transmission-corn-rows)"/>
        <path d="M18 84V50H70V16" fill="none" stroke="#111c17" stroke-width="9"/>
        <path d="M18 84V50H70V16" fill="none" stroke="#b5a26b" stroke-width=".65" stroke-dasharray="1.1 1.3"/>
        ${GATES.map(([x,y,rotation], i) => `<g class="transmission-row" data-crossing="${i}" transform="translate(${x} ${y}) rotate(${rotation})" aria-hidden="true"><path class="transmission-row-shadow" d="M-12 0H12"/><path class="transmission-row-roots" d="M-12 0H12"/></g>`).join('')}
        ${MARKERS.map(([x,y], i) => `<g class="transmission-marker" data-marker="${i}" transform="translate(${x} ${y})" aria-hidden="true"><circle r="2.9"/><text x="0" y=".9">${i === 3 ? 'R' : String(i + 1)}</text></g>`).join('')}
        <g id="transmission-light" aria-hidden="true"><circle r="8" fill="url(#transmission-lantern-glow)"/><circle r="1.7" fill="#fff2bf" stroke="#171e16" stroke-width=".5"/><path id="transmission-facing" d="M0-2.5L-1-4.6H1Z" fill="#fff2bf"/></g>
        <text x="24" y="88" class="transmission-map-label">YOUR EARLIER SELF</text><text x="70" y="9" text-anchor="middle" class="transmission-map-label">BURIED RADIO</text>
        <g transform="translate(86 78)" class="transmission-tower" aria-hidden="true"><path d="M-3 7L-2-3H2L3 7M-3 4H3M-2 1H2M-5-3H5V-7H-5Z"/><circle cy="-5" r="1"/></g><text x="85" y="91" text-anchor="middle" class="transmission-map-label">YOU / NOW</text>
      </svg><div class="transmission-map-key"><span><i class="transmission-key-light"></i>Your light</span><span><i class="transmission-key-row"></i>Moving row</span><span><i class="transmission-key-marker"></i>Safe marker</span></div></div>
      <aside class="transmission-console">
        <p id="transmission-memory" class="transmission-memory"></p>
        <div class="transmission-signal"><div class="transmission-signal-heading"><span id="transmission-gap-label">NEXT GAP</span><b id="transmission-gap"></b></div><div class="transmission-gap-meter" aria-hidden="true"><span id="transmission-gap-meter"></span></div><p id="transmission-forecast" class="transmission-forecast"></p></div>
        <div class="transmission-delivery"><span id="transmission-delivery">Radio delay: ${TRANSMISSION_DELAY.toFixed(1)} seconds</span><div aria-hidden="true"><span id="transmission-delivery-meter"></span></div></div>
        <p id="transmission-message" class="transmission-message" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="transmission-buttons" role="group" aria-label="Send a command to your earlier self"><button class="secondary" data-action="resolution-game" data-value="wait">Wait</button><button class="primary" data-action="resolution-game" data-value="advance">Advance</button><button class="secondary" data-action="resolution-game" data-value="turn">Turn ↱</button></div>
        <p class="transmission-instructions">Commands arrive after a delay. Advance through the gap. Wait stops your light; Turn follows the bend at a safe marker.</p>
      </aside>
    </div>
  </div>`;
}

/** Live updates preserve the focused command and every pointer target. */
export class TransmissionUI {
  constructor(root) { this.root = root; this.mounted = false; this.lastMessage = ''; }
  reset() { this.mounted = false; this.lastMessage = ''; }
  render(t, disabled = false) {
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
    q('#transmission-memory').textContent = status.clue;
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
    q('#transmission-gap-label').textContent = status.complete ? 'AT THE RADIO' : `CROSSING ${t.crossing + 1} GAP`;
    q('#transmission-gap').textContent = status.complete ? 'Reached' : status.gate.open ? `Open · ${status.gate.remaining.toFixed(1)}s` : `Opens in ${status.gate.remaining.toFixed(1)}s`;
    q('.transmission-signal').classList.toggle('is-open', status.gate.open);
    q('#transmission-gap-meter').style.width = `${Math.min(100, status.gate.remaining / 4 * 100)}%`;
    q('#transmission-forecast').textContent = status.complete ? 'Your own boots wait beside the radio.' : status.needsTurn ? 'At the bend: send Turn before moving on.' : t.moving ? 'Your light is moving. Wait takes time to arrive, too.' : t.pending ? 'One command on the air. Watch for its arrival.' : status.pastGate ? 'The row is behind you. Advance to the safe marker.' : `Advance now → ${status.arrivalSafe ? 'clear gap' : 'closed row'} on arrival.`;
    q('#transmission-forecast').classList.toggle('is-ready', status.canAdvance && status.arrivalSafe);
    q('#transmission-delivery').textContent = t.pending ? `${COMMAND_LABELS[t.pending.action]} arriving · ${status.commandRemaining.toFixed(1)}s` : `Radio delay: ${TRANSMISSION_DELAY.toFixed(1)} seconds`;
    q('#transmission-delivery-meter').style.width = t.pending ? `${100 * (1 - status.commandRemaining / TRANSMISSION_DELAY)}%` : '0%';
    q('[data-value="advance"]').disabled = disabled || !status.canAdvance;
    q('[data-value="wait"]').disabled = disabled || !status.canWait;
    q('[data-value="turn"]').disabled = disabled || !status.canTurn;
    q('[data-value="turn"]').textContent = t.crossing === 1 ? 'Turn →' : 'Turn ↑';
    if (this.lastMessage !== t.message) { q('#transmission-message').textContent = t.message; this.lastMessage = t.message; }
    const description = status.complete ? 'All three crossings cleared. Your earlier self has reached the buried radio.' : `Crossing ${t.crossing + 1} of 3. Your light is ${status.needsTurn ? 'at the bend, waiting to turn' : t.moving ? 'moving' : 'waiting'}. The next row is ${status.gate.open ? 'open' : 'closed'}. ${t.pending ? `${COMMAND_LABELS[t.pending.action]} is on the air.` : 'The radio is ready.'}`;
    if (q('#transmission-map').getAttribute('aria-label') !== description) q('#transmission-map').setAttribute('aria-label', description);
  }
}
