import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { sightingPromptReady } from '../docs/watch-story.js';
import { readFileSync } from 'node:fs';
import { createGame, answer, advance, restore, serialize, getEnding, BRIEFINGS, enterField, inspect } from '../docs/engine.js';
import { stepGuide, turnGuide, inspectGuide, focusGuide, fireGuide, spareGuide, guideWall, isGuideAftermath } from '../docs/guide.js';
function begin(){const s=createGame('story',123);Object.assign(s,{phase:'debrief',shift:2,question:2});answer(s,'guide');return s;}
function steps(s,n){for(let i=0;i<n;i++)assert.equal(stepGuide(s),true);}
function explore(){
  const s=begin();steps(s,2);assert.equal(inspectGuide(s).id,'boot');
  turnGuide(s,1);steps(s,4);turnGuide(s,-1);steps(s,4);assert.equal(inspectGuide(s).id,'radio');
  turnGuide(s,1);steps(s,6);turnGuide(s,-1);steps(s,4);assert.equal(inspectGuide(s).id,'corner');
  turnGuide(s,1);turnGuide(s,1);advance(s,1);return s;
}
test('leading the team opens a playable walk, with walls and discoveries in order',()=>{
  const s=begin();assert.equal(s.phase,'guide');assert.equal(s.ending,null);
  assert.equal(inspectGuide(s),null);turnGuide(s,-1);assert.equal(stepGuide(s),false);assert.equal(s.guide.steps,0);
  assert.equal(guideWall(0,0),true);assert.equal(fireGuide(s,480,300),'blocked');
  const route=explore();assert.equal(route.guide.stage,'escape');assert.deepEqual(route.guide.clues,['boot','radio','corner']);
  assert.equal(route.guide.team.length,3);assert.deepEqual(restore(serialize(route)),route);
});
test('the team can leave without the player firing',()=>{const s=explore();assert.equal(spareGuide(s),true);assert.equal(s.phase,'ending');assert.equal(s.ending,'guide');assert.match(getEnding(s).text,/Three lights reach the road/);assert.equal(s.shots,0);});
test('the player can fire at the fleeing team and receives a distinct aftermath',()=>{
  const s=explore();for(let i=0;i<3;i++){const p=focusGuide(s);assert.ok(p);assert.equal(fireGuide(s,p.x,p.y),'person');}
  assert.equal(s.phase,'ending');assert.equal(getEnding(s).stamp,'PERIMETER SECURED');assert.equal(s.guide.fired,3);
});
test('partial violence and refusing to fire both complete; missing never traps the player',()=>{
  const s=explore(),p=focusGuide(s);fireGuide(s,p.x,p.y);spareGuide(s);assert.equal(getEnding(s).stamp,'PERSONNEL INCIDENT');
  const misses=explore();for(let i=0;i<6;i++)fireGuide(misses,0,0);assert.equal(fireGuide(misses,0,0),'empty');spareGuide(misses);assert.equal(misses.phase,'ending');
  const wait=explore();for(let i=0;i<66;i++)advance(wait,1);assert.equal(wait.phase,'ending');assert.ok(wait.guide.team.every(t=>t.status==='escaped'));
});
test('guide saves reject corrupt state and retain exploration progress',()=>{
  const s=begin();steps(s,2);inspectGuide(s);assert.deepEqual(restore(serialize(s)),s);
  for(const patch of [{x:99},{clues:['corner']},{team:[{}]},{stage:'unknown'},{fired:7}])assert.equal(restore(serialize({...s,guide:{...s.guide,...patch}})),null);
});
test('orders stay restrained, and every landmark has a new exhibit each night',()=>{
  for(const b of BRIEFINGS)assert.deepEqual(b.orders,['Watch the corn. Shoot any that try to escape.','Remain in the watchtower.','Do not consume the crop.','Remember any irregularities for your debrief at the end of the night.']);
  for(const [x,y] of [[9,1],[3,3],[7,5]]){const exhibits=[];for(let shift=0;shift<3;shift++){const s=createGame();Object.assign(s,{phase:'decision',shift,incident:true});enterField(s);s.player={x,y};exhibits.push(inspect(s));}assert.equal(new Set(exhibits).size,3);}
});

test('shooting aftermath stays in the field with only the final order, including after resume',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const scene=source.slice(source.indexOf('function sceneDialog()'),source.indexOf('function stat('));
  for(const shots of [1,2,3]){
    const s=explore();
    for(let i=0;i<shots;i++){const p=focusGuide(s);fireGuide(s,p.x,p.y);}
    if(shots<3)spareGuide(s);
    const game=restore(serialize(s));assert.equal(isGuideAftermath(game),true);
    let archived=0,shown=0;const message={textContent:''};
    const context=vm.createContext({game,sightingPromptReady,lastModalKey:'',isGuideAftermath,getEnding,
      archiveRun(){archived++;},$:id=>id==='aftermath-message'?message:{matches:()=>shown>0,showPopover(){shown++;}},
      showModal(){assert.fail('The field should remain visible.');}});
    vm.runInContext(scene+';sceneDialog();sceneDialog();',context);
    assert.equal(archived,1);assert.equal(shown,1);
    assert.equal(message.textContent,'Shoot any that try to escape.');
    assert.equal(getEnding(game).text,'');
  }
  const spared=explore();spareGuide(spared);assert.equal(isGuideAftermath(spared),false);
  assert.equal(isGuideAftermath(begin()),false);
});
