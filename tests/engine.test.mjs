import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame,startShift,advance,shoot,reload,enterField,move,inspect,beginDebrief,answer,getQuestion,restore,serialize,SHIFT_LENGTH,focusNext,ENDINGS } from '../docs/engine.js';

const watch=mode=>{const s=createGame(mode,42);startShift(s);return s;};
function safeWatch(s){while(s.phase==='tower'){advance(s,.25);for(const t of [...s.targets]){if(t.kind!=='corn')continue;if(!s.rounds){reload(s);break;}shoot(s,t.x,t.y-34);}if(s.rounds<2)reload(s);}}
function walkTo(s,x,y){while(s.phase==='field'&&s.player.x!==x)move(s,Math.sign(x-s.player.x),0);while(s.phase==='field'&&s.player.y!==y)move(s,0,Math.sign(y-s.player.y));}
function report(s,choice='comply'){beginDebrief(s);answer(s,choice);answer(s,'evidence');answer(s,s.shift===2?'sign':'question');if(s.phase==='debrief'&&s.question===3)answer(s,'return');}

test('game starts with briefing, and a shift resets its supplies',()=>{const s=createGame();assert.equal(s.phase,'briefing');startShift(s);assert.equal(s.rounds,6);assert.equal(s.phase,'tower');assert.equal(startShift(s),false);});
test('targets spawn deterministically from a seed',()=>{const a=watch(),b=watch();advance(a,8);advance(b,8);assert.deepEqual(a.targets,b.targets);assert.ok(a.targets.length);});
test('a crop hit consumes a round and removes only that target',()=>{const s=watch();advance(s,4);const t=s.targets[0];assert.equal(shoot(s,t.x,t.y-34),'hit');assert.equal(s.kills,1);assert.equal(s.rounds,5);assert.equal(s.targets.length,0);});
test('a miss consumes ammunition',()=>{const s=watch();assert.equal(shoot(s,0,0),'miss');assert.equal(s.rounds,5);assert.equal(s.shots,1);});
test('touch hit padding makes small-screen targets easier without changing mouse aiming',()=>{const a=watch(),b=watch();advance(a,4);advance(b,4);const t=a.targets[0];assert.equal(shoot(a,t.x+40,t.y-34),'miss');assert.equal(shoot(b,t.x+40,t.y-34,30),'hit');});
test('reload takes time, blocks shots, and draws from reserve',()=>{const s=watch();shoot(s,0,0);reload(s);assert.equal(shoot(s,0,0),'blocked');advance(s,1);assert.equal(s.rounds,5);advance(s,1);assert.equal(s.rounds,6);assert.equal(s.reserve,23);});
test('empty rifle cannot fire and insufficient reserve gives a partial reload',()=>{const s=watch();s.rounds=0;s.reserve=2;assert.equal(shoot(s,0,0),'empty');reload(s);advance(s,2);assert.equal(s.rounds,2);assert.equal(s.reserve,0);assert.equal(reload(s),false);});
test('human sighting opens investigation and firing on it has consequences',()=>{const s=watch();advance(s,13);const t=s.targets.find(t=>t.kind==='person');assert.ok(t);assert.equal(s.incident,true);assert.equal(shoot(s,t.x,t.y-34),'person');assert.equal(s.kills,0);assert.equal(s.exposure,14);assert.ok(s.searched.includes('figure-shot'));});
test('keyboard target selection excludes humans',()=>{const s=watch();advance(s,13);focusNext(s);assert.equal(s.targets.find(t=>t.id===s.focused).kind,'corn');});
test('investigation is unavailable before the sighting',()=>{const s=watch();assert.equal(enterField(s),false);});
test('abandoning the post counts remaining mobile crops as breaches',()=>{const s=watch();advance(s,13);const n=s.targets.filter(t=>t.kind==='corn').length;enterField(s);assert.equal(s.phase,'field');assert.equal(s.breaches,n);});
test('six total breaches end the assignment',()=>{const s=watch();s.breaches=5;s.targets=[{id:1,kind:'corn',x:895,y:400,direction:1,speed:20,wobble:0}];advance(s,.1);assert.equal(s.phase,'ending');assert.equal(s.ending,'breach');});
test('a defended watch reaches relief, which permits a safe departure',()=>{const s=watch();safeWatch(s);assert.equal(s.phase,'decision');assert.equal(s.breaches,0);enterField(s);assert.equal(s.breaches,0);assert.equal(s.phase,'field');});
test('all three standard shifts are defendable with supplied ammunition',()=>{const s=watch();for(let i=0;i<3;i++){safeWatch(s);assert.equal(s.phase,'decision');assert.equal(s.breaches,0);report(s);if(s.phase==='briefing')startShift(s);}assert.equal(s.phase,'ending');});
test('movement is bounded, cardinal, and costs exposure',()=>{const s=watch();advance(s,13);enterField(s);assert.equal(move(s,-1,0),true);assert.equal(move(s,-1,0),false);assert.equal(move(s,1,1),false);assert.ok(s.exposure>0);});
test('exhibits require reaching their location, and cannot be duplicated',()=>{const s=watch('story');safeWatch(s);enterField(s);assert.equal(inspect(s),null);walkTo(s,3,3);assert.equal(inspect(s),'ledger');assert.equal(inspect(s),null);assert.deepEqual(s.evidence,['ledger']);assert.equal(beginDebrief(s),false);walkTo(s,1,7);assert.equal(beginDebrief(s),true);});
test('exposure ends the investigation at 100',()=>{const s=watch();advance(s,13);enterField(s);s.exposure=99.5;move(s,1,0);assert.equal(s.ending,'assimilation');});
test('story mode lowers crop speed and exploration costs',()=>{const a=watch('standard'),b=watch('story');advance(a,4);advance(b,4);assert.ok(b.targets[0].speed<a.targets[0].speed);advance(a,9);advance(b,9);enterField(a);enterField(b);move(a,1,0);move(b,1,0);assert.ok(b.exposure<a.exposure);});
test('debrief reports reflect actual findings',()=>{const s=watch();safeWatch(s);beginDebrief(s);answer(s,'truth');assert.match(getQuestion(s).options[0].label,/did not reach/);s.evidence.push('dress');assert.match(getQuestion(s).options[0].label,/white fabric/i);});
test('invalid or locked responses cannot advance a debrief',()=>{const s=createGame();s.phase='debrief';s.shift=2;s.question=2;assert.equal(answer(s,'bogus'),false);assert.equal(answer(s,'expose'),false);assert.equal(s.question,2);});
test('evidence ending requires both quantity and treatment evidence',()=>{const s=createGame();s.phase='debrief';s.shift=2;s.question=2;s.evidence=['dress','badge','teeth'];assert.equal(answer(s,'expose'),false);s.evidence.push('ledger');assert.equal(answer(s,'expose'),true);assert.equal(s.ending,'witness');});
test('a full investigation route can retain treatment evidence and reach the witness ending',()=>{const s=watch();for(let i=0;i<3;i++){safeWatch(s);enterField(s);if(i===0){walkTo(s,3,3);inspect(s);}walkTo(s,9,1);inspect(s);walkTo(s,1,7);beginDebrief(s);answer(s,'truth');answer(s,'evidence');answer(s,i===2?'expose':'question');if(s.phase==='debrief'&&s.question===3)answer(s,'return');if(s.phase==='briefing')startShift(s);}assert.equal(s.ending,'witness');assert.ok(s.exposure<100);});
test('final choices and prior testimony reach distinct endings',()=>{for(const [choice,honesty,ending]of[['guide',0,'guide'],['sign',0,'compliance'],['sign',3,'dissent']]){const s=createGame();Object.assign(s,{phase:'debrief',shift:2,question:2,honesty});answer(s,choice);assert.equal(s.ending,ending);}assert.equal(Object.keys(ENDINGS).length,6);});
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
