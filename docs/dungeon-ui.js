import { dungeonView } from './dungeon.js';

const icons = {
  guard: '<ellipse cx="20" cy="35" rx="10" ry="3" fill="#0b1510"/><path d="M15 26L13 35H18L20 28L23 35H28L25 25" fill="#7d8067" stroke="#aab096"/><path d="M13 15L26 14L28 27L14 28Z" fill="#879270" stroke="#bec4a0"/><path d="M13 17L8 25L12 27L18 20M25 17L30 22" fill="none" stroke="#aab38b" stroke-width="4"/><circle cx="20" cy="10" r="5" fill="#cfbe96"/><path d="M14 8Q15 2 22 4L26 9H13" fill="#68765c" stroke="#aeb995"/><path d="M14 29L29 15L31 17L18 31Z" fill="#443e2e" stroke="#c2b48b"/><path d="M29 16L34 11" stroke="#d1c8ab" stroke-width="2.5"/>',
  root: '<path d="M10 31L15 24L12 18L17 10L22 7L29 14L27 23L33 31M15 24L9 25L6 30M27 23L33 23L35 28M17 29L16 35M24 28L26 35" fill="none" stroke="#aa9676" stroke-width="2.5"/><path d="M17 12Q24 7 28 15L25 23L16 22Z" fill="#645e46" stroke="#b7a37e"/><path d="M18 16L21 17M24 16L26 14" stroke="#efbc78" stroke-width="2"/>',
  key: '<circle cx="15" cy="16" r="6" fill="none" stroke="#dfc278" stroke-width="2.5"/><path d="M19 20L29 30M24 25L28 21M27 28L31 24" stroke="#dfc278" stroke-width="3"/>',
  medkit: '<path d="M10 13H30V31H10Z" fill="#7d8b66" stroke="#d0d5b3" stroke-width="1.5"/><path d="M16 13V9H24V13" fill="none" stroke="#aab894" stroke-width="2"/><path d="M20 17V27M15 22H25" stroke="#e7e1c0" stroke-width="3"/>',
  ammo: '<path d="M10 12H30V30H10Z" fill="#5e6549" stroke="#b0b68b"/><path d="M10 17H30M16 11V31M24 11V31" stroke="#808c62"/><path d="M18 20V26H22V20L20 17Z" fill="#ddc275"/>',
  stairs: '<path d="M8 12H17V18H24V24H31V31H8Z" fill="#293b2d" stroke="#a1b58a" stroke-width="1.5"/><path d="M10 31V25H17V19H24V13H31" fill="none" stroke="#d5c588" stroke-width="2"/>'
};

const symbol = (kind, x, y, extra = '') => `<g transform="translate(${x * 40} ${y * 40})" ${extra}>${icons[kind]}</g>`;

export function dungeonMarkup() {
  return `<div class="dungeon-game">
    <h2 id="rogue-title" class="sr-only" tabindex="-1">Dungeon Crawler Corn</h2>
    <header class="dungeon-hud"><span id="dungeon-floor"></span><div class="dungeon-vitals"><span id="dungeon-health" role="img"></span><span id="dungeon-key" role="img"><svg viewBox="0 0 40 40" aria-hidden="true">${icons.key}</svg></span><span id="dungeon-ammo"></span></div></header>
    <div class="dungeon-map-wrap"><svg id="dungeon-map" viewBox="0 0 520 440" role="img" aria-label="Dungeon map"></svg></div>
    <p id="rogue-message" class="dungeon-message" role="status" aria-live="polite" aria-atomic="true"></p>
    <footer class="dungeon-inputs"><div class="rogue-dpad" role="group" aria-label="Move or attack"><button class="rogue-up" data-action="rogue-move" data-value="0,-1" aria-label="Move or attack north">↑</button><button class="rogue-left" data-action="rogue-move" data-value="-1,0" aria-label="Move or attack west">←</button><button class="rogue-down" data-action="rogue-move" data-value="0,1" aria-label="Move or attack south">↓</button><button class="rogue-right" data-action="rogue-move" data-value="1,0" aria-label="Move or attack east">→</button></div><div class="dungeon-abilities"><button class="primary" id="dungeon-fire" data-action="rogue-choice" data-value="fire">Fire</button><button class="secondary" id="dungeon-reload" data-action="rogue-choice" data-value="reload">Reload</button><button class="secondary" data-action="rogue-choice" data-value="wait">Wait</button></div><button class="dungeon-help-button quiet" data-action="dungeon-help" aria-label="Dungeon help">?</button></footer>
  </div>`;
}

export function renderDungeon(root, game, paused) {
  const view = dungeonView(game);
  if (!view) return;
  const q = selector => root.querySelector(selector);
  q('#dungeon-fire').disabled = paused || view.rounds === 0 || !view.target;
  q('#dungeon-reload').disabled = paused || view.rounds === 6 || view.reserve === 0;
  const renderKey = `${game.runId}:${view.floor}:${view.turn}:${view.hp}:${view.rounds}:${view.reserve}:${view.key}:${view.message}`;
  if (root.dataset.dungeonRender === renderKey) return;
  root.dataset.dungeonRender = renderKey;
  q('#dungeon-floor').textContent = `${view.floorName} · ${view.floor}/3`;
  q('#dungeon-health').textContent = `Exposure ${view.exposure}%`;
  q('#dungeon-health').setAttribute('aria-label', `Exposure ${view.exposure}%`);
  q('#dungeon-health').classList.toggle('critical', view.exposure >= 80);
  q('#dungeon-key').classList.toggle('found', view.key);
  q('#dungeon-key').setAttribute('aria-label', view.key ? 'Brass key found' : 'Find the brass key');
  q('#dungeon-ammo').innerHTML = `<svg viewBox="0 0 10 24" aria-hidden="true"><path d="M2 22V7L5 1L8 7V22Z" fill="currentColor"/></svg>${view.rounds}<small>/ 6 · ${view.reserve}</small>`;
  q('#dungeon-ammo').setAttribute('aria-label', `Rifle ${view.rounds} of 6 loaded, ${view.reserve} spare rounds`);
  const message = view.message.replace(/ A red square will be struck next turn\./g, '');
  q('#rogue-message').textContent = /^(Water taps|Find the brass key|You hold still|Your rifle)/.test(message) ? '' : message;
  const tiles = view.tiles.map(tile => {
    const { x, y, kind, seen, visible } = tile;
    if (!seen) return `<rect x="${x * 40}" y="${y * 40}" width="40" height="40" fill="#111b16"/>`;
    const wall = kind === 'wall';
    return `<g opacity="${visible ? 1 : .38}"><rect x="${x * 40}" y="${y * 40}" width="40" height="40" fill="${wall ? '#3a4434' : (x + y) % 2 ? '#233124' : '#263527'}"/>${wall ? `<path d="M${x * 40} ${y * 40 + 1}h40M${x * 40 + 1} ${y * 40}v40" stroke="#626b4b" stroke-opacity=".5"/><path d="M${x * 40 + 5} ${y * 40 + 20}h30m-16 0v16" stroke="#1d2b20"/>` : `<path d="M${x * 40 + 4} ${y * 40 + 35}h7M${x * 40 + 30} ${y * 40 + 9}h3" stroke="#8e9c70" stroke-opacity=".18"/>`}${kind === 'stairs' ? symbol('stairs', x, y) : ''}</g>`;
  }).join('');
  const threats = view.threats.map(({ x, y }) => `<g class="dungeon-threat"><rect x="${x * 40 + 2}" y="${y * 40 + 2}" width="36" height="36" fill="#b7764c" fill-opacity=".3" stroke="#e1a485" stroke-dasharray="4 3"/><path d="M${x * 40 + 13} ${y * 40 + 13}l14 14m0-14l-14 14" stroke="#e1a485" stroke-width="2"/></g>`).join('');
  const items = view.items.map(item => symbol(item.kind, item.x, item.y)).join('');
  const enemies = view.enemies.map(enemy => symbol('root', enemy.x, enemy.y, `class="dungeon-root"`) + `<g fill="${enemy.intent ? '#e1a485' : '#a8b58c'}">${Array.from({ length: enemy.hp }, (_, i) => `<rect x="${enemy.x * 40 + 14 + i * 7}" y="${enemy.y * 40 + 2}" width="5" height="3"/>`).join('')}</g>`).join('');
  const { x, y } = view.player;
  const target = view.target ? `<g transform="translate(${view.target.x * 40} ${view.target.y * 40})" fill="none" stroke="#efe1ad" stroke-width="1.5"><circle cx="20" cy="20" r="15"/><path d="M20 1V9M20 31V39M1 20H9M31 20H39"/></g>` : '';
  const steps = [[0,-1],[-1,0],[0,1],[1,0]].filter(([dx,dy]) => view.tiles.some(t=>t.x===x+dx&&t.y===y+dy&&t.kind!=='wall')).map(([dx,dy])=>`<rect x="${(x+dx)*40}" y="${(y+dy)*40}" width="40" height="40" fill="transparent" class="dungeon-step" data-action="rogue-move" data-value="${dx},${dy}"/>`).join('');
  q('#dungeon-map').innerHTML = `<defs><radialGradient id="dungeon-lantern"><stop stop-color="#d8bb7b" stop-opacity=".15"/><stop offset="1" stop-color="#d8bb7b" stop-opacity="0"/></radialGradient></defs>${tiles}<circle cx="${x * 40 + 20}" cy="${y * 40 + 20}" r="125" fill="url(#dungeon-lantern)"/>${items}${threats}${enemies}<rect x="${x * 40 + 2}" y="${y * 40 + 2}" width="36" height="36" rx="8" fill="#b4be7a" fill-opacity=".14" stroke="#e2ce8f" stroke-opacity=".65"/>${symbol('guard', x, y)}${target}${steps}`;
  const nearby = view.enemies.map(enemy => `root at column ${enemy.x + 1}, row ${enemy.y + 1}, ${enemy.hp} health`).join('; ');
  const warnings = view.threats.map(t => `column ${t.x + 1}, row ${t.y + 1}`).join('; ');
  q('#dungeon-map').setAttribute('aria-label', `Floor ${view.floor}: ${view.floorName}. You are at column ${x + 1}, row ${y + 1}. Exposure ${view.exposure}%. Rifle ${view.rounds} loaded, ${view.reserve} spare. ${nearby || 'No roots in sight.'} ${warnings ? `Next strikes: ${warnings}.` : 'No strikes marked.'} ${view.target ? `Aiming at root in column ${view.target.x + 1}, row ${view.target.y + 1}.` : 'No clear rifle target.'}`);
}
