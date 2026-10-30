import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { sightingPromptReady } from '../docs/watch-story.js';
import { readFileSync } from 'node:fs';
import { createGame, answer, advance, restore, serialize, getEnding, BRIEFINGS, ENDINGS, enterField, inspect } from '../docs/engine.js';
import { guideTravel, guideRouteStatus, inspectGuide, focusGuide, fireGuide, spareGuide, guideWall, projectGuide, isGuideAftermath, guideDebrief, answerGuideDebrief } from '../docs/guide.js';
function begin(){const s=createGame('story',123);Object.assign(s,{phase:'debrief',shift:2,question:2});answer(s,'guide');return s;}
function walkToClue(s){
  assert.equal(guideTravel(s),true);
  for(let frame=0;frame<300&&!guideRouteStatus(s).ready;frame++){
    advance(s,.1);
    assert.equal(guideWall(s.guide.x,s.guide.y),false,'The authored walk stays in the open rows.');
  }
  const status=guideRouteStatus(s);
  assert.equal(status.ready,true,'The walk reaches the next discovery without steering.');
  assert.equal(status.walking,false);
  assert.equal(status.progress,1);
  assert.equal(status.remaining,0);
  assert.equal(guideWall(s.guide.x+Math.cos(s.guide.angle),s.guide.y+Math.sin(s.guide.angle)),false,'The stopped camera faces an open row.');
  return status.site;
}
function explore(){
  const s=begin();
  for(const id of ['boot','radio','corner']){
    assert.equal(walkToClue(s).id,id);
    assert.equal(inspectGuide(s).id,id);
  }
  advance(s,.7);
  return s;
}
function finishDebrief(s){
  assert.equal(s.phase,'guide');assert.equal(s.guide.stage,'debrief');
  const before=s.reports.length;
  for(let question=0;question<2;question++){
    const interview=guideDebrief(s);assert.ok(interview);
    assert.ok(interview.prompt);assert.ok(interview.context);assert.ok(interview.options.length>=2);
    assert.equal(answerGuideDebrief(s,interview.options[0].id),true);
  }
  assert.equal(s.phase,'ending');assert.equal(s.ending,'guide');
  assert.equal(s.reports.length,before+2,'The final interview is part of the saved transcript.');
  return s;
}
function hitNext(s){const p=focusGuide(s);assert.ok(p);assert.equal(fireGuide(s,p.x,p.y),'person');}
function waitForDebrief(s){for(let i=0;i<90&&s.guide.stage==='escape';i++)advance(s,1);assert.equal(s.guide.stage,'debrief');}
test('leading the team follows open rows and stops at discoveries in order',()=>{
  const s=begin();assert.equal(s.phase,'guide');assert.equal(s.ending,null);
  assert.equal(inspectGuide(s),null);assert.equal(s.guide.steps,0);
  assert.equal(guideWall(0,0),true);assert.equal(fireGuide(s,480,300),'blocked');
  for(const id of ['boot','radio']){
    assert.equal(walkToClue(s).id,id);
    assert.equal(guideTravel(s),false,'An unread discovery cannot be skipped.');
    const site=inspectGuide(s);assert.equal(site.id,id);
    assert.equal(inspectGuide(s),null,'A discovery cannot be counted twice.');
    const position=[s.guide.x,s.guide.y,s.guide.angle,s.guide.routeProgress];
    advance(s,1);advance(s,1);
    assert.deepEqual([s.guide.x,s.guide.y,s.guide.angle,s.guide.routeProgress],position);
    assert.equal(s.guide.message,site.text,'The discovery remains readable until the player leads onward.');
  }
  assert.equal(walkToClue(s).id,'corner');inspectGuide(s);
  assert.equal(s.guide.stage,'escape');assert.deepEqual(s.guide.clues,['boot','radio','corner']);
  assert.equal(s.guide.team.length,3);
  assert.ok(s.guide.team.every(t=>projectGuide(s.guide,t)),'The team is visible immediately, without any manual turn.');
  assert.equal(guideTravel(s),false,'The final choice cannot restart the walk.');
  assert.deepEqual(restore(serialize(s)),s);
});
test('the guided walk stops and resumes in place without losing progress',()=>{
  const s=begin();guideTravel(s);advance(s,.25);
  assert.ok(s.guide.routeProgress>0&&s.guide.routeProgress<2);
  assert.equal(guideTravel(s),true);assert.equal(guideRouteStatus(s).walking,false);
  const position=[s.guide.x,s.guide.y,s.guide.angle,s.guide.routeProgress];
  advance(s,1);
  assert.deepEqual([s.guide.x,s.guide.y,s.guide.angle,s.guide.routeProgress],position);
  assert.equal(walkToClue(s).id,'boot');
});
test('the final discovery cannot immediately carry into either irreversible rifle choice',()=>{
  const s=begin();
  for(const id of ['boot','radio','corner']){assert.equal(walkToClue(s).id,id);inspectGuide(s);}
  const aim=()=>focusGuide(s);
  let p=aim();assert.ok(p);
  assert.equal(fireGuide(s,p.x,p.y),'blocked');assert.equal(spareGuide(s),false);
  advance(s,.6);p=aim();assert.equal(fireGuide(s,p.x,p.y),'blocked');assert.equal(spareGuide(s),false);
  assert.equal(s.shots,0);assert.equal(s.guide.fired,0);
  assert.ok(s.guide.team.every(t=>t.status==='running'));
  advance(s,.05);
  const spared=structuredClone(s);assert.equal(spareGuide(spared),true);assert.equal(spared.phase,'guide');assert.equal(spared.guide.stage,'debrief');
  p=aim();assert.equal(fireGuide(s,p.x,p.y),'person');
  assert.equal(s.shots,1);assert.equal(s.guide.fired,1);
});
test('letting the team leave opens a recorded debrief before the ending',()=>{
  const s=explore();assert.equal(spareGuide(s),true);
  assert.equal(s.phase,'guide');assert.equal(s.guide.stage,'debrief');assert.equal(s.ending,null);
  assert.equal(s.guide.outcome,'spared');assert.equal(s.shots,0);
  assert.ok(s.guide.team.every(person=>person.status==='escaped'));
  finishDebrief(s);assert.equal(getEnding(s).stamp,'RECOVERY INCOMPLETE');
  assert.ok(getEnding(s).text.length>0);assert.equal(isGuideAftermath(s),false);
});
test('a first shot commits the encounter whether it hits or misses',()=>{
  for(const hit of [false,true]){
    const s=explore();if(hit)hitNext(s);else assert.equal(fireGuide(s,0,0),'miss');
    const roster=s.guide.team.map(person=>person.status);
    assert.equal(spareGuide(s),false,'The rifle cannot be voluntarily lowered after firing.');
    assert.deepEqual(s.guide.team.map(person=>person.status),roster);
    assert.equal(s.guide.fired,1);assert.equal(s.guide.stage,'escape');
  }
});
test('three hits lead to the department debrief and a completed written disposition',()=>{
  const s=explore();for(let i=0;i<3;i++)hitNext(s);
  assert.equal(s.phase,'guide');assert.equal(s.guide.stage,'debrief');assert.equal(s.guide.outcome,'secured');
  assert.equal(s.guide.fired,3);assert.equal(s.ending,null);
  finishDebrief(s);assert.equal(getEnding(s).stamp,'PERIMETER SECURED');
  assert.ok(getEnding(s).text.length>0);assert.equal(isGuideAftermath(s),false);
});
test('survivors cause arrest when ammunition runs out, including six misses',()=>{
  for(const hits of [0,1,2]){
    const s=explore();for(let i=0;i<hits;i++)hitNext(s);
    for(let i=hits;i<6;i++)assert.equal(fireGuide(s,0,0),'miss');
    assert.equal(s.guide.outcome,'arrested');assert.equal(s.guide.stage,'debrief');
    assert.equal(s.guide.fired,6);assert.equal(s.guide.team.filter(t=>t.status==='shot').length,hits);
    assert.equal(s.guide.team.filter(t=>t.status==='escaped').length,3-hits);
    assert.equal(fireGuide(s,0,0),'blocked');assert.equal(spareGuide(s),false);
    finishDebrief(s);assert.equal(getEnding(s).stamp,'TAKEN INTO CUSTODY');
    assert.match(getEnding(s).text,/custody|arrest|police/i);
  }
});
test('waiting completes peacefully before firing and leads to arrest after firing',()=>{
  const peaceful=explore();waitForDebrief(peaceful);
  assert.equal(peaceful.guide.outcome,'spared');assert.equal(peaceful.guide.fired,0);finishDebrief(peaceful);
  for(const hits of [0,1,2]){
    const s=explore();if(hits)for(let i=0;i<hits;i++)hitNext(s);else fireGuide(s,0,0);
    waitForDebrief(s);assert.equal(s.guide.outcome,'arrested');
    assert.equal(s.guide.team.filter(t=>t.status==='shot').length,hits);finishDebrief(s);
  }
});
test('the final interview validates answers, freezes the field, and survives resume',()=>{
  for(const outcome of ['spared','secured','arrested']){
    let s=explore();if(outcome==='spared')spareGuide(s);else if(outcome==='secured')for(let i=0;i<3;i++)hitNext(s);else for(let i=0;i<6;i++)fireGuide(s,0,0);
    const before=serialize(s),previousReports=s.reports.length;
    assert.equal(answerGuideDebrief(s,'not-an-answer'),false);assert.equal(serialize(s),before);
    const question=guideDebrief(s);assert.equal(answerGuideDebrief(s,question.options[0].id),true);
    assert.equal(s.reports.length,previousReports+1);
    const firstAnswer=serialize(s);assert.equal(answerGuideDebrief(s,question.options[0].id),false);assert.equal(serialize(s),firstAnswer,'A queued first answer cannot answer the second question.');
    s=restore(serialize(s));assert.ok(s);assert.equal(s.guide.outcome,outcome);
    const frozen=serialize(s);advance(s,1);assert.equal(serialize(s),frozen,'An interview has no running escape timer.');
    const finalQuestion=guideDebrief(s);assert.equal(answerGuideDebrief(s,finalQuestion.options[0].id),true);
    assert.equal(s.phase,'ending');assert.equal(s.reports.length,previousReports+2);
    const completed=serialize(s);assert.equal(answerGuideDebrief(s,finalQuestion.options[0].id),false);
    assert.equal(serialize(s),completed,'Repeated inputs cannot duplicate the transcript.');
    assert.deepEqual(restore(completed),s);
  }
});
test('guide saves cannot bypass an unfinished recovery interview through another phase',()=>{
  const retreat=explore(),interview=structuredClone(retreat);spareGuide(interview);
  for(const s of [retreat,interview])for(const phase of ['briefing','tower','field','debrief']){
    const inconsistent=structuredClone(s);inconsistent.phase=phase;
    assert.equal(restore(serialize(inconsistent)),null,`${s.guide.stage} cannot resume as ${phase}`);
  }
  assert.deepEqual(restore(serialize(retreat)),retreat);
  assert.deepEqual(restore(serialize(interview)),interview);
  finishDebrief(interview);assert.deepEqual(restore(serialize(interview)),interview);
});
test('retreating people move across the scene at a stable readable size',()=>{
  const s=explore(),positions=[];
  for(let i=0;i<10;i++){
    const point=projectGuide(s.guide,s.guide.team[0]);if(point)positions.push(point);
    advance(s,1);
  }
  assert.ok(positions.length>=2);
  assert.ok(positions.every(point=>Math.abs(point.height-positions[0].height)<.000001),'The team must not simply shrink into the distance.');
  assert.ok(positions.some(point=>Math.abs(point.x-positions[0].x)>1),'The retreat changes the person’s position.');
});
test('commitment and remaining ammunition survive saving during the retreat',()=>{
  for(const hit of [false,true]){
    const s=explore();if(hit)hitNext(s);else fireGuide(s,0,0);
    advance(s,.4);const resumed=restore(serialize(s));assert.deepEqual(resumed,s);
    assert.equal(spareGuide(resumed),false);assert.equal(resumed.guide.fired,1);
    for(let i=1;i<6;i++)fireGuide(resumed,0,0);
    assert.equal(resumed.guide.outcome,'arrested');
  }
});
test('guide saves retain a moving walk and reject corrupt route state',()=>{
  const s=begin();walkToClue(s);inspectGuide(s);guideTravel(s);advance(s,.5);
  const resumed=restore(serialize(s));assert.deepEqual(resumed,s);
  for(let frame=0;frame<100&&!guideRouteStatus(resumed).ready;frame++)advance(resumed,.1);
  assert.equal(guideRouteStatus(resumed).ready,true);assert.equal(inspectGuide(resumed).id,'radio');
  for(const patch of [{x:99},{clues:['corner']},{team:[{}]},{stage:'unknown'},{fired:7},{walking:'yes'},{routeVersion:9},{routeProgress:-1},{routeProgress:21},{encounterVersion:9},{outcome:'secured'},{debriefQuestion:3}]){
    assert.equal(restore(serialize({...s,guide:{...s.guide,...patch}})),null,JSON.stringify(patch));
  }
});
test('legacy maze saves keep inspected clues and resume on the guided route',()=>{
  for(const count of [0,1,2]){
    const s=begin();
    for(let i=0;i<count;i++){walkToClue(s);inspectGuide(s);}
    const expectedClues=[...s.guide.clues];
    delete s.guide.routeVersion;delete s.guide.routeProgress;delete s.guide.walking;
    Object.assign(s.guide,{x:7.5,y:5.5,angle:Math.PI});
    const resumed=restore(serialize(s));assert.ok(resumed);
    assert.deepEqual(resumed.guide.clues,expectedClues);
    assert.equal(resumed.guide.walking,false);
    assert.equal(resumed.guide.routeProgress,[0,2,10][count]);
    assert.equal(walkToClue(resumed).id,['boot','radio','corner'][count]);
  }
});
test('legacy active retreats preserve shots and survivors while adopting the new consequences',()=>{
  for(const fired of [0,1]){
    const s=explore();if(fired)hitNext(s);
    delete s.guide.encounterVersion;delete s.guide.outcome;delete s.guide.debriefQuestion;
    s.guide.team=s.guide.team.map((person,i)=>({...person,x:11.5+(i-1)*.24,y:3.5+i*.7,distance:2+i*.7}));
    const resumed=restore(serialize(s));assert.ok(resumed);assert.equal(resumed.guide.encounterVersion,2);
    assert.equal(resumed.guide.fired,fired);assert.equal(resumed.guide.team.filter(person=>person.status==='shot').length,fired);
    if(fired){assert.equal(spareGuide(resumed),false);waitForDebrief(resumed);assert.equal(resumed.guide.outcome,'arrested');}
    else {advance(resumed,1);assert.equal(spareGuide(resumed),true);assert.equal(resumed.guide.outcome,'spared');}
  }
});
test('orders stay restrained, and every landmark has a new exhibit each night',()=>{
  for(const b of BRIEFINGS)assert.deepEqual(b.orders,['Watch the corn. Shoot any that try to escape.','Remain in the watchtower.','Do not consume the crop.','Remember any irregularities for your debrief at the end of the night.']);
  for(const [x,y] of [[9,1],[3,3],[7,5]]){const exhibits=[];for(let shift=0;shift<3;shift++){const s=createGame();Object.assign(s,{phase:'decision',shift,incident:true});enterField(s);s.player={x,y};exhibits.push(inspect(s));}assert.equal(new Set(exhibits).size,3);}
});

test('every guide result opens both debrief questions before it can be archived',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const scene=source.slice(source.indexOf('function sceneDialog()'),source.indexOf('function stat('));
  for(const outcome of ['spared','secured','arrested']){
    const game=explore();if(outcome==='spared')spareGuide(game);else if(outcome==='secured')for(let i=0;i<3;i++)hitNext(game);else for(let i=0;i<6;i++)fireGuide(game,0,0);
    let archived=0;const dialogs=[];
    const context=vm.createContext({game,lastModalKey:'',sightingPromptReady,guideDebrief,isGuideAftermath,getEnding,ENDINGS,
      paper:(title,body,tag)=>({title,body,tag}),esc:String,
      archiveRun(){archived++;},showModal(kind,paper){dialogs.push({kind,...paper});}});
    vm.runInContext(scene+';sceneDialog();sceneDialog();',context);
    assert.equal(dialogs.length,1);assert.equal(dialogs[0].kind,'guide-debrief');assert.equal(archived,0);
    const first=guideDebrief(game);assert.ok(dialogs[0].body.includes(first.prompt));
    answerGuideDebrief(game,first.options[0].id);vm.runInContext('sceneDialog()',context);
    assert.equal(dialogs.length,2);assert.equal(dialogs[1].kind,'guide-debrief');assert.equal(archived,0);
    const second=guideDebrief(game);assert.ok(dialogs[1].body.includes(second.prompt));
    answerGuideDebrief(game,second.options[0].id);vm.runInContext('sceneDialog();sceneDialog();',context);
    assert.equal(dialogs.length,3);assert.equal(dialogs[2].kind,'ending');assert.equal(archived,1);
    assert.ok(dialogs[2].body.includes(getEnding(game).stamp));
  }
});

test('guide controls retain focus during travel and move it to the next useful action',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const ui=source.slice(source.indexOf('function updateGuideUI()'),source.indexOf('function act('));
  const game=begin(),document={activeElement:null};
  let controlWrites=0,messageWrites=0,labelWrites=0,markup='',message='',label='';
  const progress={style:{}},nodes=new Map();
  const controls={buttons:[],contains(element){return this.buttons.includes(element);},
    set innerHTML(value){
      markup=value;controlWrites++;
      this.buttons=[...value.matchAll(/<button[^>]*data-action="([^"]+)"/g)].map(match=>({dataset:{action:match[1]},focus(){document.activeElement=this;}}));
    },
    querySelector(selector){
      if(selector==='.guide-progress i')return markup.includes('guide-progress')?progress:null;
      if(selector==='button')return this.buttons[0]||null;
      const action=selector.match(/data-action="([^"]+)"/)?.[1];
      return this.buttons.find(button=>button.dataset.action===action)||null;
    },querySelectorAll(){return this.buttons;}
  };
  nodes.set('controls',controls);
  nodes.set('guide-message',{get textContent(){return message;},set textContent(value){message=value;messageWrites++;}});
  const context=vm.createContext({game,document,paused:false,lastControlsKey:'',guideRouteStatus,
    $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
    stat:()=>'',canvas:{getAttribute(){return label;},setAttribute(name,value){label=value;labelWrites++;}}});
  vm.runInContext(ui+';updateGuideUI();',context);
  assert.equal(controls.buttons[0].dataset.action,'guide-travel');
  controls.buttons[0].focus();guideTravel(game);vm.runInContext('updateGuideUI()',context);
  assert.equal(document.activeElement.dataset.action,'guide-travel');
  const travelWrites=controlWrites,travelMessages=messageWrites,travelLabels=labelWrites;
  for(let frame=0;frame<3;frame++){advance(game,.1);vm.runInContext('updateGuideUI()',context);}
  assert.equal(controlWrites,travelWrites,'Moving updates progress without replacing focused controls.');
  assert.equal(messageWrites,travelMessages,'Unchanged narration is not sent repeatedly to the status region.');
  assert.equal(labelWrites,travelLabels,'Unchanged canvas descriptions are not rewritten during movement.');
  assert.ok(parseFloat(progress.style.width)>0);
  while(!guideRouteStatus(game).ready)advance(game,.1);
  vm.runInContext('updateGuideUI()',context);
  assert.equal(document.activeElement.dataset.action,'guide-inspect');
  inspectGuide(game);vm.runInContext('updateGuideUI()',context);
  assert.equal(document.activeElement.dataset.action,'guide-travel');
  context.game=explore();vm.runInContext('updateGuideUI()',context);
  assert.equal(document.activeElement.dataset.action,'guide-focus','The reveal focuses aiming, never firing.');
  fireGuide(context.game,0,0);vm.runInContext('updateGuideUI()',context);
  assert.equal(controls.buttons.some(button=>button.dataset.action==='guide-spare'),false,'Committing removes the voluntary escape action.');
  for(let i=1;i<6;i++)fireGuide(context.game,0,0);vm.runInContext('updateGuideUI()',context);
  assert.equal(controls.buttons.length,0,'Rifle controls are removed during the recorded debrief.');
});

test('guide keyboard shortcuts follow the current action and respect focused buttons',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const keyboard=source.slice(source.indexOf("document.addEventListener('keydown'"),source.indexOf("document.addEventListener('visibilitychange'"));
  const calls=[],game=begin();let keydown;
  const context=vm.createContext({game,paused:false,dialog:{open:false},menuOpen:()=>false,
    document:{addEventListener(type,handler){if(type==='keydown')keydown=handler;}},
    compulsionNotice:{matches:()=>false},$:()=>({matches:()=>false}),nearbyGuideSite:s=>guideRouteStatus(s).ready,
    act(...args){calls.push(args);},togglePause(){}});
  vm.runInContext(keyboard,context);
  const press=(key,tagName='CANVAS',repeat=false)=>{calls.length=0;keydown({key,target:{tagName},repeat,preventDefault(){}});return calls.map(args=>args[0]);};
  assert.deepEqual(press(' '),['guide-travel']);
  assert.deepEqual(press('w'),['guide-travel']);
  assert.deepEqual(press('a'),[]);assert.deepEqual(press('d'),[]);
  assert.deepEqual(press(' ','BUTTON'),[],'Space retains native button activation.');
  assert.deepEqual(press('w','CANVAS',true),[],'Holding a key cannot toggle travel repeatedly.');
  walkToClue(game);
  assert.deepEqual(press(' '),['guide-inspect']);assert.deepEqual(press('e'),['guide-inspect']);
  context.game=explore();
  assert.deepEqual(press('x'),['guide-focus']);assert.deepEqual(press(' '),['guide-fire']);
  assert.deepEqual(press('l'),['guide-spare']);assert.deepEqual(press('w'),[]);
  fireGuide(context.game,0,0);assert.deepEqual(press('l'),[],'The lowering shortcut is removed after firing.');
  assert.deepEqual(press('x'),['guide-focus']);assert.deepEqual(press(' '),['guide-fire']);
  for(let i=1;i<6;i++)fireGuide(context.game,0,0);
  for(const key of [' ','x','l','w','e'])assert.deepEqual(press(key),[],'The debrief cannot react to gameplay shortcuts.');
});
