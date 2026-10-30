import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame,startShift,advance,shoot,reload,enterField,move,inspect,beginDebrief,answer,getQuestion,restore,serialize,SHIFT_LENGTH,COMPULSION_NOTICE,focusNext,ENDINGS,EVIDENCE,investigationUrge,investigationPressure, canEatCrop, eatCrop, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';

import { currentEncounter } from '../docs/encounters.js';
function settle(s){if(s.fieldEvents.pending){chooseFieldEncounter(s,currentEncounter(s).choices[0].id);continueFieldEncounter(s);}}
function walkStep(s,dx,dy){settle(s);const result=move(s,dx,dy);settle(s);return result;}

const watch=mode=>{const s=createGame(mode,42);startShift(s);return s;};
function safeWatch(s){while(s.phase==='tower'){advance(s,.25);for(const t of [...s.targets]){if(t.kind!=='corn')continue;if(!s.rounds){reload(s);break;}shoot(s,t.x,t.y-34);}if(s.rounds<2)reload(s);}}
function walkTo(s,x,y){while(s.phase==='field'&&s.player.x!==x)walkStep(s,Math.sign(x-s.player.x),0);while(s.phase==='field'&&s.player.y!==y)walkStep(s,0,Math.sign(y-s.player.y));}
function investigateAll(s){for(const [x,y] of [[3,3],[9,1],[7,5]]){walkTo(s,x,y);inspect(s);}walkTo(s,1,7);}
function report(s,choice='comply'){if(s.phase==='field'&&!['corner','pump','drain'].every(id=>s.inspected.includes(id)))investigateAll(s);beginDebrief(s);answer(s,choice);answer(s,'evidence');answer(s,s.shift===2?'sign':'question');if(s.phase==='debrief'&&s.question===3)answer(s,'return');}

test('game starts with briefing, and a shift resets its supplies',()=>{const s=createGame();assert.equal(s.phase,'briefing');startShift(s);assert.equal(s.rounds,6);assert.equal(s.phase,'tower');assert.equal(startShift(s),false);});
test('targets spawn deterministically from a seed',()=>{const a=watch(),b=watch();advance(a,8);advance(b,8);assert.deepEqual(a.targets,b.targets);assert.ok(a.targets.length);});
test('a crop hit consumes a round and removes only that target',()=>{const s=watch();advance(s,4);const t=s.targets[0];assert.equal(shoot(s,t.x,t.y-34),'hit');assert.equal(s.kills,1);assert.equal(s.rounds,5);assert.equal(s.targets.length,0);});
test('a miss consumes ammunition',()=>{const s=watch();assert.equal(shoot(s,0,0),'miss');assert.equal(s.rounds,5);assert.equal(s.shots,1);});
test('touch hit padding makes small-screen targets easier without changing mouse aiming',()=>{const a=watch(),b=watch();advance(a,4);advance(b,4);const t=a.targets[0];assert.equal(shoot(a,t.x+40,t.y-34),'miss');assert.equal(shoot(b,t.x+40,t.y-34,30),'hit');});
test('reload takes time, blocks shots, and draws from reserve',()=>{const s=watch();shoot(s,0,0);reload(s);assert.equal(shoot(s,0,0),'blocked');advance(s,1);assert.equal(s.rounds,5);advance(s,1);assert.equal(s.rounds,6);assert.equal(s.reserve,23);});
test('empty rifle cannot fire and insufficient reserve gives a partial reload',()=>{const s=watch();s.rounds=0;s.reserve=2;assert.equal(shoot(s,0,0),'empty');reload(s);advance(s,2);assert.equal(s.rounds,2);assert.equal(s.reserve,0);assert.equal(reload(s),false);});
test('human sightings remain unharmed by mouse and touch shots',()=>{for(const padding of [0,30]){const s=watch();advance(s,13);const t=s.targets.find(t=>t.kind==='person');assert.ok(t);assert.equal(s.incident,true);assert.equal(shoot(s,t.x,t.y-34,padding),'miss');assert.ok(s.targets.includes(t));assert.equal(s.kills,0);assert.equal(s.exposure,0);assert.equal(s.trust,0);assert.equal(s.rounds,5);assert.equal(s.searched.includes('figure-shot'),false);}});
test('human sightings do not shield overlapping corn from shots',()=>{const s=watch();s.targets=[{id:1,kind:'corn',x:500,y:350},{id:2,kind:'person',x:500,y:350}];assert.equal(shoot(s,500,316),'hit');assert.equal(s.kills,1);assert.deepEqual(s.targets.map(t=>t.kind),['person']);});
test('keyboard target selection excludes humans',()=>{const s=watch();advance(s,13);focusNext(s);assert.equal(s.targets.find(t=>t.id===s.focused).kind,'corn');});
test('investigation is unavailable before the sighting',()=>{const s=watch();assert.equal(enterField(s),false);});
test('abandoning the post counts remaining mobile crops as breaches',()=>{const s=watch();advance(s,13);const n=s.targets.filter(t=>t.kind==='corn').length;enterField(s);assert.equal(s.phase,'field');assert.equal(s.breaches,n);});
test('six total breaches end the assignment',()=>{const s=watch();s.breaches=5;s.targets=[{id:1,kind:'corn',x:895,y:400,direction:1,speed:20,wobble:0}];advance(s,.1);assert.equal(s.phase,'ending');assert.equal(s.ending,'breach');});
test('holding the post enters the map immediately with a saved notice and no abandonment penalty',()=>{
  for(let shift=0;shift<3;shift++){
    const s=watch();s.shift=shift;safeWatch(s);
    assert.equal(s.phase,'field');assert.equal(s.departure,'compelled');
    assert.equal(s.entered,true);assert.equal(s.compulsionNotice,true);assert.equal(s.breaches,0);
    assert.equal(s.log[0].message,COMPULSION_NOTICE);
    assert.equal(shoot(s,0,0),'blocked');assert.equal(beginDebrief(s),false);
    const resumed=restore(serialize(s));assert.deepEqual(resumed,s);
    advance(resumed,20);assert.deepEqual(resumed,s);
    assert.equal(enterField(resumed),false);assert.equal(move(resumed,1,0),true);
    assert.equal(resumed.breaches,0);
  }
});
test('all three Story shifts are defendable with supplied ammunition',()=>{const s=watch();for(let i=0;i<3;i++){safeWatch(s);assert.equal(s.phase,'field');assert.equal(s.breaches,0);report(s);if(s.phase==='briefing')startShift(s);}assert.equal(s.phase,'ending');});
test('movement is bounded, cardinal, and costs exposure',()=>{const s=watch();advance(s,13);enterField(s);assert.equal(move(s,-1,0),true);assert.equal(move(s,-1,0),false);assert.equal(move(s,1,1),false);assert.ok(s.exposure>0);});
test('exhibits require reaching their location, and cannot be duplicated',()=>{const s=watch('story');safeWatch(s);enterField(s);assert.equal(inspect(s),null);walkTo(s,3,3);assert.equal(inspect(s),'ledger');assert.equal(inspect(s),null);assert.deepEqual(s.evidence,['ledger']);assert.equal(beginDebrief(s),false);walkTo(s,1,7);assert.equal(beginDebrief(s),false);investigateAll(s);assert.equal(beginDebrief(s),true);});
test('exposure ends the investigation at 100',()=>{const s=watch();advance(s,13);enterField(s);s.exposure=99.5;move(s,1,0);assert.equal(s.ending,'assimilation');});
test('Hard mode raises crop speed and exploration costs above Story',()=>{const a=watch('hard'),b=watch('story');advance(a,4);advance(b,4);assert.ok(b.targets[0].speed<a.targets[0].speed);advance(a,9);advance(b,9);enterField(a);enterField(b);move(a,1,0);move(b,1,0);assert.ok(b.exposure<a.exposure);});
test('debrief reports reflect actual findings',()=>{const s=watch();safeWatch(s);s.phase='debrief';answer(s,'truth');assert.match(getQuestion(s).options[0].label,/did not recover/);s.evidence.push('dress');assert.match(getQuestion(s).options[0].label,/white fabric/i);});
test('invalid or locked responses cannot advance a debrief',()=>{const s=createGame();s.phase='debrief';s.shift=2;s.question=2;assert.equal(answer(s,'bogus'),false);assert.equal(answer(s,'expose'),false);assert.equal(s.question,2);});
test('notebook quantity alone never unlocks the outside case',()=>{const s=createGame();Object.assign(s,{phase:'debrief',shift:2,question:2,evidence:Object.keys(EVIDENCE)});assert.equal(answer(s,'expose'),false);assert.equal(s.phase,'debrief');});
test('collecting all exhibits and objecting still requires the field recordings',()=>{const s=watch();for(let i=0;i<3;i++){safeWatch(s);investigateAll(s);assert.equal(s.fieldSteps,28);assert.equal(beginDebrief(s),true);answer(s,'truth');answer(s,'evidence');answer(s,i===2?'expose':'question');if(s.phase==='debrief'&&s.question===3)answer(s,'return');if(s.phase==='briefing')startShift(s);}assert.equal(s.phase,'debrief');assert.equal(s.ending,null);assert.equal(s.evidence.length,9);assert.ok(Math.abs(s.exposure-53.97)<.001);});
test('final choices and prior testimony reach distinct endings',()=>{for(const [choice,honesty,ending]of[['sign',0,'compliance'],['sign',3,'dissent']]){const s=createGame();Object.assign(s,{phase:'debrief',shift:2,question:2,honesty});answer(s,choice);assert.equal(s.ending,ending);}assert.equal(Object.keys(ENDINGS).length,9);});
test('save and restore preserve a live shift without losing targets',()=>{const s=watch();advance(s,13);assert.deepEqual(restore(serialize(s)),s);});
test('corrupt, outdated and structurally invalid saves are rejected',()=>{for(const raw of ['nope','null','{}','{"version":99}'])assert.equal(restore(raw),null);for(const patch of [{shift:8},{targets:[{}]},{player:{x:99,y:0}},{evidence:['unknown']},{phase:'ending',ending:'bogus'},{rounds:-3}])assert.equal(restore(JSON.stringify({...createGame(),...patch})),null);});
test('simulation does not advance a paused narrative phase or accept invalid elapsed time',()=>{const s=createGame();advance(s,30);assert.equal(s.time,0);startShift(s);advance(s,NaN);advance(s,-1);assert.equal(s.time,0);});


test('interviews follow disclosure choices across every shift and investigation route', () => {
  for (let shift = 0; shift < 3; shift++) {
    for (const entered of [false, true]) {
      for (const disclosure of ['truth', 'comply']) {
        for (const finding of ['evidence', 'redact']) {
          const s = createGame();
          Object.assign(s, { phase: 'debrief', shift, entered, incident: true });
          if (entered) { s.searched.push(`shift-${shift}`); s.evidence.push(['dress', 'badge', 'teeth'][shift]); }
          answer(s, disclosure);
          const followup = getQuestion(s);
          assert.match(followup.prompt, disclosure === 'comply' ? /perimeter check|Routine movement/ : entered ? /went in/ : /stayed in the tower/);
          answer(s, finding);
          const closing = getQuestion(s);
          assert.match(closing.prompt, finding === 'redact' ? /no unusual findings/ : entered ? /noted your description/ : /could not establish/);
          assert.match(closing.prompt, shift < 2 ? /Will you sign/ : /another search/);
          const resumed = restore(serialize(s));
          assert.deepEqual(getQuestion(resumed), closing);
          if (shift === 2 && !entered) assert.match(closing.options.find(o => o.id === 'guide').label, /help search/);
        }
      }
    }
  }
});

test('treatment objections introduce the private evidence before asking about it', () => {
  for (const [evidence, wording] of [['ledger', /found a treatment ledger/], ['sample', /found a sealed sample/]]) {
    const s = createGame();
    Object.assign(s, { phase: 'debrief', question: 2, evidence: [evidence] });
    assert.match(getQuestion(s).options[0].label, wording);
    assert.doesNotMatch(getQuestion(s).prompt, /suggesting the treatment/);
  }
});


test('objections receive a dismissive reply before the player leaves, including after resume', () => {
  for (const evidence of [[], ['ledger'], ['sample']]) {
    for (const shift of [0, 1]) {
      const s = createGame();
      Object.assign(s, { phase: 'debrief', shift, question: 2, evidence });
      answer(s, 'question');
      assert.equal(s.phase, 'debrief');
      assert.equal(s.shift, shift);
      assert.equal(s.question, 3);
      assert.match(getQuestion(s).prompt, evidence.length ? /Do you need to know that to do your job/ : /Closing the field is not your decision/);
      assert.match(getQuestion(s).context, /before you can answer/);
      const resumed = restore(serialize(s));
      assert.deepEqual(getQuestion(resumed), getQuestion(s));
      const honesty = resumed.honesty;
      assert.equal(answer(resumed, 'question'), false);
      assert.equal(answer(resumed, 'return'), true);
      assert.equal(resumed.phase, 'briefing');
      assert.equal(resumed.shift, shift + 1);
      assert.equal(resumed.honesty, honesty);
      assert.equal(resumed.reports.length, 1);
      assert.equal(answer(resumed, 'return'), false);
    }
  }
});

test('accepting the report still closes the interview directly', () => {
  const s = createGame();
  Object.assign(s, { phase: 'debrief', question: 2 });
  answer(s, 'sign');
  assert.equal(s.phase, 'briefing');
  assert.equal(s.shift, 1);
});


test('field notes never name exhibits before or during their discovery', () => {
  for (let shift = 0; shift < 3; shift++) {
    for (const [x, y] of [[9, 1], [3, 3], [7, 5]]) {
      const s = watch('story');
      s.shift = shift;
      safeWatch(s);
      enterField(s);
      walkTo(s, x, y);
      assert.equal(s.evidence.length, 0);
      for (const exhibit of Object.values(EVIDENCE)) {
        assert.ok(s.log.every(entry => !entry.message.includes(exhibit.title)));
      }
      const id = inspect(s);
      assert.ok(id);
      assert.ok(s.evidence.includes(id));
      assert.equal(s.log[0].message, 'Private observation saved. Open your notebook to read it.');
      assert.ok(!s.log[0].message.includes(EVIDENCE[id].title));
    }
  }
});

test('older saves replace exhibit-title receipts without losing evidence or other notes', () => {
  const s = createGame();
  s.evidence = ['roots'];
  s.log = [
    { message: 'Connected roots entered in your private notebook.', tone: 'story', at: 12 },
    { message: 'Your radio stays silent.', tone: 'story', at: 5 }
  ];
  const resumed = restore(serialize(s));
  assert.deepEqual(resumed.evidence, ['roots']);
  assert.equal(resumed.log[0].message, 'Private observation saved. Open your notebook to read it.');
  assert.equal(resumed.log[0].at, 12);
  assert.deepEqual(resumed.log[1], s.log[1]);
});


test('every completed watch requires all three inspections before debrief',()=>{
  const s=watch();
  assert.equal(beginDebrief(s),false);
  safeWatch(s);
  assert.equal(s.phase,'field');assert.equal(s.entered,true);
  assert.equal(beginDebrief(s),false);
  move(s,1,0);move(s,-1,0);assert.equal(beginDebrief(s),false);
  walkTo(s,3,3);inspect(s);assert.equal(beginDebrief(s),false);
  walkTo(s,1,7);assert.equal(beginDebrief(s),false);
  walkTo(s,9,1);inspect(s);walkTo(s,1,7);assert.equal(beginDebrief(s),false);
  walkTo(s,7,5);inspect(s);walkTo(s,1,7);assert.equal(beginDebrief(s),true);
});
test('old end-of-watch saves skip the removed scene and resume on the map',()=>{
  const s=createGame();Object.assign(s,{phase:'decision',incident:true,time:SHIFT_LENGTH});
  const resumed=restore(serialize(s));assert.equal(resumed.phase,'field');assert.equal(resumed.departure,'compelled');assert.equal(resumed.compulsionNotice,true);assert.equal(beginDebrief(resumed),false);assert.equal(resumed.entered,true);
});


test('required nightly routes remain survivable in both modes, while detours can exhaust exposure',()=>{
  for(const mode of ['story','hard']){
    const s=watch(mode);
    for(let night=0;night<3;night++){safeWatch(s);investigateAll(s);assert.equal(s.phase,'field');report(s,'truth');if(s.phase==='briefing')startShift(s);}
    assert.equal(s.phase,'ending');assert.notEqual(s.ending,'assimilation');
  }
  const s=watch();safeWatch(s);s.exposure=99.5;move(s,1,0);assert.equal(s.ending,'assimilation');
});


test('investigation compulsion grows only after the sighting and clears on departure',()=>{
  const s=watch();
  s.time=30;assert.equal(investigationUrge(s),0);
  s.incident=true;s.time=12;assert.equal(investigationUrge(s),0);
  s.time=13;const first=investigationUrge(s);assert.ok(first>=.22);
  s.time=35;assert.ok(investigationUrge(s)>first);
  s.time=52;assert.equal(investigationUrge(s),1);
  assert.equal(investigationUrge(restore(serialize(s))),1);
  enterField(s);assert.equal(investigationUrge(s),0);
});


test('boiling corn requires inspecting the pump house and eating reaches a saved distinct ending',()=>{
  const s=watch('story');
  assert.equal(eatCrop(s),false);
  safeWatch(s);walkTo(s,3,3);
  assert.equal(canEatCrop(s),false);inspect(s);
  const resumed=restore(serialize(s));
  assert.equal(canEatCrop(resumed),true);
  move(resumed,1,0);assert.equal(eatCrop(resumed),false);
  move(resumed,-1,0);assert.equal(eatCrop(resumed),true);
  assert.equal(resumed.phase,'ending');assert.equal(resumed.ending,'consumption');
  assert.equal(restore(serialize(resumed)).ending,'consumption');
  assert.equal(eatCrop(resumed),false);
  assert.equal(s.phase,'field');assert.equal(s.ending,null);
});


test('intrusive thoughts escalate while remaining gated by the sighting and tower phase',()=>{
  const s=watch();assert.equal(investigationPressure(s),null);
  s.incident=true;
  const stages=[13,26,38,49].map(time=>{s.time=time;return investigationPressure(s);});
  assert.deepEqual(stages.map(p=>p.stage),[0,1,2,3]);
  for(let i=1;i<stages.length;i++)assert.ok(stages[i].strength>stages[i-1].strength);
  for(const phase of ['briefing','decision','field','debrief','guide','ending']){s.phase=phase;assert.equal(investigationPressure(s),null);}
});

test('voluntary departure and compulsion remain distinct through testimony, saves and next shift',()=>{
  for(const compelled of [false,true]){
    const s=watch();
    if(compelled)safeWatch(s);else advance(s,13);
    enterField(s);investigateAll(s);beginDebrief(s);
    assert.equal(s.departure,compelled?'compelled':'chosen');assert.equal(s.compulsionNotice,false);
    const resumed=restore(serialize(s));const q=getQuestion(resumed);
    if(compelled)assert.match(q.options[0].label,/deciding to stay. Then I was on the ladder/);
    else assert.match(q.options[0].label,/went into the field to investigate/);
    answer(resumed,'truth');assert.equal(resumed.reports[0].answer,q.options[0].label);
    if(compelled)assert.match(getQuestion(resumed).prompt,/I will record/);
    answer(resumed,'evidence');answer(resumed,'sign');startShift(resumed);
    assert.equal(resumed.departure,null);assert.equal(investigationPressure(resumed),null);
  }
  const legacy=watch();advance(legacy,13);enterField(legacy);delete legacy.departure;
  assert.equal(restore(serialize(legacy)).departure,'chosen');
  legacy.time=SHIFT_LENGTH;assert.equal(restore(serialize(legacy)).departure,'compelled');
  legacy.departure='unknown';assert.equal(restore(serialize(legacy)),null);
});


test('existing field saves do not replay the new arrival notice',()=>{
  const s=watch();safeWatch(s);delete s.compulsionNotice;
  assert.equal(restore(serialize(s)).compulsionNotice,false);
  s.compulsionNotice='yes';assert.equal(restore(serialize(s)),null);
  const chosen=watch();advance(chosen,13);enterField(chosen);assert.equal(chosen.compulsionNotice,false);
});
