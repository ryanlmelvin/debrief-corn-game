import { getRogueScene, cornHazards, broadcastCursor, broadcastWindow, floodConnections } from './rogue.js';
import { pressureWordMarkup } from './pressure-word.js';
import { dungeonMarkup, renderDungeon } from './dungeon-ui.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLES = { corn: 'Shoot any that try to escape.', broadcast: 'Everyone is listening.', flood: 'The field drinks first.' };
const LABELS = { corn: 'SPECIMEN 04 / PERIMETER CROSSING', broadcast: 'UNAUTHORIZED TRANSMISSION', flood: 'TREATMENT CONTROL / MANUAL OVERRIDE', dungeon: 'DRAINAGE ACCESS / BELOW THE ROOT LINE' };
// Crop the same human-anatomy specimen used by the third watch; its roots sit on the hit marker.
const CORN = `<svg class="rogue-corn-body" x="-.52" y="-1.58" width="1.14" height="1.78" viewBox="683 0 608 1160" preserveAspectRatio="none" overflow="hidden"><defs><clipPath id="rogue-specimen-crop" clipPathUnits="userSpaceOnUse"><rect x="683" y="0" width="608" height="1160"/></clipPath></defs><image href="./assets/watch-human-anatomy.webp" width="1312" height="1199" clip-path="url(#rogue-specimen-crop)"/></svg>`;
const trafficCrossing = r => r.patternVersion === 2 && r.crossing === 2;
const escapeWordMarkup = () => `<span class="rogue-escape-word"><span class="sr-only">escape</span>${pressureWordMarkup('escape')}</span>`;


function sceneMarkup(game) {
  const r = game.rogue, scene = getRogueScene(game);
  if (!scene) return '';
  const art = r.route === 'corn' ? 'field-corner' : r.route === 'broadcast' ? 'encounter-radio' : r.route === 'dungeon' ? 'field-drain' : 'field-pump';
  const customCorn = r.route === 'corn' && r.stage === 'intro';
  return `<div class="rogue-scene"><div class="rogue-scene-art" ${customCorn ? '' : 'aria-hidden="true"'} style="background-image:linear-gradient(0deg,#111b16,transparent 80%),url('./assets/${art}.webp')">${customCorn ? '<img class="rogue-scene-photo" src="./assets/rogue-corn.jpg" alt="Hands turn to roots beneath the watchtower searchlight.">' : ''}</div><article class="rogue-scene-copy"><p class="rogue-eyebrow">${LABELS[r.route]}</p><h2 id="rogue-title" tabindex="-1">${escape(scene.title)}</h2><div class="rogue-scene-text">${scene.text.split('\n\n').map(p => `<p>${escape(p)}</p>`).join('')}</div>${r.route === 'corn' ? escapeWordMarkup() : ''}<div class="rogue-scene-choices">${scene.options.map((option, i) => `<button class="${i === 0 ? 'primary' : 'secondary'}" data-action="rogue-choice" data-value="${escape(option.id)}"><span>${escape(option.label)}</span>${option.detail ? `<small>${escape(option.detail)}</small>` : ''}</button>`).join('')}</div></article></div>`;
}

function head(route) {
  return `<header class="rogue-heading${route === 'corn' ? ' rogue-root-heading' : ''}"><div class="rogue-heading-copy"><p class="rogue-eyebrow">${LABELS[route]}</p><h2 id="rogue-title" ${route === 'corn' ? 'class="rogue-root-title"' : ''} tabindex="-1">${route === 'corn' ? escapeWordMarkup() : TITLES[route]}</h2></div><p class="rogue-condition"><span>${route === 'corn' ? 'HUSK' : route === 'broadcast' ? 'SIGNAL' : 'PRESSURE'}</span><b id="rogue-health"></b></p></header>`;
}

function status() { return '<p id="rogue-message" class="rogue-message" role="status" aria-live="polite" aria-atomic="true"></p>'; }

function cornMarkup(game) {
  const r = game.rogue, road = trafficCrossing(r);
  const lanes = Array.from({ length: 9 }, (_, y) => {
    const safe = [0, 4, 8].includes(y);
    const fill = safe ? (road && y === 4 ? '#535b43' : '#34432d') : road ? (y % 2 ? '#222824' : '#282e29') : y % 2 ? '#1e2a20' : '#253023';
    const boundary = safe || [3, 7].includes(y);
    return `<g><rect x="-.5" y="${y - .5}" width="11" height="1" fill="${fill}"/>${road ? `<path d="M-.5 ${y + .5}H10.5" stroke="${boundary ? '#c9bc83' : '#b5b89f'}" stroke-opacity="${boundary ? '.8' : '.5'}" stroke-width="${boundary ? '.035' : '.025'}" ${boundary ? '' : 'stroke-dasharray=".5 .6"'}/>` : `<path d="M-.5 ${y + .5}H10.5" stroke="${safe ? '#8f9a68' : '#697255'}" stroke-width=".018" stroke-dasharray="${safe ? '.08 .07' : '.025 .11'}"/>`}</g>`;
  }).join('');
  return `<div class="rogue-game rogue-corn-game${road ? ' rogue-road-game' : ''}">${head('corn')}<div class="rogue-play-layout"><div class="rogue-crossing-wrap"><svg id="rogue-crossing" class="rogue-crossing" viewBox="-.5 -.5 11 9" role="img" aria-label="${road ? 'Corn crossing six lanes of traffic. The median provides cover.' : 'Corn crossing the firing lanes. The middle ditch provides cover.'}"><defs><clipPath id="rogue-hazard-clip"><rect x="-.5" y=".5" width="11" height="7"/></clipPath></defs>${lanes}${road ? '' : `<g class="rogue-grid" stroke="#a8b58c" stroke-opacity=".08" stroke-width=".015">${Array.from({ length: 10 }, (_, x) => `<path d="M${x + .5}-.5V8.5"/>`).join('')}</g>`}<g id="rogue-bullets" clip-path="url(#rogue-hazard-clip)" aria-hidden="true"></g><g id="rogue-corn" transform="translate(5 8)" aria-hidden="true"><ellipse cy=".08" rx=".37" ry=".15" fill="#08110bee"/>${CORN}<rect class="rogue-hit-marker" x="-.2" y="-.2" width=".4" height=".4" rx=".08"/></g></svg></div><aside class="rogue-control-panel">${status()}<div class="rogue-dpad" role="group" aria-label="Move your corn"><button class="rogue-up" data-action="rogue-move" data-value="0,-1" aria-label="Move ${road ? 'toward the far shoulder' : 'toward the road'}">↑</button><button class="rogue-left" data-action="rogue-move" data-value="-1,0" aria-label="Move left">←</button><button class="rogue-down" data-action="rogue-move" data-value="0,1" aria-label="Move back ${road ? 'toward the near shoulder' : 'toward the rows'}">↓</button><button class="rogue-right" data-action="rogue-move" data-value="1,0" aria-label="Move right">→</button></div></aside></div></div>`;
}

function broadcastMarkup() {
  return `<div class="rogue-game rogue-broadcast-game">${head('broadcast')}<div class="rogue-play-layout"><div class="rogue-radio-console"><div class="rogue-radio-face" aria-hidden="true"><span>STATION 04</span><div class="rogue-speaker"></div><span>ALL CHANNELS</span></div><div class="rogue-bands" aria-label="Carrier bands locked">${[0, 1, 2].map(i => `<span data-band="${i}"><i></i>0${i + 1}</span>`).join('')}</div><div class="rogue-dial" role="img" aria-label="Tuning needle. Press Lock signal when the needle is inside the gold band."><div class="rogue-dial-ticks" aria-hidden="true"></div><div id="rogue-signal-window" class="rogue-signal-window"><span>LOCK</span></div><i id="rogue-signal-needle" class="rogue-signal-needle"></i></div><p class="rogue-dial-labels" aria-hidden="true"><span>NOISE</span><span>CARRIER FREQUENCY</span><span>NOISE</span></p></div><aside class="rogue-control-panel"><p class="rogue-tip">Lock in gold.</p>${status()}<button class="primary rogue-lock" data-action="rogue-choice" data-value="lock">Lock signal <kbd>SPACE</kbd></button></aside></div></div>`;
}

function floodMarkup() {
  return `<div class="rogue-game rogue-flood-game">${head('flood')}<div class="rogue-play-layout"><div class="rogue-plumbing"><div class="rogue-pipe-label source">PUMP<span>→</span></div><div class="rogue-pipe-grid" role="group" aria-label="Rotate nine treatment pipes to connect the pump to the field">${Array.from({ length: 9 }, (_, i) => `<button class="rogue-pipe-tile" data-action="rogue-choice" data-value="tile-${i}" aria-label="Rotate pipe ${i + 1} clockwise"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="rogue-pipe-shadow"/><path class="rogue-pipe-line"/><circle cx="50" cy="50" r="8" class="rogue-pipe-joint"/></svg><span class="rogue-pipe-number">${i + 1}</span></button>`).join('')}</div><div class="rogue-pipe-label outlet"><span>→</span>FIELD</div></div><aside class="rogue-control-panel"><p class="rogue-tip">Tap a pipe to turn.</p>${status()}<button class="primary rogue-release" data-action="rogue-choice" data-value="release">Open the sluice ↗</button></aside></div></div>`;
}

/** Keeps live controls mounted so keyboard focus and touch targets never move with the simulation. */
export class RogueUI {
  constructor(root) { this.root = root; this.key = ''; this.hazardNodes = new Map(); this.lastMessage = ''; }

  render(game, paused = false) {
    const active = game?.phase === 'rogue' && game.rogue && game.rogue.stage !== 'debrief';
    this.root.hidden = !active;
    if (!active) { this.key = ''; return; }
    const r = game.rogue, key = `${game.runId}:${r.route}:${r.stage}:${r.route === 'corn' ? `${r.patternVersion || 1}:${r.crossing || 0}` : ''}`;
    if (key !== this.key) {
      const hadFocus = !this.key || this.root.contains(document.activeElement);
      this.key = key; this.hazardNodes = new Map(); this.lastMessage = ''; delete this.root.dataset.dungeonRender;
      this.root.dataset.route = r.route; this.root.dataset.stage = r.stage;
      this.root.innerHTML = r.stage === 'play' ? ({ corn: cornMarkup, broadcast: broadcastMarkup, flood: floodMarkup, dungeon: dungeonMarkup }[r.route])(game) : sceneMarkup(game);
      if (hadFocus) this.root.querySelector('#rogue-title')?.focus({ preventScroll: true });
    }
    this.root.classList.toggle('rogue-is-paused', paused);
    this.root.querySelectorAll('button').forEach(button => { button.disabled = paused; });
    if (r.stage !== 'play') return;
    if (r.route === 'dungeon') { renderDungeon(this.root, game, paused); return; }
    const q = selector => this.root.querySelector(selector);
    q('#rogue-health').textContent = r.route === 'corn' ? `${3 - r.hits} / 3` : r.route === 'broadcast' ? `${r.locks} / 3 locked` : `${3 - r.hits} seals left`;
    q('.rogue-condition').classList.toggle('rogue-critical', r.hits >= 2);
    const message = r.message || (r.route === 'corn' ? 'The guard above has your rifle.' : r.route === 'broadcast' ? 'Listen for the space between voices.' : 'The pumps are still feeding the roots.');
    if (message !== this.lastMessage) { q('#rogue-message').textContent = message; this.lastMessage = message; }
    if (r.route === 'corn') this.renderCorn(game, q);
    if (r.route === 'broadcast') this.renderBroadcast(game, q, paused);
    if (r.route === 'flood') this.renderFlood(game, q);
  }

  renderCorn(game, q) {
    const r = game.rogue, hazards = cornHazards(game), layer = q('#rogue-bullets'), road = trafficCrossing(r);
    q('.rogue-eyebrow').textContent = `${road ? 'THE ROAD' : 'SPECIMEN 04'} / CROSSING ${(r.crossing || 0) + 1} OF 3`;
    const visible = new Set();
    hazards.forEach((hazard, index) => {
      const id = hazard.id ?? `${hazard.kind}-${index}`;
      visible.add(id);
      let node = this.hazardNodes.get(id);
      if (!node) {
        node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        node.setAttribute('class', `rogue-hazard rogue-${hazard.kind}`);
        // The viewBox matches the solid body, not the transparent padding or
        // muzzle trail. Overflow lets the non-colliding trail remain visible.
        node.innerHTML = hazard.kind === 'car'
          ? `<svg viewBox="52 99 1678 677" preserveAspectRatio="none" overflow="visible"><image href="./assets/rogue-car.png" width="1774" height="887"/></svg>`
          : `<svg viewBox="1115 235 995 242" preserveAspectRatio="none" overflow="visible"><image href="./assets/rogue-bullet.png" width="2172" height="724"/></svg>`;
        layer.append(node); this.hazardNodes.set(id, node);
      }
      node.setAttribute('transform', `translate(${hazard.x} ${hazard.y}) scale(${hazard.direction} 1)`);
      const art = node.querySelector('svg');
      art.setAttribute('x', -hazard.width / 2); art.setAttribute('y', -hazard.height / 2);
      art.setAttribute('width', hazard.width); art.setAttribute('height', hazard.height);
    });
    for (const [id, node] of this.hazardNodes) if (!visible.has(id)) { node.remove(); this.hazardNodes.delete(id); }
    q('#rogue-corn').setAttribute('transform', `translate(${r.x} ${r.y})`);
    q('#rogue-corn').classList.toggle('rogue-immune', r.immuneUntil > r.time);
    const description = `You are corn. Crossing ${(r.crossing || 0) + 1} of 3. Column ${r.x + 1} of 11, ${r.y === 0 ? road ? 'at the far shoulder' : 'at the crossing' : r.y === 4 ? road ? 'in the safe median' : 'in the safe ditch' : r.y === 8 ? road ? 'on the near shoulder' : 'in the safe starting rows' : `${road ? 'traffic' : 'firing'} lane ${r.y}`}. ${3 - r.hits} husk layers left.`;
    if (q('#rogue-crossing').getAttribute('aria-label') !== description) q('#rogue-crossing').setAttribute('aria-label', description);
  }

  renderBroadcast(game, q, paused) {
    const r = game.rogue, cursor = broadcastCursor(game), window = broadcastWindow(game), inBand = cursor >= window.min && cursor <= window.max;
    q('#rogue-signal-window').style.left = `${window.min * 100}%`;
    q('#rogue-signal-window').style.width = `${(window.max - window.min) * 100}%`;
    q('#rogue-signal-needle').style.left = `${cursor * 100}%`;
    q('.rogue-radio-console').classList.toggle('rogue-in-band', inBand);
    this.root.querySelectorAll('[data-band]').forEach((band, i) => {
      band.classList.toggle('locked', i < r.locks);
      band.classList.toggle('current', i === r.locks);
    });
    q('.rogue-lock').disabled = paused;
    q('.rogue-lock').setAttribute('aria-disabled', String(paused || r.lockReadyAt > r.time));
    q('.rogue-lock').setAttribute('aria-label', `Lock signal. ${r.locks} of 3 bands locked. ${r.hits} of 3 missed locks.`);
  }

  renderFlood(game, q) {
    const connection = floodConnections(game), directions = ['north', 'east', 'south', 'west'];
    connection.tiles.forEach(tile => {
      const button = q(`[data-value="tile-${tile.index}"]`), ends = [[50, 0], [100, 50], [50, 100], [0, 50]];
      const path = tile.ports.map(port => `M50 50L${ends[port].join(' ')}`).join('');
      button.querySelectorAll('path').forEach(part => { if (part.getAttribute('d') !== path) part.setAttribute('d', path); });
      button.classList.toggle('wet', tile.wet);
      const label = `Pipe ${tile.index + 1}, row ${Math.floor(tile.index / 3) + 1}, column ${tile.index % 3 + 1}. Opens ${tile.ports.map(port => directions[port]).join(' and ')}. ${tile.wet ? 'Connected to pump.' : 'Dry.'} Rotate clockwise.`;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    });
    q('.rogue-plumbing').classList.toggle('rogue-connected', connection.connected);
    q('.rogue-release').classList.toggle('rogue-ready', connection.connected);
  }
}
