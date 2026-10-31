import { rogueOptions, getRogueScene, cornBullets, broadcastCursor, broadcastWindow, floodConnections } from './rogue.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLES = { corn: 'Shoot any that try to escape.', broadcast: 'Everyone is listening.', flood: 'The field drinks first.' };
const LABELS = { corn: 'SPECIMEN 04 / PERIMETER CROSSING', broadcast: 'UNAUTHORIZED TRANSMISSION', flood: 'TREATMENT CONTROL / MANUAL OVERRIDE' };
const CORN = `<g class="rogue-corn-body"><path d="M-.04 .37L-.17 .47M.08 .37L.22 .46" fill="none" stroke="#adb67c" stroke-width=".07" stroke-linecap="round"/><path d="M-.02 .3C-.29 .21-.35-.02-.3-.18C-.12-.07-.02 .09 .03 .26M.07 .3C.31 .17 .37-.05 .34-.22C.14-.09 .08 .06 .04 .25" fill="#7e9560" stroke="#c2c895" stroke-width=".018"/><path d="M-.13 .21C-.23 .03-.19-.26-.06-.39Q.01-.48 .08-.38C.21-.2 .2 .08 .1 .27Z" fill="#d8bb7b" stroke="#eee3b7" stroke-width=".025"/><path d="M-.11-.22H.1M-.14-.13H.14M-.15-.04H.15M-.13 .05H.14M-.1 .14H.11M-.04-.34L-.04 .2M.045-.34L.045 .22" fill="none" stroke="#6c6339" stroke-width=".016"/><path d="M-.12 .28Q-.25 .12-.16-.06L.03 .3Q.24 .12 .19-.08Q.3 .17 .12 .35Z" fill="#879c61" stroke="#c9cc96" stroke-width=".018"/><path d="M-.04-.4L-.13-.53M.01-.42L.03-.56M.07-.4L.15-.51" fill="none" stroke="#ddd1a2" stroke-width=".018"/></g>`;

export function rogueMenuMarkup(game) {
  return `<article class="paper rogue-menu-sheet"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="paper-top"><span>STATION 04</span><span>BREAK PROTOCOL</span></div><h2 id="dialog-title" tabindex="-1">There are other ways out.</h2><p class="rogue-menu-note">The orders did not account for this.</p><section class="choices" aria-label="Ways to break protocol">${rogueOptions(game).map(option => `<button class="choice" data-action="rogue-start" data-value="${escape(option.id)}" ${option.disabled ? 'disabled' : ''}><span>${escape(option.label)}</span><small>${escape(option.detail || '')}</small></button>`).join('')}</section><button class="secondary" data-action="close">Stay on assignment</button></article>`;
}

function sceneMarkup(game) {
  const r = game.rogue, scene = getRogueScene(game);
  if (!scene) return '';
  const art = r.route === 'corn' ? 'field-corner' : r.route === 'broadcast' ? 'encounter-radio' : 'field-pump';
  const customCorn = r.route === 'corn' && r.stage === 'intro';
  return `<div class="rogue-scene"><div class="rogue-scene-art" ${customCorn ? '' : 'aria-hidden="true"'} style="background-image:linear-gradient(0deg,#111b16,transparent 80%),url('./assets/${art}.webp')">${customCorn ? '<img class="rogue-scene-photo" src="./assets/rogue-corn.jpg" alt="Hands turn to roots beneath the watchtower searchlight.">' : ''}</div><article class="rogue-scene-copy"><p class="rogue-eyebrow">${LABELS[r.route]}</p><h2 id="rogue-title" tabindex="-1">${escape(scene.title)}</h2><div class="rogue-scene-text">${scene.text.split('\n\n').map(p => `<p>${escape(p)}</p>`).join('')}</div><div class="rogue-scene-choices">${scene.options.map((option, i) => `<button class="${i === 0 ? 'primary' : 'secondary'}" data-action="rogue-choice" data-value="${escape(option.id)}"><span>${escape(option.label)}</span>${option.detail ? `<small>${escape(option.detail)}</small>` : ''}</button>`).join('')}</div></article></div>`;
}

function head(route) {
  return `<header class="rogue-heading"><div><p class="rogue-eyebrow">${LABELS[route]}</p><h2 id="rogue-title" tabindex="-1">${TITLES[route]}</h2></div><p class="rogue-condition"><span>${route === 'corn' ? 'HUSK' : route === 'broadcast' ? 'SIGNAL' : 'PRESSURE'}</span><b id="rogue-health"></b></p></header>`;
}

function status() { return '<p id="rogue-message" class="rogue-message" role="status" aria-live="polite" aria-atomic="true"></p>'; }

function cornMarkup() {
  const lanes = Array.from({ length: 9 }, (_, y) => {
    const safe = [0, 4, 8].includes(y), direction = (y < 4 ? y % 2 : !(y % 2)) ? '→' : '←';
    return `<g><rect x="-.5" y="${y - .5}" width="11" height="1" fill="${safe ? '#34432d' : y % 2 ? '#1e2a20' : '#253023'}"/><path d="M-.5 ${y + .5}H10.5" stroke="${safe ? '#8f9a68' : '#697255'}" stroke-width=".018" stroke-dasharray="${safe ? '.08 .07' : '.025 .11'}"/>${safe ? `<text x="-.27" y="${y - .11}" class="rogue-lane-label${y === 0 ? ' rogue-exit-label' : ''}">${y === 0 ? 'ROAD / FREEDOM' : y === 4 ? 'DITCH / COVER' : 'THE ROWS / COVER'}</text>` : `<text x="-.29" y="${y + .16}" class="rogue-lane-arrow">${direction}</text><text x="10.08" y="${y + .16}" class="rogue-lane-arrow">${direction}</text>`}</g>`;
  }).join('');
  return `<div class="rogue-game rogue-corn-game">${head('corn')}<div class="rogue-play-layout"><div class="rogue-crossing-wrap"><svg id="rogue-crossing" class="rogue-crossing" viewBox="-.5 -.5 11 9" role="img" aria-label="Corn crossing the firing lanes. Reach the road at the top. The bottom row and middle ditch provide cover.">${lanes}<g class="rogue-grid" stroke="#a8b58c" stroke-opacity=".08" stroke-width=".015">${Array.from({ length: 10 }, (_, x) => `<path d="M${x + .5}-.5V8.5"/>`).join('')}</g><g id="rogue-bullets" aria-hidden="true"></g><g id="rogue-corn" transform="translate(5 8)" aria-hidden="true"><ellipse cy=".4" rx=".36" ry=".1" fill="#0a100c"/><text y="-.64" text-anchor="middle" class="rogue-you">YOU</text>${CORN}</g></svg></div><aside class="rogue-control-panel"><p class="rogue-tip">↑ Through the perimeter · ditch is cover</p>${status()}<div class="rogue-dpad" role="group" aria-label="Move your corn"><button class="rogue-up" data-action="rogue-move" data-value="0,-1" aria-label="Move toward the road">↑</button><button class="rogue-left" data-action="rogue-move" data-value="-1,0" aria-label="Move left">←</button><button class="rogue-down" data-action="rogue-move" data-value="0,1" aria-label="Move back toward the rows">↓</button><button class="rogue-right" data-action="rogue-move" data-value="1,0" aria-label="Move right">→</button></div><p class="rogue-key-hint">ARROWS / WASD</p></aside></div></div>`;
}

function broadcastMarkup() {
  return `<div class="rogue-game rogue-broadcast-game">${head('broadcast')}<div class="rogue-play-layout"><div class="rogue-radio-console"><div class="rogue-radio-face" aria-hidden="true"><span>STATION 04</span><div class="rogue-speaker"></div><span>ALL CHANNELS</span></div><div class="rogue-bands" aria-label="Carrier bands locked">${[0, 1, 2].map(i => `<span data-band="${i}"><i></i>0${i + 1}</span>`).join('')}</div><div class="rogue-dial" role="img" aria-label="Tuning needle. Press Lock signal when the needle is inside the gold band."><div class="rogue-dial-ticks" aria-hidden="true"></div><div id="rogue-signal-window" class="rogue-signal-window"><span>LOCK</span></div><i id="rogue-signal-needle" class="rogue-signal-needle"></i></div><p class="rogue-dial-labels" aria-hidden="true"><span>NOISE</span><span>CARRIER FREQUENCY</span><span>NOISE</span></p></div><aside class="rogue-control-panel"><p class="rogue-tip">Lock in gold.</p>${status()}<button class="primary rogue-lock" data-action="rogue-choice" data-value="lock">Lock signal <kbd>SPACE</kbd></button></aside></div></div>`;
}

function floodMarkup() {
  return `<div class="rogue-game rogue-flood-game">${head('flood')}<div class="rogue-play-layout"><div class="rogue-plumbing"><div class="rogue-pipe-label source">PUMP<span>→</span></div><div class="rogue-pipe-grid" role="group" aria-label="Rotate nine treatment pipes to connect the pump to the field">${Array.from({ length: 9 }, (_, i) => `<button class="rogue-pipe-tile" data-action="rogue-choice" data-value="tile-${i}" aria-label="Rotate pipe ${i + 1} clockwise"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="rogue-pipe-shadow"/><path class="rogue-pipe-line"/><circle cx="50" cy="50" r="8" class="rogue-pipe-joint"/></svg><span class="rogue-pipe-number">${i + 1}</span></button>`).join('')}</div><div class="rogue-pipe-label outlet"><span>→</span>FIELD</div></div><aside class="rogue-control-panel"><p class="rogue-tip">Tap a pipe to turn.</p>${status()}<button class="primary rogue-release" data-action="rogue-choice" data-value="release">Open the sluice ↗</button></aside></div></div>`;
}

/** Keeps live controls mounted so keyboard focus and touch targets never move with the simulation. */
export class RogueUI {
  constructor(root) { this.root = root; this.key = ''; this.bulletCount = -1; this.lastMessage = ''; }

  render(game, paused = false) {
    const active = game?.phase === 'rogue' && game.rogue;
    this.root.hidden = !active;
    if (!active) { this.key = ''; return; }
    const r = game.rogue, key = `${game.runId}:${r.route}:${r.stage}`;
    if (key !== this.key) {
      const hadFocus = !this.key || this.root.contains(document.activeElement);
      this.key = key; this.bulletCount = -1; this.lastMessage = '';
      this.root.dataset.route = r.route; this.root.dataset.stage = r.stage;
      this.root.innerHTML = r.stage === 'play' ? ({ corn: cornMarkup, broadcast: broadcastMarkup, flood: floodMarkup }[r.route])() : sceneMarkup(game);
      if (hadFocus) this.root.querySelector('#rogue-title')?.focus({ preventScroll: true });
    }
    this.root.classList.toggle('rogue-is-paused', paused);
    this.root.querySelectorAll('button').forEach(button => { button.disabled = paused; });
    if (r.stage !== 'play') return;
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
    const r = game.rogue, bullets = cornBullets(game), layer = q('#rogue-bullets');
    q('.rogue-eyebrow').textContent = `SPECIMEN 04 / CROSSING ${(r.crossing || 0) + 1} OF 3`;
    q('.rogue-exit-label').textContent = ['FENCE LINE', 'SERVICE TRACK', 'ROAD / FREEDOM'][r.crossing || 0];
    if (bullets.length !== this.bulletCount) {
      this.bulletCount = bullets.length;
      layer.innerHTML = bullets.map(() => '<g><path d="M-.56 0H.17" stroke="#d49a61" stroke-width=".065"/><path d="M-.05-.075L.26 0L-.05 .075Z" fill="#f2dfad"/></g>').join('');
    }
    bullets.forEach((bullet, i) => layer.children[i].setAttribute('transform', `translate(${bullet.x} ${bullet.y}) scale(${bullet.direction} 1)`));
    q('#rogue-corn').setAttribute('transform', `translate(${r.x} ${r.y})`);
    q('#rogue-corn').classList.toggle('rogue-immune', r.immuneUntil > r.time);
    const description = `You are corn. Crossing ${(r.crossing || 0) + 1} of 3. Column ${r.x + 1} of 11, ${r.y === 0 ? 'at the road' : r.y === 4 ? 'in the safe ditch' : r.y === 8 ? 'in the safe starting rows' : `firing lane ${r.y}`}. ${3 - r.hits} husk layers left. Reach the road at the top.`;
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
