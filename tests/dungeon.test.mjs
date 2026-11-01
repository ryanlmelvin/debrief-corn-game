import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, restore, serialize, getEnding, ENDINGS } from '../docs/engine.js';
import { startRogue, chooseRogue, moveRogue, rogueOptions, getRogueScene } from '../docs/rogue.js';
import { dungeonView } from '../docs/dungeon.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';

const WIN = 'RRRFRDDRRUURRFRRDDDDDDDDRRFRRDDRRDDFFRRRRDDLLRRDDRRRFADDRRFUURRRRRDDDDDDDD';
const DIRECTIONS = { U:[0,-1], R:[1,0], D:[0,1], L:[-1,0] };
function field(mode = 'story') {
  const s = createGame(mode, 42);
  Object.assign(s, { phase: 'field', entered: true, departure: 'chosen', player: { x:7, y:5 } });
  s.inspected.push('drain');
  return s;
}
function start(mode) { const s = field(mode); assert.equal(startRogue(s,'dungeon'),true); return s; }
function begin(mode) { const s = start(mode); assert.equal(chooseRogue(s,'begin'),true); return s; }
function step(s, action) { assert.equal(action === 'F' ? chooseRogue(s,'fire') : action === 'A' ? chooseRogue(s,'reload') : action === 'W' ? chooseRogue(s,'wait') : moveRogue(s,...DIRECTIONS[action]),true,`action ${action}`); }
function replay(s, actions) { for (const action of actions) step(s,action); return s; }
function roundTrip(s) { const copy = restore(serialize(s)); assert.ok(copy,'crawler save must restore'); assert.deepEqual(copy,s); return copy; }
function walkTo(s, target) {
  const view = dungeonView(s), queue = [{...view.player,path:[]}], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (point.x === target.x && point.y === target.y) return replay(s,point.path);
    for (const [action,[dx,dy]] of Object.entries(DIRECTIONS)) {
      const x = point.x+dx, y = point.y+dy, key = `${x},${y}`;
      if (seen.has(key) || !view.tiles.some(t => t.x === x && t.y === y && t.kind === 'floor')) continue;
      seen.add(key);queue.push({x,y,path:[...point.path,action]});
    }
  }
  assert.fail('target must be reachable');
}

test('dungeon entry requires an inspected drain and leaves the player free to back out', () => {
  const s = field(), before = structuredClone(s);
  s.inspected = [];
  assert.equal(startRogue(s,'dungeon'),false);
  s.inspected.push('drain');s.player.x--;
  assert.equal(startRogue(s,'dungeon'),false);
  s.player.x++;
  assert.equal(rogueOptions(s).find(o=>o.id==='dungeon').disabled,false);
  assert.equal(startRogue(s,'dungeon'),true);
  assert.equal(getRogueScene(s).title,'Dungeon Crawler Corn');
  roundTrip(s);
  assert.equal(chooseRogue(s,'back'),true);
  assert.deepEqual(s,before,'backtracking does not consume exposure, RNG, or testimony');
});

for (const mode of ['story','hard']) test(`all three dungeon floors can be escaped in ${mode} through real actions and saves`, () => {
  let s = begin(mode), floors = new Set([s.rogue.dungeon.floor]);
  for (const action of WIN) {
    step(s,action);
    s = roundTrip(s);
    floors.add(s.rogue.dungeon.floor);
  }
  assert.deepEqual([...floors],[0,1,2]);
  assert.equal(s.ending,'dungeon_escape');
  assert.equal(s.rogue.dungeon.hp,6);
  assert.equal(s.rounds,5);assert.equal(s.reserve,18);assert.equal(s.shots,7);
  assert.equal(s.reports.length,2);
  assert.equal(getEnding(s).title,ENDINGS.dungeon_escape.title);
  const snapshot = serialize(s);
  stepAfterEnding(s);
  assert.equal(serialize(s),snapshot);
});
function stepAfterEnding(s) {
  assert.equal(moveRogue(s,0,-1),false);
  assert.equal(chooseRogue(s,'wait'),false);
  assert.equal(chooseRogue(s,'fire'),false);
  assert.equal(chooseRogue(s,'reload'),false);
  advance(s,10);
}

test('enemy strikes are telegraphed and stepping away evades the saved target', () => {
  let s = begin();
  replay(s,'WWW');s=roundTrip(s);
  assert.deepEqual(dungeonView(s).threats,[{x:1,y:1}]);
  assert.equal(s.rogue.dungeon.hp,6);
  step(s,'R');
  assert.equal(s.rogue.dungeon.hp,6,'root strikes the old square');
  assert.deepEqual(dungeonView(s).threats,[]);
  roundTrip(s);
});

test('staying in a marked square can lose the dungeon and records its own ending', () => {
  let s = begin();
  for (let turn=0; turn<14; turn++) { step(s,'W');s=roundTrip(s); }
  assert.equal(s.ending,'dungeon_lost');
  assert.equal(s.rogue.dungeon.hp,0);
  assert.equal(s.rogue.dungeon.turn,14);
  assert.equal(getEnding(s).code,'24');
  assert.equal(s.reports.at(-1).choice,'lost');
});

test('rifle-butt attacks break roots and firing cancels a telegraphed strike', () => {
  const s = begin();
  replay(s,'WWWW');
  assert.equal(s.rogue.dungeon.hp,5);
  step(s,'D');
  assert.equal(s.rogue.dungeon.enemies[0].hp,1);
  assert.deepEqual(dungeonView(s).threats,[{x:1,y:1}]);
  step(s,'D');
  assert.equal(s.rogue.dungeon.enemies[0].hp,0);
  assert.equal(s.rogue.dungeon.kills,1);
  assert.equal(s.rogue.dungeon.hp,5,'a broken root cannot finish its attack');
  assert.equal(s.rounds,6,'rifle-butt attacks conserve ammunition');
  const rifle = begin();replay(rifle,'WWWF');
  assert.equal(rifle.rogue.dungeon.hp,6);
  assert.equal(rifle.rounds,5);
  assert.equal(rifle.reserve,24);
  assert.equal(rifle.rogue.dungeon.kills,1);
  roundTrip(rifle);
});

test('rifle keeps the watch ammunition, requires a clear target, and spends one round per shot', () => {
  const s = field();s.rounds=2;s.reserve=3;
  assert.equal(startRogue(s,'dungeon'),true);assert.equal(chooseRogue(s,'begin'),true);
  assert.equal(dungeonView(s).rounds,2);assert.equal(dungeonView(s).reserve,3);
  const before=serialize(s);
  assert.equal(dungeonView(s).target,null,'nearby root is behind solid brickwork');
  assert.equal(chooseRogue(s,'fire'),false);
  assert.equal(serialize(s),before,'blocked targeting does not spend ammunition or a turn');
  step(s,'W');
  assert.equal(dungeonView(s).target,null,'diagonal fire cannot cut the corner of a wall');
  step(s,'W');
  const target=dungeonView(s).target;
  assert.deepEqual(target,{id:42,x:1,y:3});
  assert.ok(dungeonView(s).enemies.some(e=>e.id===target.id),'a target must be visible');
  step(s,'F');
  assert.equal(s.rounds,1);assert.equal(s.reserve,3);assert.equal(s.shots,1);
  assert.equal(s.rogue.dungeon.enemies.find(e=>e.id===target.id).hp,0);
  assert.equal(s.rogue.dungeon.turn,3);
  assert.equal(dungeonView(s).target,null,'the other root is outside sight range');
  roundTrip(s);
});

test('reload draws only from reserve and gives a marked root its turn', () => {
  const s=field();s.rounds=1;s.reserve=2;
  startRogue(s,'dungeon');chooseRogue(s,'begin');replay(s,'WWW');
  step(s,'A');
  assert.equal(s.rounds,3);assert.equal(s.reserve,0);assert.equal(s.rogue.dungeon.turn,4);
  assert.equal(s.rogue.dungeon.hp,5,'reloading in the marked square permits the strike');
  const after=serialize(s);
  assert.equal(chooseRogue(s,'reload'),false);
  assert.equal(serialize(s),after,'empty reserve cannot create ammunition or spend another turn');
  roundTrip(s);
  const empty=field();empty.rounds=0;empty.reserve=0;
  startRogue(empty,'dungeon');chooseRogue(empty,'begin');replay(empty,'WWW');
  const snapshot=serialize(empty);
  assert.ok(dungeonView(empty).target);
  assert.equal(chooseRogue(empty,'fire'),false);
  assert.equal(serialize(empty),snapshot,'an empty rifle cannot fire at a visible target');
});

test('walls, invalid inputs, and elapsed time do not take turns', () => {
  const s = begin(), before = serialize(s);
  assert.equal(moveRogue(s,-1,0),false);
  assert.equal(moveRogue(s,1,1),false);
  assert.equal(moveRogue(s,0,0),false);
  assert.equal(chooseRogue(s,'back'),false);
  assert.equal(chooseRogue(s,'unknown'),false);
  assert.equal(chooseRogue(s,'burst'),false,'prototype salt controls are unsupported');
  assert.equal(chooseRogue(s,'reload'),false,'a full rifle cannot reload');
  advance(s,1000);
  assert.equal(serialize(s),before);
});

test('locked stairs wait for the local key and pickups restore limited supplies once', () => {
  const s = begin();
  // Defeat the two first-floor roots with public actions, then explore freely.
  replay(s,'RRRFRDDRRUURRF');
  walkTo(s,{x:9,y:3});
  walkTo(s,{x:11,y:8});
  assert.equal(s.rogue.dungeon.key,false);
  const turn = s.rogue.dungeon.turn;
  step(s,'D');
  assert.equal(s.rogue.dungeon.floor,0);
  assert.equal(s.rogue.dungeon.turn,turn);
  assert.match(s.rogue.message,/locked/);
  walkTo(s,{x:6,y:9});
  assert.equal(s.reserve,30,'an ammunition cache adds six reserve rounds');
  step(s,'A');step(s,'L');step(s,'R');
  assert.equal(s.reserve,28,'revisiting a cache cannot collect its ammunition twice');
  assert.equal(s.rounds,6);
  roundTrip(s);
  const hurt = begin();replay(hurt,'WWWWWWWWF');
  assert.equal(hurt.rogue.dungeon.hp,3);
  walkTo(hurt,{x:1,y:7});
  assert.equal(hurt.rogue.dungeon.hp,6,'a field dressing restores up to three health');
  roundTrip(hurt);
});

test('view and progress transfer preserve a mid-turn crawl without changing random state', async () => {
  const s = begin();replay(s,'WWW');
  const before = serialize(s), rng = s.rng;
  const view = dungeonView(s);
  view.enemies[0].intent.x = 99;view.player.x=99;view.tiles[0].kind='floor';
  assert.equal(serialize(s),before,'view data is detached from simulation state');
  assert.equal(s.rng,rng);
  const snapshot = progressSnapshot(s,{collected:[],runs:[]});
  const decoded = await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(decoded.save,s);
});

test('restoration rejects malformed crawler states and forged outcomes', () => {
  const s = begin();
  for (const mutate of [
    d=>d.hp=7, d=>d.hp=-1, d=>d.version=3, d=>d.floor=3, d=>d.x=0,
    d=>d.key=true, d=>d.collected.push(999), d=>d.enemies[0].intent={x:11,y:9},
    d=>d.enemies[0].hp=3, d=>d.enemies.push({...d.enemies[0]}), d=>d.status='escaped'
  ]) { const copy=structuredClone(s);mutate(copy.rogue.dungeon);assert.equal(restore(serialize(copy)),null); }
  const forged=structuredClone(s);forged.phase='ending';forged.ending='dungeon_escape';forged.rogue.stage='done';forged.rogue.outcome='dungeon_escape';
  assert.equal(restore(serialize(forged)),null);
});


test('local version-one saves keep the crawl and actual rifle ammunition during migration', () => {
  for (const actions of ['', 'WWW', WIN, 'WWWWWWWWWWWWWW']) {
    const s=actions ? begin() : start();
    if(actions)replay(s,actions);
    const expected=structuredClone(s);
    s.rogue.dungeon.version=1;s.rogue.dungeon.salt=2;
    if(s.rogue.stage==='intro')s.rogue.dungeon.salt=3;
    s.rogue.message='Old prototype equipment.';
    const migrated=restore(serialize(s));
    assert.ok(migrated);
    assert.deepEqual(migrated.rogue.dungeon,expected.rogue.dungeon,'position, health, turns, pickups, and enemy intent survive');
    assert.equal(migrated.rounds,expected.rounds);assert.equal(migrated.reserve,expected.reserve);
    assert.match(migrated.rogue.message,/rifle/);
    assert.deepEqual(migrated.reports,expected.reports);
    roundTrip(migrated);
  }
  const invalid=begin();invalid.rogue.dungeon.version=1;invalid.rogue.dungeon.salt=4;
  assert.equal(restore(serialize(invalid)),null,'invalid legacy resources do not bypass validation');
});
