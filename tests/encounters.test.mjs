import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, move, chooseFieldEncounter, continueFieldEncounter, restore, serialize, startShift, beginDebrief, getQuestion, answer, inspect, FIELD_SITES } from '../docs/engine.js';
import { ENCOUNTERS, currentEncounter, encounterAfterStep, freshFieldEvents } from '../docs/encounters.js';
import { FieldMap } from '../docs/field-ui.js';
import { planFieldRoute } from '../docs/field.js';
import { encounterMarkup, notebookMarkup } from '../docs/art.js';
// These fixtures exercise the original scenes and their legacy save behavior.
const field=()=>({...createGame('story',42),phase:'field',entered:true,departure:'chosen',fieldEvents:freshFieldEvents()});
function trigger(s,id){const event=ENCOUNTERS.find(e=>e.id===id);s.shift=event.night;s.fieldSteps=event.step;s.player={x:4,y:4};s.fieldEvents.seen=ENCOUNTERS.filter(e=>e.night<s.shift||(e.night===s.shift&&e.step<event.step)).map(e=>e.id);assert.equal(encounterAfterStep(s),true);return currentEncounter(s);}

test('a real walk stops for an encounter, blocks movement, and resumes at the same position after reload',()=>{
  let s=field();const c=Object.assign(Object.create(FieldMap.prototype),{selected:'pump',style:'quiet',travel:null,lastKey:''});
  assert.equal(c.start(s),true);
  for(let i=0;i<3;i++)c.tick(s,.4,(dx,dy)=>move(s,dx,dy),()=>assert.fail('not at landmark yet'));
  assert.equal(s.fieldSteps,3);assert.equal(s.fieldEvents.pending.id,'first-call');assert.ok(c.travel);
  const position={...s.player},exposure=s.exposure;
  assert.equal(move(s,0,-1),false);assert.equal(inspect(s),null);assert.equal(beginDebrief(s),false);assert.equal(continueFieldEncounter(s),false);
  s=restore(serialize(s));assert.ok(s);assert.deepEqual(s.player,position);assert.equal(s.fieldEvents.journey.destination,'pump');
  assert.equal(chooseFieldEncounter(s,'record'),true);assert.equal(s.exposure,exposure+5);assert.equal(s.fieldEvents.journal.length,1);
  s=restore(serialize(s));assert.ok(s);assert.equal(chooseFieldEncounter(s,'record'),false);assert.equal(s.exposure,exposure+5);
  assert.equal(continueFieldEncounter(s),true);c.stop();assert.equal(c.start(s),true);
  let arrived=0;for(let i=0;i<4;i++)c.tick(s,.4,(dx,dy)=>move(s,dx,dy),()=>{arrived++;inspect(s);});
  assert.equal(arrived,1);assert.ok(s.evidence.includes('ledger'));assert.equal(s.fieldEvents.journal.length,1);assert.equal(s.fieldEvents.journey,null);
});

test('all twelve encounters have distinct beats, safe choices, and deterministic outcomes',()=>{
  assert.equal(new Set(ENCOUNTERS.map(e=>e.id)).size,12);
  for(const event of ENCOUNTERS)for(const option of event.choices){
    const s=field();s.exposure=20;
    if(option.requires)s.fieldEvents.flags.push(option.requires);
    trigger(s,event.id);const before=s.exposure;
    assert.ok(currentEncounter(s).choices.some(c=>c.id===option.id));
    assert.equal(chooseFieldEncounter(s,option.id),true);assert.equal(s.exposure,before+option.delta);
    assert.equal(s.fieldEvents.journal[0].choice,option.id);assert.ok(restore(serialize(s)));
    if(option.flag)assert.ok(s.fieldEvents.flags.includes(option.flag));
    const spent=s.exposure;assert.equal(chooseFieldEncounter(s,option.id),false);assert.equal(s.exposure,spent);
    assert.equal(continueFieldEncounter(s),true);assert.equal(encounterAfterStep(s),false);
  }
  for(const e of ENCOUNTERS){assert.equal(e.choices[0].delta,0);assert.equal(e.choices[0].requires,null);}
});

test('early recordings, twine, and compass unlock useful choices on later nights',()=>{
  for(const [first,choice,next,unlocked] of [['first-call','record','second-call','compare'],['paired-tracks','mark','root-knot','twine'],['unattended-lamp','search','moved-crossing','compass']]) {
    const s=field();trigger(s,next);assert.ok(!currentEncounter(s).choices.some(c=>c.id===unlocked));assert.equal(chooseFieldEncounter(s,unlocked),false);
    s.fieldEvents=freshFieldEvents();trigger(s,first);chooseFieldEncounter(s,choice);continueFieldEncounter(s);
    s.phase='briefing';startShift(s);s.phase='field';trigger(s,next);
    assert.ok(currentEncounter(s).choices.some(c=>c.id===unlocked));
    s.exposure=12;chooseFieldEncounter(s,unlocked);assert.ok(s.exposure<12);
  }
  const s=field();trigger(s,'first-call');chooseFieldEncounter(s,'answer');continueFieldEncounter(s);trigger(s,'second-call');assert.match(currentEncounter(s).text,/question you asked/);
});

test('a costly choice can transform the investigator cleanly; calming choices never produce negative exposure',()=>{
  const s=field();s.exposure=98;trigger(s,'first-call');assert.match(encounterMarkup(s),/reaches 100/);
  assert.equal(chooseFieldEncounter(s,'record'),true);assert.equal(s.phase,'rogue');assert.equal(s.rogue.route,'corn');assert.equal(s.fieldEvents.pending,null);assert.ok(restore(serialize(s)));
  const calm=field();trigger(calm,'extra-step');calm.exposure=1;chooseFieldEncounter(calm,'listen');assert.equal(calm.exposure,0);assert.equal(calm.fieldEvents.journal[0].delta,-1);
});

test('legacy saves migrate without a backlog of missed encounters, and malformed encounter saves are rejected',()=>{
  const old=field();old.shift=1;old.fieldSteps=12;delete old.fieldEvents;
  const s=restore(serialize(old));assert.ok(s);assert.deepEqual(s.fieldEvents.seen,ENCOUNTERS.filter(e=>e.night===0||(e.night===1&&e.step<=12)).map(e=>e.id));assert.equal(encounterAfterStep(s),false);
  const pending=field();trigger(pending,'first-call');
  for(const patch of [{seen:['bogus']},{seen:['first-call','first-call']},{flags:['bogus']},{pending:{id:'first-call',choice:'missing',x:4,y:4}},{pending:{id:'first-call',choice:'record',x:4,y:4}},{pending:{id:'first-call',choice:null,x:8,y:8}},{journey:{destination:'bogus',style:'quiet'}},{journal:[{}]}])assert.equal(restore(serialize({...pending,fieldEvents:{...pending.fieldEvents,...patch}})),null);
  chooseFieldEncounter(pending,'record');pending.fieldEvents.pending.choice=null;
  assert.equal(restore(serialize(pending)),null,'a resolved encounter cannot be restored as an unmade choice');
});

test('the notebook and debrief reveal only encounters actually resolved by the player',()=>{
  const s=field();assert.doesNotMatch(notebookMarkup(s),/Between the rows/);
  trigger(s,'first-call');assert.doesNotMatch(notebookMarkup(s),/Your voice. From the soil/);
  chooseFieldEncounter(s,'record');continueFieldEncounter(s);
  const notebook=notebookMarkup(s);assert.match(notebook,/Your voice. From the soil/);assert.match(notebook,/keep the tape in your recorder/);assert.doesNotMatch(notebook,/Tomorrow’s interview/);
  s.phase='debrief';s.question=1;assert.match(getQuestion(s).options.find(o=>o.id==='field-notes').label,/radio in the soil/);
  answer(s,'field-notes');assert.match(s.reports.at(-1).answer,/radio in the soil/);
});

test('complete campaigns encounter all twelve beats without repeats, in both walking styles and intensities',()=>{
  for(const mode of ['story','hard'])for(const style of ['quiet','direct']){
    const s=field();s.mode=mode;
    for(let night=0;night<3;night++){
      for(const id of ['pump','corner','drain','tower']){
        const destination=FIELD_SITES.find(p=>p.id===id),route=planFieldRoute(s,destination,style);
        for(const p of route.steps){assert.equal(move(s,p.x-s.player.x,p.y-s.player.y),true);if(s.fieldEvents.pending){chooseFieldEncounter(s,currentEncounter(s).choices[0].id);continueFieldEncounter(s);}}
        if(id!=='tower')assert.ok(inspect(s));
      }
      assert.equal(beginDebrief(s),true);answer(s,'truth');answer(s,'field-notes');answer(s,'sign');
      if(night<2){startShift(s);s.phase='field';s.entered=true;}
    }
    assert.equal(s.ending,'dissent');assert.equal(s.fieldEvents.journal.length,12);assert.equal(new Set(s.fieldEvents.journal.map(j=>j.id)).size,12);assert.equal(s.evidence.length,9);assert.ok(restore(serialize(s)));
  }
});
