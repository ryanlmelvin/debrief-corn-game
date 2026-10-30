import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, advance, shoot, reload, move, inspect, prepareEvidence, beginDebrief, answer, getQuestion, restore, serialize, FIELD_SITES, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { preparationTasks, caseProgress } from '../docs/evidence-case.js';
import { endingPaths, endingPathCounter } from '../docs/ending-paths.js';
import { currentEncounter } from '../docs/encounters.js';
import { planFieldRoute } from '../docs/field.js';
const site=id=>FIELD_SITES.find(p=>p.id===id);
function watch(s) {
  startShift(s);
  while(s.phase==='tower') {
    advance(s,.25);
    for(const t of [...s.targets])if(t.kind==='corn')shoot(s,t.x,t.y-34);
    if(s.rounds<2)reload(s);
  }
  assert.equal(s.phase,'field');
}
function travel(s,id,style='quiet',greedy=false) {
  for(const step of planFieldRoute(s,site(id),style).steps) {
    if(s.phase!=='field')break;
    move(s,step.x-s.player.x,step.y-s.player.y);
    if(s.fieldEvents.pending) {
      const e=currentEncounter(s),choice=greedy?[...e.choices].sort((a,b)=>b.delta-a.delta)[0]:e.choices[0];
      chooseFieldEncounter(s,choice.id);continueFieldEncounter(s);
    }
  }
}
function campaign(mode,seed,{skipFirst=false,missReport=-1,greedy=false,style='quiet',prepare=true}={}) {
  let s=createGame(mode,seed);
  for(let night=0;night<3;night++) {
    watch(s);
    for(const id of ['pump','corner','drain','tower']) {
      travel(s,id,style,greedy);
      if(s.phase!=='field')return s;
      if(id!=='tower')inspect(s);
      if(prepare&&!(skipFirst&&night===0))for(const task of preparationTasks(s,id)) {
        prepareEvidence(s,task.id);
        if(s.phase!=='field')return s;
      }
      s=restore(serialize(s));assert.ok(s);
    }
    assert.equal(beginDebrief(s),true);
    answer(s,'truth');answer(s,night===missReport?'redact':'evidence');
    if(night===2){answer(s,'expose');return s;}
    // Signing affects the department's response, not the established facts.
    answer(s,'sign');
  }
}
test('the planned route earns witness across seeds and both intensities without lucky encounters',()=>{
  for(const mode of ['story','hard'])for(const seed of [1,42,847,12345]) {
    const s=campaign(mode,seed);
    assert.equal(s.ending,'witness',`${mode} ${seed}`);
    assert.equal(endingPathCounter(s),'5/5');assert.equal(s.evidence.length,9);
    assert.ok(s.exposure<100);assert.deepEqual(s.caseFile.secured,['ledger','sample','map']);
  }
});
test('ordinary collection and honest reporting do not automatically earn witness',()=>{
  const s=campaign('story',42,{prepare:false});
  assert.equal(s.phase,'debrief');assert.equal(s.ending,null);
  assert.equal(endingPathCounter(s),'2/5');assert.equal(caseProgress(s).ready,false);
  assert.match(getQuestion(s).options[0].detail,/record copy.*packed sample.*survey tracing/);
});
test('a skipped preparation and one missed report can both be recovered in a single assignment',()=>{
  const s=campaign('story',42,{skipFirst:true,missReport:0});
  assert.equal(s.ending,'witness');assert.deepEqual(s.caseFile.reported,[1,2]);
});
test('preparation has real opportunity cost: costly encounters can exhaust the otherwise safe route',()=>{
  assert.equal(campaign('story',42,{greedy:true}).ending,'assimilation');
  assert.equal(campaign('hard',42,{style:'direct'}).ending,'assimilation');
});
test('preparation requires a discovered exhibit at its inspected site, and charges only once',()=>{
  const s=createGame();assert.equal(prepareEvidence(s,'ledger'),false);
  Object.assign(s,{phase:'field',player:{x:3,y:3}});
  assert.equal(prepareEvidence(s,'ledger'),false);
  inspect(s);assert.equal(prepareEvidence(s,'sample'),false);
  s.player={x:1,y:7};assert.equal(prepareEvidence(s,'ledger'),false);
  s.player={x:3,y:3};assert.equal(prepareEvidence(s,'ledger'),true);
  assert.equal(s.exposure,12);assert.equal(prepareEvidence(s,'ledger'),false);assert.equal(s.exposure,12);
  assert.equal(endingPathCounter(restore(serialize(s))),'1/5');
});
test('fatal preparation honors the exposure rule and a pending encounter blocks preparation',()=>{
  const s=createGame();Object.assign(s,{phase:'field',player:{x:3,y:3}});inspect(s);
  s.fieldEvents.pending={id:'first-call'};assert.equal(prepareEvidence(s,'ledger'),false);
  s.fieldEvents.pending=null;s.exposure=88;
  assert.equal(prepareEvidence(s,'ledger'),true);assert.equal(s.ending,'assimilation');assert.equal(s.exposure,100);
});
test('only physical findings count, once per night, and later signing never erases them',()=>{
  const s=createGame();Object.assign(s,{phase:'debrief',question:1});
  answer(s,'evidence');assert.deepEqual(s.caseFile.reported,[]);
  s.question=1;s.evidence=['dress'];answer(s,'evidence');assert.deepEqual(s.caseFile.reported,[0]);
  s.question=1;answer(s,'evidence');assert.deepEqual(s.caseFile.reported,[0]);
  answer(s,'sign');assert.deepEqual(s.caseFile.reported,[0]);
  Object.assign(s,{phase:'debrief',question:1,evidence:['dress','badge']});
  s.fieldEvents.journal=[{id:'second-call'}];answer(s,'field-notes');assert.deepEqual(s.caseFile.reported,[0]);
});
test('every required preparation and the two-night testimony threshold are enforced',()=>{
  const s=createGame();Object.assign(s,{phase:'debrief',shift:2,question:2,evidence:['ledger','sample','map']});
  for(const missing of ['ledger','sample','map',null]) {
    s.caseFile={secured:s.evidence.filter(id=>id!==missing),reported:missing?[0,1]:[0]};
    const before=serialize(s);assert.equal(answer(s,'expose'),false);assert.equal(serialize(s),before);
  }
  s.caseFile.reported.push(2);assert.equal(answer(s,'expose'),true);assert.equal(s.ending,'witness');
});
test('saved counters survive restoration and reject corrupt progress without granting free preparations',()=>{
  const s=createGame();Object.assign(s,{phase:'debrief',shift:1,question:1,evidence:['ledger','dress','sample','badge']});
  s.reports=[{shift:0,question:'What did you find?',answer:'I found white fabric in the corner. A stalk had grown through it.'},{shift:0,question:'Will you sign?',answer:'I will sign the report and return to the watchtower.'}];
  delete s.caseFile;
  const legacy=restore(serialize(s));assert.deepEqual(legacy.caseFile,{secured:[],reported:[0]});assert.deepEqual(legacy.evidence,s.evidence);
  for(const caseFile of [null,{secured:['ledger','ledger'],reported:[]},{secured:['map'],reported:[]},{secured:[],reported:[0,0]},{secured:[],reported:[2]},{secured:[],reported:['1']}])assert.equal(restore(serialize({...legacy,caseFile})),null);
  const before=serialize(legacy);endingPaths(legacy);assert.equal(serialize(legacy),before);
});
