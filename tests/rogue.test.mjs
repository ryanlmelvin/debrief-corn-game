import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, move, restore, serialize, getEnding, ENDINGS } from '../docs/engine.js';
import { rogueOptions, startRogue, chooseRogue, moveRogue, getRogueScene, cornBullets, cornHazards, broadcastCursor, broadcastWindow, floodConnections, validRogue } from '../docs/rogue.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';

function field(mode = 'story') {
  const s = createGame(mode, 42);
  s.phase = 'field'; s.entered = true; s.departure = 'chosen';
  return s;
}
function roundTrip(s) {
  const copy = restore(serialize(s));
  assert.ok(copy, `${s.phase}/${s.rogue?.route}/${s.rogue?.stage} should restore`);
  assert.deepEqual(copy, s);
  return copy;
}
function start(route, mode = 'story') {
  const s = field(mode);
  if (route === 'corn') s.exposure = 100;
  if (route === 'flood') { s.player = { x: 3, y: 3 }; s.inspected.push('pump'); }
  assert.equal(startRogue(s, route), true);
  return roundTrip(s);
}
function begin(route, mode = 'story') {
  const s = start(route, mode);
  assert.equal(chooseRogue(s, 'begin'), true);
  return roundTrip(s);
}
function lockSignal(s) {
  let ticks = 0;
  do {
    advance(s, .01);
    assert.ok(ticks++ < 1000, 'a gold window must remain reachable');
  } while (s.rogue.time < s.rogue.lockReadyAt || broadcastCursor(s) < broadcastWindow(s).min + .01 || broadcastCursor(s) > broadcastWindow(s).max - .01);
  assert.equal(chooseRogue(s, 'lock'), true);
}
function solvePipes(s) {
  // Follow the visible inlet around the top of the cabinet to the outlet.
  for (const [index, rotation] of [[3,3], [0,1], [1,1], [2,2], [5,0]]) {
    while (s.rogue.tiles[index] !== rotation) assert.equal(chooseRogue(s, `tile-${index}`), true);
  }
}
const LEGACY_CORN_PATHS = {
  story: [
    [[0,-1],[0,-1],[1,0],[0,-1],[0,-1],[0,0],[0,-1],[0,-1],[0,-1],[0,-1]],
    [[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[-1,0],[0,-1],[0,-1]],
    [[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[1,0],[0,-1],[0,-1],[0,-1]]
  ],
  hard: [
    [[0,-1],[0,-1],[0,-1],[0,-1],[0,-1],[1,0],[0,-1],[0,-1],[0,-1]],
    [[0,-1],[0,-1],[0,-1],[0,-1],[-1,0],[0,-1],[0,-1],[0,-1],[0,-1]],
    [[0,-1],[0,-1],[0,-1],[0,-1],[-1,0],[0,-1],[0,-1],[0,-1],[0,-1]]
  ]
};

// Search only through public game actions. The planner cannot ignore collisions or
// edit player coordinates, health, immunity, projectile positions, or time.
function findCornRoute(s) {
  const crossing = s.rogue.crossing, hits = s.rogue.hits;
  const queue = [{ game: s, path: [] }], seen = new Set();
  for (let at = 0; at < queue.length; at++) {
    const { game, path } = queue[at];
    if (path.length > 100) break;
    const advanced = { ...game, rogue: { ...game.rogue } };
    advance(advanced, .21);
    if (advanced.rogue.hits !== hits) continue;
    for (const [dx, dy] of [[0,-1],[-1,0],[1,0],[0,0],[0,1]]) {
      const next = { ...advanced, rogue: { ...advanced.rogue } };
      if ((dx || dy) && !moveRogue(next, dx, dy)) continue;
      if (next.rogue.hits !== hits) continue;
      const route = [...path, [dx, dy]];
      if (next.rogue.stage === 'choice' || next.rogue.crossing > crossing) return route;
      const key = `${route.length}:${next.rogue.x}:${next.rogue.y}:${next.rogue.refuge}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ game: next, path: route }); }
    }
  }
  assert.fail(`No safe ${s.mode} route through crossing ${crossing} at ${s.rogue.time}s`);
}

function takeCornRoute(s, path, saves = true) {
  for (const [dx, dy] of path) {
    advance(s, .21);
    if (dx || dy) assert.equal(moveRogue(s, dx, dy), true);
    if (saves) s = roundTrip(s);
  }
  return s;
}

test('reckless opportunities are reachable, location gated, and reject invalid starts', () => {
  const s = field();
  assert.deepEqual(rogueOptions(s).map(o => [o.id, o.disabled]), [['corn',true],['broadcast',false],['flood',true]]);
  assert.equal(startRogue(s, 'corn'), false);
  assert.equal(startRogue(s, 'flood'), false);
  assert.equal(startRogue(s, 'unknown'), false);
  s.exposure = 70;
  assert.equal(rogueOptions(s)[0].disabled, false);
  s.player = { x:3, y:3 }; s.inspected.push('pump');
  assert.equal(rogueOptions(s)[2].disabled, false);
  assert.equal(startRogue(s, 'corn'), true);
  assert.equal(s.exposure, 100);
  assert.equal(startRogue(s, 'broadcast'), false);
  assert.equal(s.phase, 'rogue');
  roundTrip(s);
});

test('100 exposure begins the reversal before another field encounter can open', () => {
  const s = field();
  s.exposure = 99.9;
  assert.equal(move(s, 1, 0), true);
  assert.equal(s.phase, 'rogue'); assert.equal(s.rogue.stage, 'intro');
  assert.equal(s.fieldEvents.pending, null); assert.equal(s.fieldEvents.journey, null);
  assert.equal(s.ending, null);
  const before = serialize(s);
  advance(s, 10); moveRogue(s,0,-1); chooseRogue(s,'escape'); chooseRogue(s,'back');
  assert.equal(serialize(s), before, 'nothing runs behind the introduction');
  assert.equal(chooseRogue(s, 'root'), true);
  assert.equal(s.ending, 'assimilation');
  assert.deepEqual(getEnding(s), ENDINGS.assimilation, 'choosing to root keeps the original ending');
  roundTrip(s);
});

test('voluntary routes can be declined without committing or adding transcript entries', () => {
  for (const route of ['broadcast', 'flood']) {
    const s = start(route), exposure = s.exposure;
    assert.ok(getRogueScene(s).options.some(option => option.id === 'back'));
    assert.equal(chooseRogue(s, 'back'), true);
    assert.equal(s.phase, 'field'); assert.equal(s.rogue, undefined);
    assert.equal(s.exposure, exposure); assert.equal(s.reports.length, 0);
    roundTrip(s);
  }
});

for (const mode of ['story', 'hard']) for (const [choice, ending] of [['escape','corn_escape'], ['gate','corn_uprising']]) {
  test(`corn can complete three ${mode} crossings and choose ${ending}, saving throughout`, () => {
    let s = begin('corn', mode);
    for (let crossing = 0; crossing < 3; crossing++) {
      if (crossing) advance(s, 1); // Verify routes after arrival immunity expires too.
      const path = findCornRoute(s);
      s = takeCornRoute(s, path);
      if (crossing < 2) {
        assert.equal(s.rogue.stage,'play'); assert.equal(s.rogue.crossing,crossing+1);
        assert.equal(s.rogue.x,5); assert.equal(s.rogue.y,8); assert.equal(s.rogue.refuge,8);
        assert.ok(s.rogue.immuneUntil>s.rogue.time);
        assert.equal(chooseRogue(s,choice),false,'the road is still beyond another crossing');
      }
    }
    assert.equal(s.rogue.hits, 0); assert.equal(s.rogue.stage, 'choice'); assert.equal(s.rogue.crossing,2);
    const premature=structuredClone(s);premature.rogue.crossing=1;
    assert.equal(restore(serialize(premature)),null,'a final choice requires all three crossings');
    const before = serialize(s);
    advance(s,1); moveRogue(s,0,1); chooseRogue(s,'command');
    assert.equal(serialize(s), before, 'the finale waits safely for the player');
    assert.equal(chooseRogue(s,choice), true);
    assert.equal(s.ending,ending); assert.ok(getEnding(s).text);
    assert.equal(s.reports.length,2);
    roundTrip(s);
    assert.equal(chooseRogue(s,choice),false);
  });
}

test('corn movement rejects diagonal, non-finite and repeated moves; legacy hits return to cover', () => {
  const s = begin('corn');
  s.rogue.patternVersion = 1;
  assert.equal(moveRogue(s,1,1),false); assert.equal(moveRogue(s,NaN,0),false);
  assert.equal(moveRogue(s,0,-1),true);
  assert.equal(moveRogue(s,0,-1),false);
  // Place the corn where a live projectile is about to pass, then use real simulation.
  s.rogue.x = 0; s.rogue.y = 1;
  advance(s, .5);
  assert.equal(s.rogue.hits,1); assert.equal(s.rogue.y,8);
  assert.ok(s.rogue.immuneUntil > s.rogue.time);
  roundTrip(s);
  const snapshot=serialize(s);
  for(const dt of [0,-1,NaN,Infinity])advance(s,dt);
  assert.equal(serialize(s),snapshot);
  // Reach the ditch and make it the recovery point; a third hit ends the run.
  s.rogue.refuge=4;
  for(let hit=2;hit<=3;hit++) {
    while(s.rogue.time < s.rogue.immuneUntil)advance(s,.1);
    const bullet=cornBullets(s).find(b=>b.x>=0&&b.x<=10);
    s.rogue.x=Math.round(bullet.x);s.rogue.y=bullet.y;
    // A bullet farther than the collision radius will pass the cell within .5s.
    s.rogue.x=bullet.direction===1?Math.ceil(bullet.x):Math.floor(bullet.x);
    advance(s,.5);
    assert.equal(s.rogue.hits,hit);
    if(hit===2)assert.equal(s.rogue.y,4);
    roundTrip(s);
  }
  assert.equal(s.ending,'assimilation');
  const ending=getEnding(s);
  assert.equal(ending.title,ENDINGS.assimilation.title);
  assert.equal(ending.code,ENDINGS.assimilation.code);
  assert.equal(ending.stamp,'SPECIMEN ROOTED');
  assert.match(ending.text,/rifle finds you/);
  assert.deepEqual(getEnding(roundTrip(s)),ending);
});

test('corn keeps its damage between crossings and can wait safely at either refuge', () => {
  let s=begin('corn');
  s.rogue.hits=1;s.rogue.lastHit='bullet';
  s=takeCornRoute(s,findCornRoute(s));
  assert.equal(s.rogue.crossing,1);assert.equal(s.rogue.hits,1);assert.equal(s.rogue.refuge,8);
  s=roundTrip(s);
  for(let tick=0;tick<60;tick++)advance(s,1);
  assert.equal(s.rogue.stage,'play');assert.equal(s.rogue.hits,1);assert.equal(s.rogue.y,8);
  s.rogue.y=4;s.rogue.refuge=4;
  for(let tick=0;tick<60;tick++)advance(s,1);
  assert.equal(s.rogue.stage,'play');assert.equal(s.rogue.hits,1);assert.equal(s.rogue.y,4);
  roundTrip(s);
  const first=structuredClone(s);first.rogue.crossing=0;
  const third=structuredClone(s);third.rogue.crossing=2;
  assert.notDeepEqual(cornBullets(first),cornBullets(s));
  assert.notDeepEqual(cornBullets(s),cornBullets(third));
});

test('early one-crossing preview saves retain progress and earned choices', () => {
  const active=begin('corn');delete active.rogue.crossing;
  assert.equal(restore(serialize(active)).rogue.crossing,0);
  const earned=begin('corn');
  Object.assign(earned.rogue,{stage:'choice',x:5,y:0,refuge:4});delete earned.rogue.crossing;
  assert.equal(restore(serialize(earned)).rogue.crossing,2);
});

test('new corn uses full-auto volleys followed by alternating road traffic, with stable hazard identities', () => {
  const s=begin('corn');
  assert.equal(s.rogue.patternVersion,2);
  assert.equal(s.rogue.message,"The guard has your rifle and switched it to full auto. Bet you didn't know you could do that, huh?");
  for(const crossing of [0,1,2]) {
    s.rogue.crossing=crossing;
    const hazards=cornHazards(s);
    assert.ok(hazards.length >= (crossing===2?8:20));
    assert.equal(new Set(hazards.map(h=>h.id)).size,hazards.length);
    assert.ok(hazards.every(h=>h.kind===(crossing===2?'car':'bullet')));
    assert.deepEqual(new Set(hazards.map(h=>h.direction)),new Set([-1,1]));
    for(const h of hazards) {
      assert.ok(h.width>0 && h.height>0);
      for(const refuge of [0,4,8]) assert.ok(Math.abs(h.y-refuge)>h.height/2+.2,'the entire refuge remains outside every collision box');
    }
    if(crossing<2)assert.ok(hazards.some(h=>!Number.isInteger(h.y)),'rifle rounds have a visible spread within each lane');
    else {
      assert.equal(cornBullets(s).length,0,'cars are never rendered or treated as bullets');
      assert.ok(new Set(hazards.map(h=>h.width)).size>1,'traffic has different vehicle lengths');
      assert.ok(hazards.every(h=>h.width>1 && Number.isInteger(h.y)));
    }
    const later={...s,rogue:{...s.rogue,time:s.rogue.time+.001}};
    const visible=cornHazards(later);
    assert.ok(visible.filter(h=>hazards.some(before=>before.id===h.id)).length>=hazards.length-1);
  }
});

for(const mode of ['story','hard']) {
  test(`all three ${mode} stages remain escapable at varied arrival times without damage`, () => {
    let sideways=0,waits=0;
    for(const delay of [0,1.37,4.2]) {
      let s=begin('corn',mode);
      for(let elapsed=0;elapsed<delay;elapsed+=.01)advance(s,.01);
      for(let crossing=0;crossing<3;crossing++) {
        if(crossing)advance(s,1);
        const path=findCornRoute(s);
        sideways+=path.filter(([dx])=>dx!==0).length;
        waits+=path.filter(([dx,dy])=>dx===0&&dy===0).length;
        s=takeCornRoute(s,path,false);
        assert.equal(s.rogue.hits,0);roundTrip(s);
      }
      assert.equal(s.rogue.stage,'choice');
    }
    assert.ok(sideways>0,'following gaps requires real sideways movement');
    if(mode==='hard')assert.ok(waits>0,'pausing between bursts is a viable part of a safe route');
  });
}

test('published corn saves retain their original positions, volleys and all three earned crossings', () => {
  for(const mode of ['story','hard']) {
    let s=begin('corn',mode);
    delete s.rogue.patternVersion;delete s.rogue.lastHit;
    s=restore(serialize(s));
    assert.equal(s.rogue.patternVersion,1);assert.equal(s.rogue.lastHit,null);
    assert.deepEqual(cornBullets(s)[0],{x:5.5,y:1,direction:1});
    for(const path of LEGACY_CORN_PATHS[mode])s=takeCornRoute(s,path);
    assert.equal(s.rogue.stage,'choice');assert.equal(s.rogue.hits,0);
    assert.ok(cornHazards(s).every(h=>h.kind==='bullet'),'the last old crossing must not suddenly become a road');
    assert.equal(getRogueScene(s).options[1].label,'Open the gate for everyone.');
    assert.equal(chooseRogue(s,'escape'),true);roundTrip(s);
  }
  const hurt=begin('corn');hurt.rogue.hits=1;
  delete hurt.rogue.patternVersion;delete hurt.rogue.lastHit;
  const resumed=restore(serialize(hurt));
  assert.equal(resumed.rogue.lastHit,'bullet');assert.equal(resumed.rogue.hits,1);
});

function collisionMoment(s, y, minDistance, maxDistance) {
  s.rogue.x=5;s.rogue.y=y;s.rogue.refuge=y<4?4:8;
  const startTime=s.rogue.time;
  for(let tick=0;tick<3000;tick++) {
    s.rogue.time=startTime+tick*.01;
    const lane=cornHazards(s).filter(h=>Math.abs(h.y-y)<.3);
    const clearance=Math.min(...lane.map(h=>Math.abs(h.x-5)-h.width/2));
    if(clearance>minDistance&&clearance<maxDistance)return;
  }
  assert.fail('The moving pattern must leave both clear gaps and collidable bodies.');
}

test('fractional bullets and car bodies hit the root core, while close misses leave the large leaves unharmed', () => {
  for(const crossing of [0,1,2])for(const hit of [false,true]) {
    const s=begin('corn');s.rogue.crossing=crossing;
    collisionMoment(s,7,hit?.04:.27,hit?.12:.34);
    advance(s,.001);
    assert.equal(s.rogue.hits,hit?1:0);
    assert.equal(s.rogue.lastHit,hit?(crossing===2?'car':'bullet'):null);
    if(hit)assert.equal(s.rogue.y,8);
    roundTrip(s);
  }
});

for(const [crossing,id,kind,code,stamp] of [[0,'corn_contained','bullet','21','SPECIMEN CONTAINED'],[2,'roadkill','car','22','ROADSIDE SPECIMEN']]) {
  test(`three ${kind} collisions earn distinct ${id} and survive saves and progress transfer`, async () => {
    let s=begin('corn');
    while(s.rogue.crossing<crossing) {
      s=takeCornRoute(s,findCornRoute(s),false);
      advance(s,1);
    }
    for(let hits=1;hits<=3;hits++) {
      while(s.rogue.time<s.rogue.immuneUntil)advance(s,.1);
      collisionMoment(s,7,.04,.12);
      advance(s,.001);
      assert.equal(s.rogue.hits,hits);assert.equal(s.rogue.lastHit,kind);
      if(hits<3) { assert.equal(s.phase,'rogue');assert.equal(s.ending,null); }
      s=roundTrip(s);
      const collected=hits===3?[id]:[];
      const snapshot=progressSnapshot(s,{collected,runs:[]});
      const imported=await decodeProgress(await encodeProgress(snapshot));
      assert.deepEqual(imported,snapshot);
      s=imported.save;
    }
    assert.equal(s.phase,'ending');assert.equal(s.ending,id);
    assert.equal(s.reports.at(-1).answer,kind==='car'?'The headlights found me. I could not cross the road.':'The rifle found me. I could not keep moving.');
    const ending=getEnding(s);
    assert.equal(ending.code,code);assert.equal(ending.title,ENDINGS[id].title);assert.equal(ending.stamp,stamp);
    assert.match(ending.text,kind==='car'?/headlights/:/rifle|guard/);
    assert.deepEqual(getEnding(roundTrip(s)),ending);
    for(const patch of [{hits:2},{patternVersion:1},{lastHit:kind==='car'?'bullet':'car'},{y:8},{crossing:kind==='car'?0:2}]) {
      const forged=structuredClone(s);Object.assign(forged.rogue,patch);
      assert.equal(restore(serialize(forged)),null,'a death record must match its actual cause and third hit');
    }
    // Early local v2 playtests used the old collection entry; keep those readable.
    const preview=structuredClone(s);preview.ending='assimilation';preview.rogue.outcome='assimilation';
    assert.ok(restore(serialize(preview)));
  });
}

for(const [choice,ending] of [['warn','radio_ghost'],['command','field_voice']]) {
  test(`three tuned carriers can produce ${ending} and preserve a transferred save`, async () => {
    let s=begin('broadcast');
    for(let i=0;i<3;i++) {
      lockSignal(s);assert.equal(s.rogue.locks,i+1);s=roundTrip(s);
      s=(await decodeProgress(await encodeProgress(progressSnapshot(s,{collected:[],runs:[]})))).save;
    }
    assert.equal(s.rogue.stage,'choice');
    assert.equal(chooseRogue(s,choice),true);assert.equal(s.ending,ending);
    roundTrip(s);
  });
}

test('missed signals cost exactly one strike per press and three misses have a saved ending', () => {
  const s=begin('broadcast');
  for(let i=0;i<3;i++) {
    while(s.rogue.time<s.rogue.lockReadyAt || broadcastCursor(s)>.25)advance(s,.01);
    assert.equal(chooseRogue(s,'lock'),true);assert.equal(s.rogue.hits,i+1);
    assert.equal(chooseRogue(s,'lock'),false);
    roundTrip(s);
  }
  assert.equal(s.ending,'assimilation');assert.equal(s.rogue.locks,0);
  const ending=getEnding(s);
  assert.equal(ending.title,ENDINGS.assimilation.title);
  assert.equal(ending.code,ENDINGS.assimilation.code);
  assert.equal(ending.stamp,'VOICE RETAINED');
  assert.match(ending.text,/radio comes your voice/);
  assert.deepEqual(getEnding(roundTrip(s)),ending);
});

test('flood pipes are initially scrambled, rotate independently, and connect a real route', () => {
  for(let seed=1;seed<=50;seed++) {
    const s=field();s.rng=seed;s.player={x:3,y:3};s.inspected.push('pump');
    startRogue(s,'flood');chooseRogue(s,'begin');
    assert.equal(floodConnections(s).connected,false);
    assert.equal(chooseRogue(s,'tile-9'),false);
    const frozen=serialize(s);advance(s,100);assert.equal(serialize(s),frozen,'the pipe puzzle has no time pressure');
    solvePipes(s);assert.equal(floodConnections(s).connected,true);
    assert.ok(floodConnections(s).tiles[5].wet);
    roundTrip(s);
    assert.equal(chooseRogue(s,'release'),true);assert.equal(s.ending,'flood');
    roundTrip(s);
  }
});

test('three disconnected releases rupture the perimeter and cannot repeat rewards', () => {
  const s=begin('flood');
  for(let i=1;i<=3;i++) {
    assert.equal(chooseRogue(s,'release'),true);assert.equal(s.rogue.hits,i);roundTrip(s);
  }
  assert.equal(s.ending,'breach');
  assert.equal(s.breaches,0);
  const ending=getEnding(s);
  assert.equal(ending.title,ENDINGS.breach.title);
  assert.equal(ending.code,ENDINGS.breach.code);
  assert.equal(ending.stamp,'TREATMENT LINE RUPTURED');
  assert.doesNotMatch(ending.text,/sixth movement/i);
  assert.match(ending.text,/pipe from the wall/);
  assert.deepEqual(getEnding(roundTrip(s)),ending);
  assert.equal(chooseRogue(s,'release'),false);assert.equal(chooseRogue(s,'tile-0'),false);
});

test('older saves remain compatible and forged or out-of-bounds rogue states are rejected', () => {
  assert.ok(restore(serialize(createGame())));
  const legacy=field();legacy.phase='ending';legacy.ending='assimilation';roundTrip(legacy);
  assert.deepEqual(getEnding(legacy),ENDINGS.assimilation);
  legacy.ending='breach';
  assert.deepEqual(getEnding(roundTrip(legacy)),ENDINGS.breach);
  for(const route of ['corn','broadcast','flood']) {
    const s=begin(route);
    const changes=[{stage:'unknown'},{time:-1},{time:Infinity},{hits:4},{outcome:'corn_escape'},{unexpected:true}];
    if(route==='corn')changes.push({x:11},{y:-1},{refuge:0},{immuneUntil:500},{moveReadyAt:500},{patternVersion:0},{patternVersion:3},{lastHit:'car'},{lastHit:'unknown'},{hits:1,lastHit:null},{crossing:3});
    if(route==='broadcast')changes.push({locks:4},{locks:3},{lockReadyAt:500});
    if(route==='flood')changes.push({tiles:[0]},{tiles:Array(9).fill(4)},{turns:-1},{stage:'choice'});
    for(const patch of changes) {
      const forged=structuredClone(s);Object.assign(forged.rogue,patch);
      assert.equal(restore(serialize(forged)),null,JSON.stringify(patch));
    }
    const missing=structuredClone(s);delete missing.rogue;assert.equal(restore(serialize(missing)),null);
    const missingCommit=structuredClone(s);missingCommit.reports=[];assert.equal(restore(serialize(missingCommit)),null);
    const wrongCommit=structuredClone(s);wrongCommit.reports.at(-1).rogueRoute='other';assert.equal(restore(serialize(wrongCommit)),null);
    const wrongPhase=structuredClone(s);wrongPhase.phase='field';assert.equal(validRogue(wrongPhase),false);
  }
  for(const ending of ['corn_escape','corn_uprising','radio_ghost','field_voice','flood','corn_contained','roadkill']) {
    const forged=field();forged.phase='ending';forged.ending=ending;assert.equal(restore(serialize(forged)),null);
  }
});
