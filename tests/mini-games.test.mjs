import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, advance, shoot, reload, serialize, restore, SHIFT_LENGTH, enterField, inspect } from '../docs/engine.js';
import { chooseRogue, moveRogue, getRogueScene, broadcastCursor, broadcastWindow, startRogue } from '../docs/rogue.js';
import { MINI_GAMES, createMiniGame, miniGameComplete, miniGameResult, getMiniGameUnlocks, normalizeMiniGameUnlocks } from '../docs/mini-games.js';

function roundTrip(s) {
  const copy=restore(serialize(s));
  assert.ok(copy,`${s.practice}/${s.phase} practice save must restore`);
  assert.deepEqual(copy,s);
  assert.equal(copy.practice,s.practice);
  return copy;
}
function result(s, success) {
  assert.equal(miniGameComplete(s),true);
  const summary=miniGameResult(s);
  assert.equal(summary.success,success);assert.equal(summary.id,s.practice);
  assert.ok(summary.title);assert.ok(summary.message);
  roundTrip(s);
}

test('the mini-game catalog starts every playable activity directly with durable practice provenance', () => {
  assert.deepEqual(MINI_GAMES.map(game=>game.id),['watch','corn','broadcast','flood','dungeon','rescue','transmission']);
  for(const mode of ['story','hard']) for(const entry of MINI_GAMES) {
    const s=createMiniGame(entry.id,mode,42);
    assert.equal(s.practice,entry.id);
    assert.match(s.runId,new RegExp(`^practice-${entry.id}-`));
    assert.equal(s.mode,mode);
    assert.equal(s.phase,entry.id==='watch'?'tower':['rescue','transmission'].includes(entry.id)?'resolution':'rogue');
    if(!['watch','rescue','transmission'].includes(entry.id))assert.equal(s.rogue.stage,'play');
    assert.equal(miniGameComplete(s),false);assert.equal(miniGameResult(s),null);
    roundTrip(s);
  }
  assert.equal(createMiniGame('unknown'),null);
  assert.equal(createMiniGame(null),null);
});

test('practice construction and actions leave a separate story save and its randomness untouched', () => {
  const story=createGame('hard',781);startShift(story);advance(story,5);
  const before=serialize(story);
  for(const entry of MINI_GAMES) {
    const s=createMiniGame(entry.id,'story',42);
    advance(s,1);
    if(entry.id==='dungeon')chooseRogue(s,s.rogue.route==='corn'?'root':'wait');
    assert.equal(serialize(story),before);
  }
  assert.deepEqual(createMiniGame('flood','story',42),createMiniGame('flood','story',42),'seeded practice can be reproduced independently');
  assert.equal(miniGameComplete(story),false);
  assert.equal(miniGameResult(story),null);
});

test('practice pump success and rupture keep their marker through real puzzle outcomes', () => {
  const solved=createMiniGame('flood','story',42);
  for(const [index,rotation] of [[3,3],[0,1],[1,1],[2,2],[5,0]]) {
    while(solved.rogue.tiles[index]!==rotation)assert.equal(chooseRogue(solved,`tile-${index}`),true);
  }
  assert.equal(chooseRogue(solved,'release'),true);
  assert.equal(solved.ending,'flood');result(solved,true);
  const broken=createMiniGame('flood','story',42);
  for(let i=0;i<3;i++)assert.equal(chooseRogue(broken,'release'),true);
  assert.equal(broken.ending,'breach');result(broken,false);
});

test('practice radio misses complete without changing the assignment provenance', () => {
  const s=createMiniGame('broadcast','story',42);
  for(let miss=0;miss<3;miss++) {
    let ticks=0;
    while(s.rogue.time<s.rogue.lockReadyAt || broadcastCursor(s)>=broadcastWindow(s).min && broadcastCursor(s)<=broadcastWindow(s).max) {
      advance(s,.01);assert.ok(ticks++<1000);
    }
    assert.equal(chooseRogue(s,'lock'),true);
  }
  assert.equal(s.ending,'assimilation');result(s,false);
});

test('practice radio completion stops at the final signal without needing an ending choice', () => {
  const s=createMiniGame('broadcast','story',42);
  for(let lock=0;lock<3;lock++) {
    let ticks=0;
    while(s.rogue.time<s.rogue.lockReadyAt || broadcastCursor(s)<broadcastWindow(s).min+.01 || broadcastCursor(s)>broadcastWindow(s).max-.01) {
      advance(s,.01);assert.ok(ticks++<1000);
    }
    assert.equal(chooseRogue(s,'lock'),true);
  }
  assert.equal(s.rogue.stage,'choice');assert.equal(s.ending,null);result(s,true);
});

test('practice corn loss uses the real collisions and remains practice after restoring', () => {
  const s=createMiniGame('corn','story',42);
  for(let attempt=0;attempt<500 && s.phase==='rogue';attempt++) {
    advance(s,.25);
    if(s.rogue.y===8)moveRogue(s,0,-1);
  }
  assert.equal(s.ending,'corn_contained');result(s,false);
});

test('practice dungeon defeat and escape remain practice at both terminal outcomes', () => {
  const lost=createMiniGame('dungeon','story',42);
  for(let turn=0;turn<30&&lost.phase!=='ending';turn++)assert.equal(chooseRogue(lost,lost.rogue.route==='corn'?'root':'wait'),true);
  assert.equal(lost.ending,'dungeon_lost');result(lost,false);
  let escaped=createMiniGame('dungeon','story',42);
  const directions={R:[1,0],L:[-1,0],U:[0,-1],D:[0,1]};
  for(const action of 'RRRFRDDRRUURRFRRDDDDDDDDRRFRRDDRRDDFFRRRRDDLLRRDDRRRFADDRRFUURRRRRDDDDDDDD') {
    assert.equal(action==='F'?chooseRogue(escaped,'fire'):action==='A'?chooseRogue(escaped,'reload'):moveRogue(escaped,...directions[action]),true);
  }
  assert.equal(escaped.phase,'rogue');assert.equal(escaped.rogue.stage,'debrief');
  assert.equal(escaped.ending,null);
  assert.equal(miniGameComplete(escaped),false,'reaching the surface starts the interview before practice results');
  assert.equal(miniGameResult(escaped),null);
  // Historical terminal saves predate the interview and contain just the begin
  // receipt followed by the surface receipt. They must remain completed.
  const legacy=structuredClone(escaped);
  delete legacy.rogue.debrief;
  legacy.phase='ending';legacy.ending='dungeon_escape';
  legacy.rogue.stage='done';legacy.rogue.outcome='dungeon_escape';
  legacy.reports=legacy.reports.filter(report=>report.kind!=='rogue'||report.choice==='begin');
  legacy.reports.push({kind:'rogue',shift:legacy.shift,rogueRoute:'dungeon',choice:'surface',question:'What happened after you broke protocol?',answer:'I found the three keys and climbed out beneath a different sky.'});
  const oldCompleted=roundTrip(legacy);
  assert.equal(oldCompleted.rogue.debrief,undefined);
  result(oldCompleted,true);
  for(let question=0;question<3;question++) {
    escaped=roundTrip(escaped);
    const scene=getRogueScene(escaped);
    assert.ok(scene?.options?.length,'the next interview question survives reload');
    assert.equal(chooseRogue(escaped,scene.options[0].id),true);
    assert.equal(escaped.practice,'dungeon');
    if(question<2){
      assert.equal(escaped.rogue.stage,'debrief');assert.equal(escaped.ending,null);
      assert.equal(miniGameComplete(escaped),false);assert.equal(miniGameResult(escaped),null);
    }
  }
  assert.equal(escaped.ending,'dungeon_escape');result(escaped,true);
  assert.equal(miniGameResult(escaped).reply,escaped.reports.at(-2).supervisorReply);
});

test('practice watch completes a full real shift and stops at the field boundary', () => {
  for(const mode of ['story','hard']) {
    const s=createMiniGame('watch',mode,42);
    for(let frame=0;frame<300 && !miniGameComplete(s);frame++) {
      advance(s,.25);
      for(const target of [...s.targets]) {
        if(target.kind!=='corn')continue;
        if(!s.rounds){reload(s);break;}
        shoot(s,target.x,target.y-34);
      }
      if(s.rounds<2)reload(s);
    }
    assert.equal(s.phase,'field');assert.ok(s.time>=SHIFT_LENGTH);assert.equal(s.breaches,0);
    result(s,true);
  }
  const failed=createMiniGame('watch','story',42);advance(failed,SHIFT_LENGTH);
  assert.equal(failed.ending,'breach');result(failed,false);
});

test('restore rejects unknown or mismatched practice markers and leaves ordinary saves ordinary', () => {
  for(const value of [true,false,null,42,{},'guide','invalid']) {
    const s=createMiniGame('dungeon','story',42);s.practice=value;
    assert.equal(restore(serialize(s)),null);
  }
  for(const value of ['watch','corn','broadcast','flood']) {
    const s=createMiniGame('dungeon','story',42);s.practice=value;
    assert.equal(restore(serialize(s)),null,'a marker must match the actual route');
  }
  const story=createGame('story',42), resumed=restore(serialize(story));
  assert.equal(Object.hasOwn(resumed,'practice'),false);
  const crossed=createMiniGame('watch','story',42);crossed.phase='debrief';
  assert.equal(restore(serialize(crossed)),null,'practice cannot resume inside the assignment interview');
});


function storyAtRoute(route) {
  const s=createGame('story',42);startShift(s);advance(s,13);
  assert.equal(enterField(s),true);
  if(route==='corn')s.exposure=100;
  if(route==='dungeon')s.fieldEvents.flags.push('lantern');
  if(route==='flood'||route==='dungeon') {
    s.player=route==='flood'?{x:3,y:3}:{x:7,y:5};
    assert.ok(inspect(s));
  }
  assert.equal(startRogue(s,route),true);
  return s;
}
function archive(s) { return {id:s.runId,ending:s.ending,reports:structuredClone(s.reports)}; }

test('mini-game unlocks begin with the real watch and do not require completing it', () => {
  const s=createGame('story',42);
  assert.deepEqual(getMiniGameUnlocks(s),[],'the initial briefing is not a played watch');
  assert.equal(startShift(s),true);
  assert.deepEqual(getMiniGameUnlocks(s),['watch'],'entry unlocks immediately at time zero');
  assert.equal(s.time,0);assert.equal(s.ending,null);
  assert.deepEqual(getMiniGameUnlocks(restore(serialize(s))),['watch']);
  advance(s,SHIFT_LENGTH);
  assert.equal(s.ending,'breach');
  assert.deepEqual(getMiniGameUnlocks(s),['watch'],'losing does not remove entry credit');
  assert.deepEqual(getMiniGameUnlocks(archive(s)),['watch'],'an archived breach needs no winning ending or transcript');
});

test('each optional game unlocks at its real begin action, never from the introduction alone', () => {
  for(const route of ['corn','broadcast','flood','dungeon']) {
    const s=storyAtRoute(route);
    assert.deepEqual(getMiniGameUnlocks(s),['watch']);
    assert.equal(chooseRogue(s,'begin'),true);
    assert.equal(s.rogue.stage,'play');assert.equal(s.ending,null);
    const before=serialize(s);
    assert.deepEqual(getMiniGameUnlocks(s),['watch',route]);
    assert.equal(serialize(s),before,'reading unlock evidence must not change state or randomness');
    assert.deepEqual(getMiniGameUnlocks(restore(serialize(s))),['watch',route]);
  }
});

test('backtracking from an introduction and refusing the corn crossing do not unlock play', () => {
  for(const route of ['broadcast','flood','dungeon']) {
    const s=storyAtRoute(route);
    assert.equal(chooseRogue(s,'back'),true);
    assert.equal(s.phase,'field');assert.equal(s.reports.length,0);
    assert.deepEqual(getMiniGameUnlocks(s),['watch']);
    assert.equal(startRogue(s,route),true);
    assert.deepEqual(getMiniGameUnlocks(s),['watch'],'opening the same introduction twice still does not play it');
  }
  const rooted=storyAtRoute('corn');
  assert.equal(chooseRogue(rooted,'root'),true);
  assert.equal(rooted.ending,'assimilation');
  assert.deepEqual(getMiniGameUnlocks(rooted),['watch']);
  assert.deepEqual(getMiniGameUnlocks(archive(rooted)),['watch'],'an ending by itself cannot establish that its mini game was played');
});

test('real route losses retain unlock evidence in completed transcripts', () => {
  for(const route of ['corn','broadcast','flood','dungeon']) {
    const s=storyAtRoute(route);chooseRogue(s,'begin');
    if(route==='corn') {
      for(let frame=0;frame<500&&s.phase==='rogue';frame++) {
        advance(s,.25);if(s.rogue.y===8)moveRogue(s,0,-1);
      }
    } else if(route==='broadcast') {
      for(let miss=0;miss<3;miss++) {
        let ticks=0;
        while(s.rogue.time<s.rogue.lockReadyAt || broadcastCursor(s)>=broadcastWindow(s).min && broadcastCursor(s)<=broadcastWindow(s).max) {advance(s,.01);assert.ok(ticks++<1000);}
        assert.equal(chooseRogue(s,'lock'),true);
      }
    } else if(route==='flood') {
      for(let release=0;release<3;release++)assert.equal(chooseRogue(s,'release'),true);
    } else {
      for(let turn=0;turn<30&&s.phase!=='ending';turn++)assert.equal(chooseRogue(s,s.rogue.route==='corn'?'root':'wait'),true);
    }
    assert.equal(s.phase,'ending');
    assert.deepEqual(getMiniGameUnlocks(s),['watch',route]);
    assert.deepEqual(getMiniGameUnlocks(archive(s)),['watch',route]);
  }
});

test('practice, preview, route labels, and unplayed ending names cannot unlock mini games', () => {
  for(const game of MINI_GAMES) {
    const practice=createMiniGame(game.id,'story',42);
    assert.deepEqual(getMiniGameUnlocks(practice),[]);
    assert.deepEqual(getMiniGameUnlocks(restore(serialize(practice))),[]);
    const copiedArchive={id:practice.runId,ending:'dungeon_escape',reports:practice.reports};
    assert.deepEqual(getMiniGameUnlocks(copiedArchive),[],'practice run IDs retain their provenance even in old archive shapes');
  }
  const normal=storyAtRoute('dungeon');chooseRogue(normal,'begin');
  for(const marker of [{practice:false},{practice:undefined},{preview:true}])assert.deepEqual(getMiniGameUnlocks({...normal,...marker}),[]);
  for(const ending of ['corn_escape','radio_ghost','flood','dungeon_escape']) {
    assert.deepEqual(getMiniGameUnlocks({id:'archived',ending,reports:[]}),['watch'],'route unlocks require a real begin receipt, not an ending-name guess');
  }
  assert.deepEqual(getMiniGameUnlocks({phase:'field',reports:[{kind:'rogue',choice:'back',rogueRoute:'dungeon'},{kind:'other',choice:'begin',rogueRoute:'flood'},{kind:'rogue',choice:'begin',rogueRoute:'unknown'}]}),['watch']);
  assert.deepEqual(normalizeMiniGameUnlocks(['dungeon','watch','watch','bogus','corn']),['watch','corn','dungeon']);
  for(const value of [null,undefined,false,[],42])assert.deepEqual(getMiniGameUnlocks(value),[]);
});
