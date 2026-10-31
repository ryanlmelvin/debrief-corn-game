// Deliberately broken protocol: self-contained simulations, safe to save mid-step.
const ROUTES = ['corn', 'broadcast', 'flood'];
const NEW_ENDINGS = ['corn_escape', 'corn_uprising', 'radio_ghost', 'field_voice', 'flood'];
const RESULT = {
  corn: ['corn_escape', 'corn_uprising', 'assimilation'],
  broadcast: ['radio_ghost', 'field_voice', 'assimilation'],
  flood: ['flood', 'breach']
};
const LANES = [1, 2, 3, 5, 6, 7];
const PIPE_KINDS = ['elbow', 'straight', 'elbow', 'elbow', 'elbow', 'elbow', 'straight', 'elbow', 'straight'];
const MAX_TIME = 10000000;
const mod = (n, d) => ((n % d) + d) % d;
const finite = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n, lo, hi) => Number.isInteger(n) && finite(n, lo, hi);
const idleField = s => s.phase === 'field' && !s.fieldEvents?.pending && !s.expedition?.active;

export function rogueOptions(s) {
  const idle = idleField(s);
  const atPump = s.player.x === 3 && s.player.y === 3 && s.inspected.includes('pump');
  return [
    { id: 'corn', label: 'Stop resisting the field.', detail: s.exposure >= 70 ? '100 exposure. No way back.' : 'The roots are waiting. Requires 70 exposure.', disabled: !idle || s.exposure < 70 },
    { id: 'broadcast', label: 'Transmit on every frequency.', detail: 'Something beneath the static knows your voice.', disabled: !idle },
    { id: 'flood', label: 'Reverse the treatment pumps.', detail: atPump ? 'The pipes run both ways.' : 'Return to the pump house after inspecting it.', disabled: !idle || !atPump }
  ];
}

function clearField(s) {
  s.targets = [];
  s.compulsionNotice = false;
  s.fieldEvents.pending = null;
  s.fieldEvents.journey = null;
}

function record(s, choice, question, answer) {
  // Repeatedly opening and backing out of the menu never adds testimony.
  if (s.reports.length >= 200) {
    const prior = s.reports.findIndex(r => r.kind === 'rogue');
    s.reports.splice(prior < 0 ? 0 : prior, 1);
  }
  s.reports.push({ kind: 'rogue', shift: s.shift, rogueRoute: s.rogue.route, choice, question, answer });
}

export function startRogue(s, route) {
  if (!ROUTES.includes(route) || s.rogue !== undefined || s.phase !== 'field') return false;
  const forced = route === 'corn' && s.exposure >= 100;
  if (!forced && rogueOptions(s).find(option => option.id === route)?.disabled) return false;
  clearField(s);
  s.phase = 'rogue';
  s.rogue = { route, stage: 'intro', time: 0, hits: 0, message: '', outcome: null };
  if (route === 'corn') {
    s.exposure = 100;
    Object.assign(s.rogue, { x: 5, y: 8, crossing: 0, refuge: 8, moveReadyAt: 0, immuneUntil: 0 });
  } else if (route === 'broadcast') {
    Object.assign(s.rogue, { locks: 0, lockReadyAt: 0 });
  } else {
    let seed = (s.rng ^ 0x51a1ce) >>> 0;
    const tiles = PIPE_KINDS.map(() => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed >>> 30; });
    Object.assign(s.rogue, { tiles, turns: 0 });
    if (floodConnections(s).connected) s.rogue.tiles[3] = (s.rogue.tiles[3] + 1) % 4;
  }
  return true;
}

export function getRogueScene(s) {
  const r = s.rogue;
  if (s.phase !== 'rogue' || !r) return null;
  if (r.stage === 'intro') {
    if (r.route === 'corn') return {
      title: 'You are the movement.',
      text: 'Your fingers split into leaves. Above the rows, a familiar rifle turns toward you. This time, you are what tries to escape.',
      options: [{ id: 'begin', label: 'Run for the road.' }, { id: 'root', label: 'Stay. Put down roots.', detail: 'End this assignment here.' }]
    };
    if (r.route === 'broadcast') return {
      title: 'Hold the transmit switch.',
      text: 'Every radio in the field answers with your breathing. Three carrier signals slide through the receiver. Somewhere beneath the static, your voice is asking to be let out.',
      options: [{ id: 'begin', label: 'Open every channel.', detail: 'This ends your assignment.' }, { id: 'back', label: 'Release the switch. Return to the map.' }]
    };
    return {
      title: 'Give it all back.',
      text: 'Under the pump house, the treatment pipes converge on a valve with no handle. The roots lend you one. Every pipe is warm. The field has been drinking from this room for years.',
      options: [{ id: 'begin', label: 'Open the sluice cabinet.', detail: 'This ends your assignment.' }, { id: 'back', label: 'Leave the pipes alone. Return to the map.' }]
    };
  }
  if (r.stage === 'choice' && r.route === 'corn') return {
    title: 'The fence is behind you.',
    text: 'Beyond the road, the soil is soft and unclaimed. Behind you, every row has turned toward the gate. The latch is within reach of the leaves that used to be your hand.',
    options: [{ id: 'escape', label: 'Keep moving. Find new soil.' }, { id: 'gate', label: 'Open the gate for everyone.' }]
  };
  if (r.stage === 'choice' && r.route === 'broadcast') return {
    title: 'All stations, go ahead.',
    text: 'Every needle holds still. The tower, the recovery team, the radios beneath the soil: all of them are listening. You have time for one instruction. Then you will have all the time in the world to repeat it.',
    options: [{ id: 'warn', label: '“Leave the field. All of you.”' }, { id: 'command', label: '“The perimeter no longer applies.”' }]
  };
  return null;
}

function end(s, ending, choice, answer) {
  record(s, choice, 'What happened after you broke protocol?', answer);
  s.rogue.stage = 'done';
  s.rogue.outcome = ending;
  s.phase = 'ending';
  s.ending = ending;
  clearField(s);
}

export function chooseRogue(s, id) {
  const r = s.rogue;
  if (s.phase !== 'rogue' || !r) return false;
  if (r.stage === 'intro') {
    const scene = getRogueScene(s), option = scene.options.find(option => option.id === id);
    if (!option) return false;
    if (id === 'back') { delete s.rogue; s.phase = 'field'; return true; }
    if (id === 'root') { end(s, 'assimilation', id, option.label); return true; }
    record(s, id, scene.title, option.label);
    r.stage = 'play';
    r.message = r.route === 'corn' ? 'The guard has your rifle.' : r.route === 'broadcast' ? 'Your breathing answers from every receiver.' : 'The pipes are warm beneath your hands.';
    return true;
  }
  if (r.stage === 'choice') {
    const option = getRogueScene(s)?.options.find(option => option.id === id);
    if (!option) return false;
    end(s, { escape: 'corn_escape', gate: 'corn_uprising', warn: 'radio_ghost', command: 'field_voice' }[id], id, option.label);
    return true;
  }
  if (r.stage !== 'play') return false;
  if (r.route === 'broadcast' && id === 'lock') {
    if (r.time < r.lockReadyAt) return false;
    r.lockReadyAt = r.time + .35;
    const cursor = broadcastCursor(s), window = broadcastWindow(s);
    if (cursor >= window.min && cursor <= window.max) {
      r.locks++;
      r.message = `${r.locks} of 3 carriers locked. The field is listening.`;
      if (r.locks === 3) r.stage = 'choice';
    } else {
      r.hits++;
      r.message = `The signal bites back. ${3 - r.hits} missed locks remain.`;
      if (r.hits === 3) end(s, 'assimilation', 'signal-lost', 'The field learned my voice before I could use it.');
    }
    return true;
  }
  if (r.route === 'flood' && /^tile-[0-8]$/.test(id)) {
    const index = Number(id.slice(5));
    r.tiles[index] = (r.tiles[index] + 1) % 4;
    r.turns = Math.min(1000000, r.turns + 1);
    r.message = floodConnections(s).connected ? 'The pressure reaches the field outlet.' : 'The pressure moves beneath your hands.';
    return true;
  }
  if (r.route === 'flood' && id === 'release') {
    if (floodConnections(s).connected) end(s, 'flood', id, 'I joined the pipes and sent the treatment back into the field.');
    else {
      r.hits++;
      r.message = `A disconnected pipe shudders. ${3 - r.hits} releases remain.`;
      if (r.hits === 3) end(s, 'breach', 'rupture', 'The pressure tore through the perimeter before the outlet was connected.');
    }
    return true;
  }
  return false;
}

export function cornBullets(s) {
  const r = s.rogue;
  if (!r || r.route !== 'corn') return [];
  const bullets = [];
  for (const [index, y] of LANES.entries()) {
    const direction = index % 2 ? -1 : 1;
    const speed = (2.5 + (index % 3) * .35) * (s.mode === 'hard' ? 1.2 : 1) * (1 + r.crossing * .12);
    for (let i = 0; i < 2; i++) {
      const progress = mod(r.time * speed + index * 1.61 + i * 6.5 + r.crossing * 2.4, 13);
      const x = direction > 0 ? progress - 1 : 11 - progress;
      if (x >= -.8 && x <= 10.8) bullets.push({ x, y, direction });
    }
  }
  return bullets;
}

function checkCorn(s) {
  const r = s.rogue;
  if (r.time < r.immuneUntil || !cornBullets(s).some(bullet => bullet.y === r.y && Math.abs(bullet.x - r.x) < .46)) return;
  r.hits++;
  if (r.hits === 3) { end(s, 'assimilation', 'rooted', 'The rifle found me. I could not keep moving.'); return; }
  r.x = 5; r.y = r.refuge; r.immuneUntil = r.time + 1.25; r.moveReadyAt = r.time + .20;
  r.message = `A layer of husk tears away. ${3 - r.hits} left. Back to cover.`;
}

export function moveRogue(s, dx, dy) {
  const r = s.rogue;
  if (s.phase !== 'rogue' || r?.route !== 'corn' || r.stage !== 'play' || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1 || r.time < r.moveReadyAt) return false;
  const x = r.x + dx, y = r.y + dy;
  if (x < 0 || x > 10 || y < 0 || y > 8) return false;
  r.x = x; r.y = y; r.moveReadyAt = r.time + .20;
  if (y === 4) { r.refuge = 4; r.message = 'Halfway. The ditch hides you. Wait for a gap.'; }
  if (y === 0) {
    if (r.crossing === 2) r.stage = 'choice';
    else {
      r.crossing++;
      r.x = 5; r.y = 8; r.refuge = 8; r.immuneUntil = r.time + .9;
      r.message = r.crossing === 1 ? 'Another fence. Another rifle. The road is farther than it looked.' : 'The last fence. Beyond it, no rows at all.';
    }
    return true;
  }
  checkCorn(s);
  return true;
}

export function broadcastCursor(s) {
  const r = s.rogue;
  if (!r || r.route !== 'broadcast') return 0;
  const cycle = mod(r.time * (.5 + r.locks * .08) + r.locks * .27, 2);
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function broadcastWindow(s) {
  const locks = s.rogue?.route === 'broadcast' ? s.rogue.locks : 0;
  const half = .15 - locks * .025;
  return { min: .5 - half, max: .5 + half };
}

export function floodConnections(s) {
  const r = s.rogue;
  if (!r || r.route !== 'flood') return { tiles: [], connected: false };
  const tiles = r.tiles.map((rotation, index) => ({ index, kind: PIPE_KINDS[index], rotation,
    ports: (PIPE_KINDS[index] === 'elbow' ? [0, 1] : [0, 2]).map(port => (port + rotation) % 4), wet: false }));
  const queue = tiles[3].ports.includes(3) ? [3] : [];
  const delta = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  while (queue.length) {
    const index = queue.shift(), tile = tiles[index];
    if (tile.wet) continue;
    tile.wet = true;
    for (const port of tile.ports) {
      const x = index % 3 + delta[port][0], y = Math.floor(index / 3) + delta[port][1];
      if (x < 0 || x > 2 || y < 0 || y > 2) continue;
      const next = y * 3 + x;
      if (tiles[next].ports.includes((port + 2) % 4) && !tiles[next].wet) queue.push(next);
    }
  }
  return { tiles, connected: tiles[5].wet && tiles[5].ports.includes(1) };
}

export function advanceRogue(s, dt) {
  const r = s.rogue;
  if (s.phase !== 'rogue' || !r || r.stage !== 'play' || r.route === 'flood' || !Number.isFinite(dt) || dt <= 0) return;
  // Bound frame catch-up, and subdivide to prevent a bullet skipping the player.
  let left = Math.min(dt, 1);
  while (left > 0 && s.phase === 'rogue' && r.stage === 'play') {
    const step = Math.min(left, 1 / 60);
    left -= step;
    r.time = Math.min(MAX_TIME, r.time + step);
    if (r.route === 'corn') checkCorn(s);
  }
}

export function validRogue(s) {
  const r = s.rogue;
  if (r === undefined) return s.phase !== 'rogue' && !NEW_ENDINGS.includes(s.ending);
  if (!r || typeof r !== 'object' || Array.isArray(r) || !ROUTES.includes(r.route) || !['intro', 'play', 'choice', 'done'].includes(r.stage)) return false;
  // Early preview saves had one crossing. Preserve an already-earned finale.
  if (r.route === 'corn' && r.crossing === undefined) r.crossing = r.stage === 'choice' || ['corn_escape', 'corn_uprising'].includes(r.outcome) ? 2 : 0;
  const keys = ['route', 'stage', 'time', 'hits', 'message', 'outcome', ...(r.route === 'corn' ? ['x', 'y', 'crossing', 'refuge', 'moveReadyAt', 'immuneUntil'] : r.route === 'broadcast' ? ['locks', 'lockReadyAt'] : ['tiles', 'turns'])];
  if (Object.keys(r).some(key => !keys.includes(key)) || !finite(r.time, 0, MAX_TIME) || !integer(r.hits, 0, 3) || typeof r.message !== 'string' || r.message.length > 300) return false;
  if (s.targets.length || s.fieldEvents.pending || s.fieldEvents.journey || s.compulsionNotice) return false;
  if (r.stage === 'done') {
    if (s.phase !== 'ending' || r.outcome !== s.ending || !RESULT[r.route].includes(r.outcome)) return false;
  } else if (s.phase !== 'rogue' || r.outcome !== null || s.ending !== null || r.hits === 3) return false;
  if (r.stage === 'intro' && (r.time !== 0 || r.hits !== 0)) return false;
  const matchesReport = (report, choice) => report?.kind === 'rogue' && report.shift === s.shift && report.rogueRoute === r.route && report.choice === choice && typeof report.question === 'string' && typeof report.answer === 'string';
  if (r.stage !== 'intro') {
    const rootedWithoutRunning = r.route === 'corn' && r.outcome === 'assimilation' && r.hits === 0;
    if (r.stage === 'done') {
      const choice = rootedWithoutRunning ? 'root' : ({ corn_escape: 'escape', corn_uprising: 'gate', radio_ghost: 'warn', field_voice: 'command', flood: 'release', breach: 'rupture' }[r.outcome] || (r.route === 'corn' ? 'rooted' : 'signal-lost'));
      if (!matchesReport(s.reports.at(-1), choice) || !rootedWithoutRunning && !matchesReport(s.reports.at(-2), 'begin')) return false;
    } else if (!matchesReport(s.reports.at(-1), 'begin')) return false;
  }
  if (r.route === 'corn') {
    if (s.exposure !== 100 || !integer(r.x, 0, 10) || !integer(r.y, 0, 8) || !integer(r.crossing, 0, 2) || ![4, 8].includes(r.refuge) || !finite(r.moveReadyAt, 0, r.time + .200001) || !finite(r.immuneUntil, 0, r.time + 1.250001)) return false;
    if (r.stage === 'intro' && (r.x !== 5 || r.y !== 8 || r.crossing !== 0 || r.refuge !== 8 || r.moveReadyAt || r.immuneUntil)) return false;
    if (r.refuge === 8 && r.y <= 4 || r.stage === 'play' && r.y === 0) return false;
    if (r.stage === 'choice' && (r.y !== 0 || r.refuge !== 4 || r.crossing !== 2)) return false;
    if (['corn_escape', 'corn_uprising'].includes(r.outcome) && (r.y !== 0 || r.refuge !== 4 || r.crossing !== 2 || r.hits === 3)) return false;
    if (r.outcome === 'assimilation' && r.hits !== 3 && (r.hits !== 0 || r.time !== 0 || r.x !== 5 || r.y !== 8 || r.crossing !== 0 || r.refuge !== 8)) return false;
  } else if (r.route === 'broadcast') {
    if (!integer(r.locks, 0, 3) || !finite(r.lockReadyAt, 0, r.time + .350001)) return false;
    if (r.stage === 'intro' && (r.locks || r.lockReadyAt)) return false;
    if ((r.stage === 'choice' || ['radio_ghost', 'field_voice'].includes(r.outcome)) && (r.locks !== 3 || r.hits === 3)) return false;
    if (r.stage === 'play' && r.locks === 3 || r.outcome === 'assimilation' && (r.hits !== 3 || r.locks === 3)) return false;
  } else {
    if (!Array.isArray(r.tiles) || r.tiles.length !== 9 || !r.tiles.every(tile => integer(tile, 0, 3)) || !integer(r.turns, 0, 1000000) || r.time !== 0 || r.stage === 'choice') return false;
    if (r.stage === 'intro' && r.turns !== 0 || r.outcome === 'flood' && (r.hits === 3 || !floodConnections(s).connected) || r.outcome === 'breach' && (r.hits !== 3 || floodConnections(s).connected)) return false;
  }
  return true;
}
