import { createDungeon, moveDungeon, chooseDungeon, validDungeon, migrateDungeon } from './dungeon.js';
import { getDungeonDebriefScene, validDungeonDebrief } from './dungeon-debrief.js';

// Deliberately broken protocol: self-contained simulations, safe to save mid-step.
const ROUTES = ['corn', 'broadcast', 'flood', 'dungeon'];
const NEW_ENDINGS = ['corn_escape', 'corn_uprising', 'radio_ghost', 'field_voice', 'flood', 'corn_contained', 'roadkill', 'dungeon_escape', 'dungeon_lost'];
const RESULT = {
  corn: ['corn_escape', 'corn_uprising', 'assimilation', 'corn_contained', 'roadkill'],
  broadcast: ['radio_ghost', 'field_voice', 'assimilation'],
  flood: ['flood', 'breach'],
  dungeon: ['dungeon_escape', 'dungeon_lost']
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
  const atDrain = s.player.x === 7 && s.player.y === 5 && s.inspected.includes('drain');
  const atPump = s.player.x === 3 && s.player.y === 3 && s.inspected.includes('pump');
  const lantern = s.fieldEvents?.flags.includes('lantern');
  return [
    { id: 'corn', label: 'Stop resisting the field.', detail: s.exposure >= 70 ? '100 exposure.' : 'The roots are waiting. Requires 70 exposure.', disabled: !idle || s.exposure < 70 },
    { id: 'broadcast', label: 'Transmit on every frequency.', detail: 'Something beneath the static knows your voice.', disabled: !idle },
    { id: 'flood', label: 'Reverse the treatment pumps.', detail: atPump ? 'The pipes run both ways.' : 'Return to the pump house after inspecting it.', disabled: !idle || !atPump },
    { id: 'dungeon', label: 'Climb into the drainage channel.', detail: !lantern ? 'Too dark without a lantern.' : atDrain ? 'Your lantern reveals stairs beneath the waterline.' : 'Bring your lantern to the drainage channel and inspect it.', disabled: !idle || !atDrain || !lantern }
  ];
}

function clearField(s) {
  s.targets = [];
  s.compulsionNotice = false;
  s.fieldEvents.pending = null;
  s.fieldEvents.journey = null;
}

function record(s, choice, question, answer, details = {}) {
  // Repeatedly opening and backing out of the menu never adds testimony.
  if (s.reports.length >= 200) {
    const protectedReceipt = report => s.rogue.route === 'dungeon' && report.rogueRoute === 'dungeon' && (report.choice === 'begin' || report.dungeonDebriefIndex !== undefined);
    let prior = s.reports.findIndex(report => report.kind === 'rogue' && !protectedReceipt(report));
    if (prior < 0) prior = s.reports.findIndex(report => !protectedReceipt(report));
    s.reports.splice(prior < 0 ? 0 : prior, 1);
  }
  s.reports.push({ kind: 'rogue', shift: s.shift, rogueRoute: s.rogue.route, choice, question, answer, ...details });
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
    Object.assign(s.rogue, { x: 5, y: 8, crossing: 0, patternVersion: 2, lastHit: null, refuge: 8, moveReadyAt: 0, immuneUntil: 0 });
  } else if (route === 'broadcast') {
    Object.assign(s.rogue, { locks: 0, lockReadyAt: 0 });
  } else if (route === 'dungeon') {
    s.rogue.dungeon = createDungeon();
    s.rogue.debrief = { version: 1, answers: [] };
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
  if (r.stage === 'debrief' && r.route === 'dungeon') return getDungeonDebriefScene(s);
  if (r.stage === 'intro') {
    if (r.route === 'corn') return {
      title: 'How long were you out?',
      text: 'Your exposure reached 100. You wake between the rows, not knowing how long you were out. Your fingers have split into leaves. You feel an overwhelming urge to escape.',
      options: [{ id: 'begin', label: 'Run for the road.' }, { id: 'root', label: 'Stay. Put down roots.', detail: 'End this assignment here.' }]
    };
    if (r.route === 'broadcast') return {
      title: 'Hold the transmit switch.',
      text: 'Every radio in the field answers with your breathing. Three carrier signals slide through the receiver. Somewhere beneath the static, your voice is asking to be let out.',
      options: [{ id: 'begin', label: 'Open every channel.', detail: 'This ends your assignment.' }, { id: 'back', label: 'Release the switch. Return to the map.' }]
    };
    if (r.route === 'dungeon') return {
      title: 'Dungeon Crawler Corn',
      text: 'By the light of the lantern you took from the field, steps appear beneath the waterline. Beyond them, three locked floors lie between you and a breath of outside air. You sling your rifle and hold the lantern over the first step. Down here, nothing moves until you do.',
      options: [{ id: 'begin', label: 'Raise the lantern. Enter the dungeon.', detail: 'This ends your assignment. Keep your rifle and remaining ammunition. Find each brass key, then the stairs.' }, { id: 'back', label: 'Leave the drain. Return to the map.' }]
    };
    return {
      title: 'Give it all back.',
      text: 'Under the pump house, the treatment pipes converge on a valve with no handle. The roots lend you one. Every pipe is warm. The field has been drinking from this room for years.',
      options: [{ id: 'begin', label: 'Open the sluice cabinet.', detail: 'This ends your assignment.' }, { id: 'back', label: 'Leave the pipes alone. Return to the map.' }]
    };
  }
  if (r.stage === 'choice' && r.route === 'corn') return {
    title: 'The fence is behind you.',
    text: r.patternVersion === 2 ? 'Beyond the road, the soil is soft and unclaimed. Across the road, the gate is still shut. Behind it every row waits for you.' : 'Beyond the road, the soil is soft and unclaimed. Behind you, every row has turned toward the gate. The latch is within reach of the leaves that used to be your hand.',
    options: [{ id: 'escape', label: 'Keep moving. Find new soil.' }, { id: 'gate', label: r.patternVersion === 2 ? 'Go back. Open the gate for everyone.' : 'Open the gate for everyone.' }]
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
    if (r.route === 'dungeon') s.reload = 0;
    r.message = r.route === 'corn' ? (r.patternVersion === 2 ? "The guard has your rifle and switched it to full auto. Bet you didn't know you could do that, huh?" : 'The guard has your rifle.') : r.route === 'broadcast' ? 'Your breathing answers from every receiver.' : r.route === 'dungeon' ? 'Find the brass key, then the stairs. Red squares show where roots will strike next turn.' : 'The pipes are warm beneath your hands.';
    return true;
  }
  if (r.stage === 'debrief' && r.route === 'dungeon') {
    const scene = getDungeonDebriefScene(s), option = scene?.options.find(option => option.id === id);
    if (!option) return false;
    record(s, id, scene.prompt, option.label, { dungeonDebriefIndex: scene.index, supervisorReply: option.reply, replySpeaker: 'SUPERVISOR' });
    r.debrief.answers.push(id);
    r.message = option.reply;
    if (r.debrief.answers.length === scene.total) end(s, 'dungeon_escape', 'surface', option.label);
    return true;
  }
  if (r.stage === 'choice') {
    const option = getRogueScene(s)?.options.find(option => option.id === id);
    if (!option) return false;
    end(s, { escape: 'corn_escape', gate: 'corn_uprising', warn: 'radio_ghost', command: 'field_voice' }[id], id, option.label);
    return true;
  }
  if (r.stage !== 'play') return false;
  if (r.route === 'dungeon') {
    const changed = chooseDungeon(s, id);
    if (changed) finishDungeon(s);
    return changed;
  }
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

function legacyCornBullets(s) {
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

// Coordinates and dimensions use board cells, including fractional lane positions.
// IDs remain stable as a volley crosses the board, so rendering needs no random state.
export function cornHazards(s) {
  const r = s.rogue;
  if (!r || r.route !== 'corn') return [];
  if ((r.patternVersion ?? 1) === 1) return legacyCornBullets(s).map((bullet, i) => ({ ...bullet, id: `legacy-${i}`, kind: 'bullet', width: .52, height: .12 }));
  const hazards = [];
  for (const [lane, row] of LANES.entries()) {
    const direction = lane % 2 ? -1 : 1;
    if (r.crossing === 2) {
      const period = lane % 2 ? 17 : 15;
      const width = [1.4, 1.8, 2.2, 1.6, 2, 1.5][lane];
      const speed = [1.45, 2, 1.65, 2.15, 1.5, 1.85][lane] * (s.mode === 'hard' ? 1.16 : 1);
      const offsets = lane % 2 ? [0, 5.7, 11.4] : [0, 7.5];
      for (const [index, offset] of offsets.entries()) {
        const progress = mod(r.time * speed + lane * 2.11 + offset, period);
        const x = direction > 0 ? progress - 2 : 12 - progress;
        if (x + width / 2 >= -.5 && x - width / 2 <= 10.5) hazards.push({ id: `traffic-${lane}-${index}`, x, y: row, direction, kind: 'car', width, height: .64 });
      }
    } else {
      // Tight groups alternate with wide gaps; the second field adds a fourth round.
      const count = r.crossing === 0 ? 3 : 4;
      const period = r.crossing === 0 ? 13.5 : 15;
      const speed = (3.1 + lane % 3 * .28) * (1 + r.crossing * .12) * (s.mode === 'hard' ? 1.16 : 1);
      for (let group = 0; group < 2; group++) for (let shot = 0; shot < count; shot++) {
        const progress = mod(r.time * speed + lane * 1.73 + group * period / 2 + shot * .84 + r.crossing * 2.4, period);
        const x = direction > 0 ? progress - 1.5 : 11.5 - progress;
        const y = row + Math.sin(progress * .72 + lane + shot * .4) * .22;
        if (x >= -.6 && x <= 10.6) hazards.push({ id: `volley-${r.crossing}-${lane}-${group}-${shot}`, x, y, direction, kind: 'bullet', width: .46, height: .12 });
      }
    }
  }
  return hazards;
}

// Retained for callers interested only in rifle rounds (the road contains none).
export function cornBullets(s) {
  return cornHazards(s).filter(hazard => hazard.kind === 'bullet').map(({ x, y, direction }) => ({ x, y, direction }));
}

function checkCorn(s) {
  const r = s.rogue;
  if (r.time < r.immuneUntil || [0, 4, 8].includes(r.y)) return;
  const hazard = cornHazards(s).find(hazard => r.patternVersion === 1
    ? hazard.y === r.y && Math.abs(hazard.x - r.x) < .46
    : Math.abs(hazard.x - r.x) < hazard.width / 2 + .2 && Math.abs(hazard.y - r.y) < hazard.height / 2 + .2);
  if (!hazard) return;
  r.hits++;
  r.lastHit = hazard.kind;
  if (r.hits === 3) {
    const ending = r.patternVersion === 2 ? (hazard.kind === 'car' ? 'roadkill' : 'corn_contained') : 'assimilation';
    end(s, ending, 'rooted', hazard.kind === 'car' ? 'The headlights found me. I could not cross the road.' : 'The rifle found me. I could not keep moving.');
    return;
  }
  r.x = 5; r.y = r.refuge; r.immuneUntil = r.time + 1.25; r.moveReadyAt = r.time + .20;
  r.message = hazard.kind === 'car' ? 'A wheel tears through the husk.' : 'A layer of husk tears away.';
}

function finishDungeon(s) {
  const status = s.rogue.dungeon.status;
  if (status === 'escaped') {
    s.rogue.stage = 'debrief';
    s.rogue.debrief ??= { version: 1, answers: [] };
    s.rogue.message = 'You reach the surface. The supervisor is waiting for your report.';
  }
  else if (status === 'lost') {
    if (s.practice) { s.rogue.dungeon.hp = 0; end(s, 'dungeon_lost', 'lost', 'Exposure reached 100 beneath the roots.'); return; }
    delete s.rogue;
    s.phase = 'field';
    startRogue(s, 'corn');
  }
}

export function moveRogue(s, dx, dy) {
  const r = s.rogue;
  if (s.phase === 'rogue' && r?.route === 'dungeon' && r.stage === 'play') {
    const changed = moveDungeon(s, dx, dy);
    if (changed) finishDungeon(s);
    return changed;
  }
  if (s.phase !== 'rogue' || r?.route !== 'corn' || r.stage !== 'play' || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1 || r.time < r.moveReadyAt) return false;
  const x = r.x + dx, y = r.y + dy;
  if (x < 0 || x > 10 || y < 0 || y > 8) return false;
  r.x = x; r.y = y; r.moveReadyAt = r.time + .20;
  if (y === 4) { r.refuge = 4; r.message = r.patternVersion === 2 && r.crossing === 2 ? 'The median grass bends around you.' : 'The ditch smells like warm soil.'; }
  if (y === 0) {
    if (r.crossing === 2) r.stage = 'choice';
    else {
      r.crossing++;
      r.x = 5; r.y = 8; r.refuge = 8; r.immuneUntil = r.time + .9;
      r.message = r.crossing === 1 ? 'Another fence. Another rifle. The road is farther than it looked.' : r.patternVersion === 2 ? 'The rifle falls silent. Headlights sweep the road.' : 'The last fence. Beyond it, no rows at all.';
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
  if (s.phase !== 'rogue' || !r || r.stage !== 'play' || ['flood', 'dungeon'].includes(r.route) || !Number.isFinite(dt) || dt <= 0) return;
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
  if (!r || typeof r !== 'object' || Array.isArray(r) || !ROUTES.includes(r.route) || !['intro', 'play', 'choice', 'debrief', 'done'].includes(r.stage)) return false;
  // Early preview saves had one crossing. Preserve an already-earned finale.
  if (r.route === 'corn' && r.crossing === undefined) r.crossing = r.stage === 'choice' || ['corn_escape', 'corn_uprising'].includes(r.outcome) ? 2 : 0;
  // Do not replace live published volleys with a new pattern during an update.
  if (r.route === 'corn' && r.patternVersion === undefined) {
    r.patternVersion = 1;
    if (r.lastHit === undefined) r.lastHit = r.hits > 0 ? 'bullet' : null;
  }
  const keys = ['route', 'stage', 'time', 'hits', 'message', 'outcome', ...(r.route === 'corn' ? ['x', 'y', 'crossing', 'patternVersion', 'lastHit', 'refuge', 'moveReadyAt', 'immuneUntil'] : r.route === 'broadcast' ? ['locks', 'lockReadyAt'] : r.route === 'dungeon' ? ['dungeon', 'debrief'] : ['tiles', 'turns'])];
  if (Object.keys(r).some(key => !keys.includes(key)) || !finite(r.time, 0, MAX_TIME) || !integer(r.hits, 0, 3) || typeof r.message !== 'string' || r.message.length > 300) return false;
  if (s.targets.length || s.fieldEvents.pending || s.fieldEvents.journey || s.compulsionNotice) return false;
  if (r.stage === 'done') {
    if (s.phase !== 'ending' || r.outcome !== s.ending || !RESULT[r.route].includes(r.outcome)) return false;
  } else if (s.phase !== 'rogue' || r.outcome !== null || s.ending !== null || r.hits === 3) return false;
  if (r.stage === 'intro' && (r.time !== 0 || r.hits !== 0)) return false;
  const matchesReport = (report, choice) => report?.kind === 'rogue' && report.shift === s.shift && report.rogueRoute === r.route && report.choice === choice && typeof report.question === 'string' && typeof report.answer === 'string';
  if (r.stage === 'debrief' && r.route !== 'dungeon') return false;
  const dungeonInterview = r.route === 'dungeon' && r.debrief !== undefined && (r.stage === 'debrief' || r.stage === 'done' && r.outcome === 'dungeon_escape');
  if (r.stage !== 'intro' && !dungeonInterview) {
    const rootedWithoutRunning = r.route === 'corn' && r.outcome === 'assimilation' && r.hits === 0;
    if (r.stage === 'done') {
      const choice = rootedWithoutRunning ? 'root' : ({ corn_escape: 'escape', corn_uprising: 'gate', corn_contained: 'rooted', roadkill: 'rooted', radio_ghost: 'warn', field_voice: 'command', flood: 'release', breach: 'rupture', dungeon_escape: 'surface', dungeon_lost: 'lost' }[r.outcome] || (r.route === 'corn' ? 'rooted' : 'signal-lost'));
      if (!matchesReport(s.reports.at(-1), choice) || !rootedWithoutRunning && !matchesReport(s.reports.at(-2), 'begin')) return false;
    } else if (!matchesReport(s.reports.at(-1), 'begin')) return false;
  }
  if (r.route === 'corn') {
    if (s.exposure !== 100 || !integer(r.x, 0, 10) || !integer(r.y, 0, 8) || !integer(r.crossing, 0, 2) || ![4, 8].includes(r.refuge) || !finite(r.moveReadyAt, 0, r.time + .200001) || !finite(r.immuneUntil, 0, r.time + 1.250001)) return false;
    if (![1, 2].includes(r.patternVersion) || ![null, 'bullet', 'car'].includes(r.lastHit) || (r.hits === 0 ? r.lastHit !== null : r.lastHit === null) || r.lastHit === 'car' && (r.patternVersion !== 2 || r.crossing !== 2)) return false;
    if (r.stage === 'intro' && (r.x !== 5 || r.y !== 8 || r.crossing !== 0 || r.refuge !== 8 || r.moveReadyAt || r.immuneUntil)) return false;
    if (r.refuge === 8 && r.y <= 4 || r.stage === 'play' && r.y === 0) return false;
    if (r.stage === 'choice' && (r.y !== 0 || r.refuge !== 4 || r.crossing !== 2)) return false;
    if (['corn_escape', 'corn_uprising'].includes(r.outcome) && (r.y !== 0 || r.refuge !== 4 || r.crossing !== 2 || r.hits === 3)) return false;
    if (['corn_contained', 'roadkill'].includes(r.outcome) && (r.patternVersion !== 2 || r.hits !== 3 || [0, 4, 8].includes(r.y) || r.lastHit !== (r.outcome === 'roadkill' ? 'car' : 'bullet'))) return false;
    if (r.outcome === 'corn_contained' && r.crossing === 2) return false;
    if (r.outcome === 'assimilation' && r.hits !== 3 && (r.hits !== 0 || r.time !== 0 || r.x !== 5 || r.y !== 8 || r.crossing !== 0 || r.refuge !== 8)) return false;
  } else if (r.route === 'broadcast') {
    if (!integer(r.locks, 0, 3) || !finite(r.lockReadyAt, 0, r.time + .350001)) return false;
    if (r.stage === 'intro' && (r.locks || r.lockReadyAt)) return false;
    if ((r.stage === 'choice' || ['radio_ghost', 'field_voice'].includes(r.outcome)) && (r.locks !== 3 || r.hits === 3)) return false;
    if (r.stage === 'play' && r.locks === 3 || r.outcome === 'assimilation' && (r.hits !== 3 || r.locks === 3)) return false;
  } else if (r.route === 'dungeon') {
    if (r.hits !== 0 || r.time !== 0 || !integer(s.rounds, 0, 6) || !integer(s.reserve, 0, Number.MAX_SAFE_INTEGER) || !migrateDungeon(s) || !validDungeon(r.dungeon, r.stage, r.outcome)) return false;
    if (r.debrief === undefined) {
      if (r.stage === 'debrief' || s.reports.some(report => report.dungeonDebriefIndex !== undefined)) return false;
      // Existing completed outcomes remain complete. Every resumed live crawl
      // receives the new interview when it reaches the surface.
      if (r.stage !== 'done') r.debrief = { version: 1, answers: [] };
    }
    if (r.debrief !== undefined && !validDungeonDebrief(s)) return false;
  } else {
    if (!Array.isArray(r.tiles) || r.tiles.length !== 9 || !r.tiles.every(tile => integer(tile, 0, 3)) || !integer(r.turns, 0, 1000000) || r.time !== 0 || r.stage === 'choice') return false;
    if (r.stage === 'intro' && r.turns !== 0 || r.outcome === 'flood' && (r.hits === 3 || !floodConnections(s).connected) || r.outcome === 'breach' && (r.hits !== 3 || floodConnections(s).connected)) return false;
  }
  return true;
}
