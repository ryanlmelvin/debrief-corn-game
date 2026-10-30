import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, startShift, advance, shoot, reload, move, inspect, beginDebrief, answer, getQuestion, restore, serialize, FIELD_SITES, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { witnessRequirements, canTakeEvidenceOutside } from '../docs/ending-requirements.js';
import { currentEncounter } from '../docs/encounters.js';
import { planFieldRoute } from '../docs/field.js';
import { notebookMarkup } from '../docs/art.js';
const requirement = (s,id) => witnessRequirements(s).find(r=>r.id===id);
function campaign(mode,seed,{record=true,object=true}={}) {
  let s=createGame(mode,seed);
  for(let night=0;night<3;night++) {
    startShift(s);
    while(s.phase==='tower') {
      advance(s,.25);
      for(const t of [...s.targets])if(t.kind==='corn')shoot(s,t.x,t.y-34);
      if(s.rounds<2)reload(s);
    }
    assert.equal(s.phase,'field');
    for(const id of ['pump','corner','drain','tower']) {
      const destination=FIELD_SITES.find(p=>p.id===id);
      for(const step of planFieldRoute(s,destination).steps) {
        assert.equal(move(s,step.x-s.player.x,step.y-s.player.y),true);
        if(s.fieldEvents.pending) {
          const e=currentEncounter(s),choice=record&&['first-call','future-call'].includes(e.id)?'record':e.choices[0].id;
          chooseFieldEncounter(s,choice);continueFieldEncounter(s);
        }
      }
      if(id!=='tower')assert.ok(inspect(s));
      s=restore(serialize(s));assert.ok(s);
    }
    assert.equal(beginDebrief(s),true);answer(s,'truth');answer(s,'evidence');
    if(night===2) { answer(s,'expose');return s; }
    answer(s,object?'question':'sign');
    if(s.question===3)answer(s,'return');
  }
}
test('existing encounter and debrief choices reach witness across seeds and both intensities',()=>{
  for(const mode of ['story','hard'])for(const seed of [1,42,847,12345]) {
    const s=campaign(mode,seed);
    assert.equal(s.ending,'witness');assert.ok(s.exposure<100);assert.equal(s.evidence.length,9);
    assert.ok(witnessRequirements(s).every(r=>r.met));assert.equal(s.caseFile,undefined);
  }
});
test('collection is not enough, and signing does not count as challenging the routine reports',()=>{
  for(const options of [{record:false},{object:false}]) {
    const s=campaign('story',42,options);
    assert.equal(s.phase,'debrief');assert.equal(s.ending,null);
    assert.equal(canTakeEvidenceOutside(s),false);
    assert.equal(requirement(s,options.record===false?'recordings':'objections').current,0);
  }
});
test('final requirements count distinct actions, and each missing requirement locks refusal',()=>{
  const s=createGame();Object.assign(s,{phase:'debrief',shift:2,question:2,evidence:['ledger','sample','map']});
  s.fieldEvents.journal=[{id:'first-call',choice:'record'},{id:'future-call',choice:'record'}];
  s.reports=[0,1].map(shift=>({shift,choice:'question',question:'Sign?',answer:'What treatment?'}));
  assert.equal(canTakeEvidenceOutside(s),true);
  for(const id of ['ledger','sample','map']) {
    const copy=structuredClone(s);copy.evidence=copy.evidence.filter(e=>e!==id);
    assert.equal(answer(copy,'expose'),false);assert.equal(requirement(copy,id).met,false);
  }
  for(const key of ['reports','journal']) {
    const copy=structuredClone(s);
    const entries=key==='reports'?copy.reports:copy.fieldEvents.journal;
    entries.splice(1,1);entries.push({...entries[0]});
    assert.equal(answer(copy,'expose'),false,'repeating one night or encounter cannot fill a missing one');
  }
  const before=serialize(s);getQuestion(s);assert.equal(serialize(s),before);
  assert.equal(answer(s,'expose'),true);assert.equal(s.ending,'witness');
});
test('new and old transcripts retain objections without a separate testimony counter',()=>{
  const s=createGame();Object.assign(s,{phase:'debrief',question:2});
  answer(s,'question');assert.equal(s.reports[0].choice,'question');
  assert.equal(requirement(s,'objections').current,1);
  delete s.reports[0].choice;
  assert.equal(requirement(restore(serialize(s)),'objections').current,1);
  s.reports.push({shift:1,question:'Sign?',answer:'I will sign the report and return to the watchtower.',redacted:true});
  assert.equal(requirement(s,'objections').current,1);
});
test('only the final refusal reveals the ending requirements',()=>{
  const s=createGame();
  for(const shift of [0,1,2])for(const question of [0,1,2]) {
    Object.assign(s,{phase:'debrief',shift,question});
    const q=getQuestion(s);
    for(const option of q.options)assert.equal(!!option.requirements,shift===2&&question===2&&option.id==='expose');
    if(shift!==2||question!==2)assert.doesNotMatch(JSON.stringify(q),/outside case|prepar|Field recordings|Reports challenged/);
  }
  assert.doesNotMatch(notebookMarkup(s),/An outside case|PRIVATE PLAN|prepare|recordings/i);
  for(const filename of ['app.js','art.js','field-ui.js','index.html']) {
    const source=readFileSync(new URL(`../docs/${filename}`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/PRIVATE PLAN|CASE_PLAN|ending-paths|prepare-evidence|prepare-case/);
  }
});
test('retired preparations refund ongoing exposure once without losing findings or restarting progress',()=>{
  const s=createGame();Object.assign(s,{phase:'field',shift:2,exposure:83,evidence:['ledger','sample','map'],caseFile:{secured:['ledger','sample','map'],reported:[0,1]}});
  s.log=[{message:'Record copy prepared for the outside case. +12 exposure.'},{message:'Keep this observation.'}];
  const resumed=restore(serialize(s));assert.ok(resumed);
  assert.equal(resumed.exposure,41);assert.deepEqual(resumed.evidence,s.evidence);assert.equal(resumed.caseFile,undefined);
  assert.deepEqual(resumed.log,[{message:'Keep this observation.'}]);
  assert.deepEqual(restore(serialize(resumed)),resumed);
  for(const ending of ['witness','assimilation']) {
    const completed={...s,phase:'ending',ending};
    const oldEnding=restore(serialize(completed));assert.equal(oldEnding.ending,ending);assert.equal(oldEnding.exposure,83);
  }
  for(const file of [null,{secured:['ledger','ledger']},{secured:['unknown']},{secured:'ledger'}])assert.equal(restore(serialize({...s,caseFile:file})),null);
});
