// A turn advances only after an intentional, valid action. These authored rooms
// and all enemy intent are saved explicitly; the crawler never consumes RNG.
const FLOORS = [
  { name: 'The culvert', rows: [
    '#############',
    '#@....#....K#',
    '#.##..#.#...#',
    '#..R....#...#',
    '#.###.###.#.#',
    '#...#...R.#.#',
    '###.#.#.#.#.#',
    '#H..#.#...#.#',
    '#.###.###.#.#',
    '#.....S....>#',
    '#############'
  ] },
  { name: 'The root cellar', rows: [
    '#############',
    '#@....#..H..#',
    '#.##..#.#.#.#',
    '#...R...#.#.#',
    '#.#.###.#...#',
    '#.#...#...R.#',
    '#.###.#.###.#',
    '#...#...#K..#',
    '#.#.###.#.#.#',
    '#S#.....R..>#',
    '#############'
  ] },
  { name: 'The buried chapel', rows: [
    '#############',
    '#@...#....K.#',
    '#.##.#.###..#',
    '#....R...#..#',
    '###.###..#..#',
    '#H..#...R...#',
    '#.#.#.###.#.#',
    '#.#...#...#.#',
    '#.###.#.#.#.#',
    '#S....R.#..>#',
    '#############'
  ] }
];
const WIDTH = 13, HEIGHT = 11, MAX_TURNS = 1000000;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cellId = (x, y) => y * WIDTH + x;
const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const point = v => v && integer(v.x, 0, WIDTH - 1) && integer(v.y, 0, HEIGHT - 1);
const unique = list => new Set(list).size === list.length;
const allowedKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));

function floorData(floor) {
  const data = FLOORS[floor];
  const items = [], enemies = [];
  let start, stairs;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const mark = data.rows[y][x], id = cellId(x, y);
    if (mark === '@') start = { x, y };
    if (mark === '>') stairs = { x, y };
    if (mark === 'R') enemies.push({ id, x, y, hp: 2, intent: null });
    if ('KHS'.includes(mark)) items.push({ id, x, y, kind: { K: 'key', H: 'medkit', S: 'ammo' }[mark] });
  }
  return { ...data, items, enemies, start, stairs };
}
function walkable(d, x, y) { return integer(x, 0, WIDTH - 1) && integer(y, 0, HEIGHT - 1) && FLOORS[d.floor].rows[y][x] !== '#'; }
// Supercover sight checks every crossed cell. A shot cannot cut diagonally
// between two touching bricks or pass through an intervening wall.
function clearSight(d, targetX, targetY) {
  let x = d.x, y = d.y, ix = 0, iy = 0;
  const nx = Math.abs(targetX - x), ny = Math.abs(targetY - y);
  const sx = Math.sign(targetX - x), sy = Math.sign(targetY - y);
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (!walkable(d, x + sx, y) || !walkable(d, x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (x === targetX && y === targetY) return true;
    if (!walkable(d, x, y)) return false;
  }
  return true;
}
function visible(d, x, y) { return distance(d, { x, y }) <= 4 && clearSight(d, x, y); }
function rifleTarget(d) {
  return d.enemies.filter(e => e.hp && visible(d, e.x, e.y))
    .sort((a,b) => distance(d,a) - distance(d,b) || a.id - b.id)[0] || null;
}
function reveal(d) {
  const seen = new Set(d.seen);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (visible(d, x, y)) seen.add(cellId(x, y));
  d.seen = [...seen].sort((a, b) => a - b);
}
function enterFloor(d) {
  const data = floorData(d.floor);
  Object.assign(d, data.start, { key: false, collected: [], enemies: data.enemies, seen: [] });
  reveal(d);
}
export function createDungeon() {
  const d = { version: 2, floor: 0, x: 1, y: 1, hp: 6, key: false, turn: 0, kills: 0, collected: [], enemies: [], seen: [], status: 'active' };
  enterFloor(d);
  return d;
}

function enemyTurn(d, s) {
  const events = [];
  for (const enemy of d.enemies) {
    if (!enemy.hp) continue;
    if (enemy.intent) {
      if (d.x === enemy.intent.x && d.y === enemy.intent.y) {
        d.hp = Math.max(1, d.hp - 1);
        s.exposure = Math.min(100, s.exposure + 10);
        events.push('A root catches you. Exposure increases by 10%.');
      }
      enemy.intent = null;
      continue;
    }
    if (distance(enemy, d) === 1) {
      enemy.intent = { x: d.x, y: d.y };
      continue;
    }
    if (distance(enemy, d) > 5) continue;
    const moves = [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => ({ x: enemy.x + dx, y: enemy.y + dy }));
    const destination = moves.find(p => walkable(d, p.x, p.y) && distance(p, d) < distance(enemy, d) && distance(p, d) > 0 && !d.enemies.some(other => other !== enemy && other.hp && other.x === p.x && other.y === p.y));
    if (destination) { enemy.x = destination.x; enemy.y = destination.y; }
    if (distance(enemy, d) === 1) enemy.intent = { x: d.x, y: d.y };
  }
  if (s.exposure >= 100) { d.status = 'lost'; events.push('The last light goes out beneath the roots.'); }
  return events;
}

function finishTurn(s, message) {
  const r = s.rogue;
  const d = r.dungeon;
  d.turn = Math.min(MAX_TURNS, d.turn + 1);
  const events = enemyTurn(d, s);
  reveal(d);
  r.message = [message, ...new Set(events)].join(' ');
  if (d.status === 'active' && d.enemies.some(e => e.hp && e.intent)) r.message += ' A red square will be struck next turn.';
}

export function moveDungeon(s, dx, dy) {
  const r = s.rogue, d = r.dungeon;
  if (!d || d.status !== 'active' || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const x = d.x + dx, y = d.y + dy;
  if (!walkable(d, x, y)) return false;
  const data = floorData(d.floor);
  if (data.stairs.x === x && data.stairs.y === y && !d.key) {
    r.message = 'The stair gate is locked. Find the brass key on this floor.';
    return true;
  }
  const enemy = d.enemies.find(e => e.hp && e.x === x && e.y === y);
  if (enemy) {
    enemy.hp--;
    if (!enemy.hp) { d.kills++; enemy.intent = null; }
    finishTurn(s, enemy.hp ? 'You strike the root with the rifle butt. One more hit will break it.' : 'The root unravels into the water.');
    return true;
  }
  d.x = x; d.y = y;
  let message = 'Water taps against the brickwork.';
  const item = data.items.find(item => item.x === x && item.y === y && !d.collected.includes(item.id));
  if (item) {
    d.collected.push(item.id);
    if (item.kind === 'key') { d.key = true; message = 'A brass key. The stair gate on this floor will open.'; }
    if (item.kind === 'medkit') { const reduced = Math.min(30, s.exposure); s.exposure -= reduced; d.hp = 6; message = `A sealed field dressing. Exposure reduced by ${reduced}%.`; }
    if (item.kind === 'ammo') { s.reserve = Math.min(Number.MAX_SAFE_INTEGER, s.reserve + 6); message = 'Six rifle rounds, wrapped in a watch report. Added to your reserve.'; }
  }
  if (data.stairs.x === x && data.stairs.y === y) {
    d.turn = Math.min(MAX_TURNS, d.turn + 1);
    if (d.floor === 2) {
      d.status = 'escaped';
      r.message = 'The last gate opens. For the first time, the wind smells of somewhere else.';
      reveal(d);
    } else {
      d.floor++;
      enterFloor(d);
      r.message = `${FLOORS[d.floor].name}. Another brass key. Another way up.`;
    }
    return true;
  }
  finishTurn(s, message);
  return true;
}

export function chooseDungeon(s, action) {
  const r = s.rogue, d = r.dungeon;
  if (!d || d.status !== 'active') return false;
  if (action === 'wait') { finishTurn(s, 'You hold still and listen.'); return true; }
  if (action === 'reload') {
    if (s.rounds >= 6 || s.reserve <= 0) return false;
    const loaded = Math.min(6 - s.rounds, s.reserve);
    s.rounds += loaded; s.reserve -= loaded; s.reload = 0;
    finishTurn(s, `You load ${loaded} ${loaded === 1 ? 'round' : 'rounds'}. The roots move while you reload.`);
    return true;
  }
  if (action !== 'fire' || s.rounds <= 0) return false;
  const target = rifleTarget(d);
  if (!target) return false;
  s.rounds--; s.shots++;
  target.hp = 0; target.intent = null; d.kills++;
  finishTurn(s, 'The shot breaks the root. The report rolls down the corridor.');
  return true;
}

export function dungeonView(s) {
  const r = s?.rogue, d = r?.route === 'dungeon' && r.dungeon;
  if (!d) return null;
  const data = floorData(d.floor), seen = new Set(d.seen), target = rifleTarget(d);
  const tiles = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) tiles.push({ x, y, kind: data.rows[y][x] === '#' ? 'wall' : data.rows[y][x] === '>' ? 'stairs' : 'floor', seen: seen.has(cellId(x,y)), visible: visible(d,x,y) });
  const enemies = d.enemies.filter(e => e.hp && visible(d,e.x,e.y)).map(e => ({ ...e, intent: e.intent && { ...e.intent } }));
  return { width: WIDTH, height: HEIGHT, floor: d.floor + 1, floorName: data.name, turn: d.turn, hp: d.hp, maxHp: 6, exposure: s.exposure, rounds: s.rounds, reserve: s.reserve, target: target ? {id:target.id,x:target.x,y:target.y} : null, key: d.key, kills: d.kills, player: { x: d.x, y: d.y }, tiles,
    items: data.items.filter(i => !d.collected.includes(i.id) && visible(d,i.x,i.y)).map(i => ({ ...i })), enemies,
    threats: enemies.filter(e => e.intent).map(e => ({ ...e.intent })), message: r.message, status: d.status };
}

export function validDungeon(d, stage, outcome, legacy = false) {
  if (!allowedKeys(d, ['version','floor','x','y','hp','key','turn','kills','collected','enemies','seen','status', ...(legacy ? ['salt'] : [])]) || d.version !== (legacy ? 1 : 2) || !integer(d.floor,0,2) || !point(d) || !walkable(d,d.x,d.y) || !integer(d.hp,0,6) || legacy && !integer(d.salt,0,3) || typeof d.key !== 'boolean' || !integer(d.turn,0,MAX_TURNS) || !integer(d.kills,0,8) || !['active','escaped','lost'].includes(d.status)) return false;
  const data = floorData(d.floor);
  if (!Array.isArray(d.collected) || !unique(d.collected) || !d.collected.every(id => data.items.some(i => i.id === id)) || d.key !== d.collected.includes(data.items.find(i => i.kind === 'key').id)) return false;
  if (!Array.isArray(d.seen) || !unique(d.seen) || !d.seen.every(id => integer(id,0,WIDTH*HEIGHT-1)) || !d.seen.includes(cellId(d.x,d.y))) return false;
  if (!Array.isArray(d.enemies) || d.enemies.length !== data.enemies.length || !unique(d.enemies.map(e => e?.id))) return false;
  for (const e of d.enemies) {
    if (!allowedKeys(e,['id','x','y','hp','intent']) || !data.enemies.some(v => v.id === e.id) || !point(e) || !walkable(d,e.x,e.y) || !integer(e.hp,0,2) || e.hp && e.x === d.x && e.y === d.y) return false;
    if (e.intent !== null && (!e.hp || !allowedKeys(e.intent,['x','y']) || !point(e.intent) || !walkable(d,e.intent.x,e.intent.y) || distance(e,e.intent) !== 1)) return false;
  }
  if (!unique(d.enemies.filter(e => e.hp).map(e => cellId(e.x,e.y)))) return false;
  if (d.kills < d.enemies.filter(e => !e.hp).length) return false;
  if (stage === 'intro') {
    const expected = createDungeon();
    if (legacy) {
      // Earlier local builds used radius-only visibility. Their exact initial
      // reveal differs, but the guard and all gameplay resources remain fresh.
      return d.floor === 0 && d.x === 1 && d.y === 1 && d.hp === 6 && d.salt === 3 && !d.key && d.turn === 0 && d.kills === 0 && !d.collected.length && d.status === 'active' && JSON.stringify(d.enemies) === JSON.stringify(expected.enemies);
    }
    return JSON.stringify(d) === JSON.stringify(expected);
  }
  if (stage === 'play') return d.status === 'active' && d.hp > 0 && !(d.key && d.x === data.stairs.x && d.y === data.stairs.y);
  const escaped = d.status === 'escaped' && d.hp > 0 && d.floor === 2 && d.key && d.x === data.stairs.x && d.y === data.stairs.y;
  if (stage === 'debrief') return escaped && outcome === null;
  if (stage !== 'done') return false;
  if (outcome === 'dungeon_escape') return escaped;
  return outcome === 'dungeon_lost' && d.status === 'lost' && d.hp === 0;
}

// Local prototype saves predate the rifle. Keep the real watch ammunition and
// the entire crawl in place; this migration never grants replacement rounds.
export function migrateDungeon(s) {
  const r = s.rogue, d = r?.dungeon;
  if (d?.version !== 1) return true;
  if (!validDungeon(d, r.stage, r.outcome, true)) return false;
  delete d.salt;
  d.version = 2;
  if (r.stage === 'intro') d.seen = createDungeon().seen;
  r.message = 'Your rifle is ready. Fire at the marked root, reload from reserve, or move to evade its next strike.';
  return true;
}
