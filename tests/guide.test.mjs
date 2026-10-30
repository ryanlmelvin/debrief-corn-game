import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { sightingPromptReady } from '../docs/watch-story.js';
import { readFileSync } from 'node:fs';
import { createGame, answer, advance, restore, serialize, getEnding, BRIEFINGS, enterField, inspect } from '../docs/engine.js';
import { guideTravel, guideRouteStatus, inspectGuide, focusGuide, fireGuide, spareGuide, guideWall, projectGuide, isGuideAftermath } from '../docs/guide.js';
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
  const spared=structuredClone(s);assert.equal(spareGuide(spared),true);assert.equal(spared.phase,'ending');
  p=aim();assert.equal(fireGuide(s,p.x,p.y),'person');
  assert.equal(s.shots,1);assert.equal(s.guide.fired,1);
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
test('guide saves retain a moving walk and reject corrupt route state',()=>{
  const s=begin();walkToClue(s);inspectGuide(s);guideTravel(s);advance(s,.5);
  const resumed=restore(serialize(s));assert.deepEqual(resumed,s);
  for(let frame=0;frame<100&&!guideRouteStatus(resumed).ready;frame++)advance(resumed,.1);
  assert.equal(guideRouteStatus(resumed).ready,true);assert.equal(inspectGuide(resumed).id,'radio');
  for(const patch of [{x:99},{clues:['corner']},{team:[{}]},{stage:'unknown'},{fired:7},{walking:'yes'},{routeVersion:9},{routeProgress:-1},{routeProgress:21}]){
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
});
