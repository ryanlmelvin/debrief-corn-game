import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startShift,advance,shoot,focusNext,enterField,restore,serialize} from '../docs/engine.js';
import {sightingPromptReady,sightingPeople,personLight,personExitTime,targetArtwork,watchNight,observedSighting} from '../docs/watch-story.js';
import {dialogArtwork} from '../docs/art.js';

const watch=shift=>{const s=createGame('story',42);s.shift=shift;startShift(s);return s;};
for(const shift of [0,1,2]) {
  test(`night ${shift+1} spawns the people described by its sighting, with matching artwork`,()=>{
    const s=watch(shift);advance(s,11.9);assert.ok(s.targets.every(t=>t.kind==='corn'));
    advance(s,.2);const people=s.targets.filter(t=>t.kind==='person');
    assert.equal(people.length,shift===0?1:3);
    assert.equal(new Set(people.map(t=>t.id)).size,people.length);
    assert.deepEqual(people.map(t=>t.member),shift===0?[0]:[0,1,2]);
    assert.ok(people.every(t=>t.role===(shift===0?'dress':'retrieval')));
    assert.ok(people.every(t=>targetArtwork(shift,t)===(shift===0?'dress':`${shift===2?'hazmat':'retrieval'}-${t.member}`)));
    for(let i=0;i<s.targets.length;i++){focusNext(s);assert.equal(s.targets.find(t=>t.id===s.focused).kind,'corn');}
    assert.deepEqual(restore(serialize(s)),s);
    assert.match(dialogArtwork('sighting',shift),[/field-sighting.webp/,/field-retrieval.webp/,/field-hazmat.webp/][shift]);
  });
}

test('crop anatomy progresses by night, including existing saves without appearance fields',()=>{
  const crop={kind:'corn'};
  assert.deepEqual([0,1,2].map(shift=>targetArtwork(shift,crop)),['corn','corn-roots','corn-teeth']);
  assert.equal(targetArtwork(1,{kind:'person'}),'retrieval-0');
  assert.equal(targetArtwork(0,{kind:'person'}),'dress');
  assert.equal(targetArtwork(2,{kind:'person'}),'hazmat-0');
  assert.equal(targetArtwork(2,{kind:'person',role:'retrieval',member:2}),'hazmat-2');
  assert.match(watchNight(1).notice,/Three recovery workers/);
});

test('third-night lights fade once, sequentially, before their workers disappear',()=>{
  const people=sightingPeople(2),levels=time=>people.map(p=>personLight(2,time,p));
  assert.deepEqual(levels(16),[1,1,1]);assert.deepEqual(levels(18),[0,1,1]);
  assert.deepEqual(levels(21),[0,0,1]);assert.deepEqual(levels(24),[0,0,0]);
  assert.ok(levels(17.7)[0]>0&&levels(17.7)[0]<1);
  assert.deepEqual(people.map(p=>personExitTime(2,p)),[20,23,26]);
  assert.ok(sightingPeople(1).every(p=>personLight(1,23,p)===1));
  const s=watch(2);advance(s,26.2);
  assert.equal(s.targets.filter(t=>t.kind==='person').length,0);
  for(const pattern of [/first team light goes out/,/second team light goes dark/,/last team light goes out/])assert.equal(s.log.filter(l=>pattern.test(l.message)).length,1);
});

test('retrieval workers stay civilians and never count as escaped crops',()=>{
  const s=watch(1);advance(s,13);const worker=s.targets.find(t=>t.kind==='person');
  assert.equal(shoot(s,worker.x,worker.y-34),'miss');assert.equal(s.kills,0);
  assert.equal(s.targets.filter(t=>t.kind==='person').length,3);assert.equal(s.exposure,0);
  assert.ok(s.targets.includes(worker));
  const loose=s.targets.filter(t=>t.kind==='corn').length;enterField(s);
  assert.equal(s.breaches,loose);
});

test('older live sightings resume without creating extra people and corrupt roster fields are rejected',()=>{
  const s=watch(1);advance(s,13);
  s.targets=s.targets.filter(t=>t.kind==='corn'||t.member===0);
  for(const t of s.targets){delete t.member;delete t.role;}
  const old=restore(serialize(s));assert.ok(old);assert.equal(old.targets.filter(t=>t.kind==='person').length,1);
  for(const patch of [{member:3},{member:-1},{member:1.2},{role:'unknown'}]) {
    const bad=structuredClone(s);Object.assign(bad.targets[0],patch);assert.equal(restore(serialize(bad)),null);
  }
});

test('testimony remembers only the lamp losses actually witnessed, including after save and resume',()=>{
  const early=watch(2);advance(early,13);enterField(early);
  assert.equal(observedSighting(early),'another three-person recovery team');
  const later=watch(2);advance(later,21.2);
  assert.deepEqual(later.lightsOut,[0,1]);
  assert.equal(observedSighting(restore(serialize(later))),'two recovery lights going out');
  for(const lightsOut of [[0,0],[3],'three'])assert.equal(restore(JSON.stringify({...later,lightsOut})),null);
});

test('each sighting gets five seconds of active observation before its prompt, including after resume',()=>{
  for(const shift of [0,1,2]) {
    const s=watch(shift);
    advance(s,12.1);
    assert.equal(s.incident,true);
    assert.equal(sightingPromptReady(s),false);
    advance(s,4.8);
    assert.equal(sightingPromptReady(s),false);
    const resumed=restore(serialize(s));
    assert.equal(sightingPromptReady(resumed),false);
    advance(resumed,.2);
    assert.equal(sightingPromptReady(resumed),true);
    resumed.phase='field';
    assert.equal(sightingPromptReady(resumed),false);
  }
});
