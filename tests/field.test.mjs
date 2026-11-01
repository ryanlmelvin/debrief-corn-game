import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, move, inspect, nearbySite, investigationComplete, FIELD_SITES, beginDebrief, answer, startShift, restore, serialize, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { fieldStepCost, planFieldRoute } from '../docs/field.js';
import { rogueOptions } from '../docs/rogue.js';
import { FieldMap } from '../docs/field-ui.js';
import { resolutionGameActive } from '../docs/resolution-games.js';

import { currentEncounter } from '../docs/encounters.js';
function settle(s){if(s.fieldEvents.pending){chooseFieldEncounter(s,currentEncounter(s).choices[0].id);continueFieldEncounter(s);}}

const field=(mode='story')=>({...createGame(mode,42),phase:'field',entered:true});
const site=id=>FIELD_SITES.find(p=>p.id===id);
function walk(s,route) { for(const p of route.steps){assert.equal(move(s,p.x-s.player.x,p.y-s.player.y),true);settle(s);} }
function controller(selected='corner',style='quiet') { return Object.assign(Object.create(FieldMap.prototype),{selected,style,travel:null,lastKey:''}); }

test('the pump discovery keeps its location choice available after the card closes',()=>{
  const s=field(),c=controller('drain');
  Object.assign(s,{shift:1,player:{x:3,y:3},inspected:['corner']});
  c.lastInspected='corner';
  assert.equal(inspect(s),'sample');
  for(let frame=0;frame<3;frame++) {
    c.updateSelection(s,true);
    assert.equal(c.selected,'pump','the sealed sample belongs to the pump, even if another route was selected');
    assert.equal(c.lastInspected,'corner','hold the recommendation change while either discovery or its follow-up is open');
  }
  c.updateSelection(s,false);
  assert.equal(c.selected,'pump');
  assert.equal(c.lastInspected,'corner,pump');
  c.updateSelection(s,false);
  assert.equal(c.selected,'pump');
});

test('closing the drainage discovery keeps its local choice and preserves the player position',()=>{
  const s=field(),c=controller('drain');
  Object.assign(s,{player:{x:7,y:5},inspected:['corner','pump']});
  c.lastInspected='corner,pump';
  inspect(s);c.updateSelection(s,true);
  assert.equal(c.selected,'drain');
  c.updateSelection(s,false);
  assert.equal(c.selected,'drain');
  assert.deepEqual(s.player,{x:7,y:5});
});

test('every route preview matches actual cardinal movement and exposure in both modes',()=>{
  for(const mode of ['story','hard'])for(const start of FIELD_SITES)for(const destination of FIELD_SITES)for(const style of ['quiet','direct']) {
    const s={...field(mode),player:{x:start.x,y:start.y}},before=serialize(s),route=planFieldRoute(s,destination,style);
    assert.equal(serialize(s),before,'planning must not mutate the save');
    walk(s,route);assert.deepEqual(s.player,{x:destination.x,y:destination.y});
    assert.ok(Math.abs(s.exposure-route.exposure)<1e-9);
    if(style==='direct')assert.equal(route.steps.length,Math.abs(start.x-destination.x)+Math.abs(start.y-destination.y));
  }
});
test('careful routes cost no more than shortcuts from every map square',()=>{
  for(let x=0;x<=10;x++)for(let y=0;y<=8;y++)for(const destination of FIELD_SITES) {
    const s={...field(),player:{x,y}},quiet=planFieldRoute(s,destination),direct=planFieldRoute(s,destination,'direct');
    assert.ok(quiet.exposure<=direct.exposure+1e-9);
  }
  const s=field();assert.ok(planFieldRoute(s,site('pump'),'direct').exposure>planFieldRoute(s,site('pump')).exposure);
  assert.ok(fieldStepCost(s,1,4)<fieldStepCost(s,4,4));
});
test('all site orders remain survivable across three nights with the suggested careful routes',()=>{
  for(const mode of ['story','hard'])for(const order of [['pump','corner','drain'],['pump','drain','corner'],['corner','pump','drain'],['corner','drain','pump'],['drain','pump','corner'],['drain','corner','pump']]) {
    const s=field(mode);
    for(let night=0;night<3;night++) {
      for(const id of [...order,'tower']) { walk(s,planFieldRoute(s,site(id)));if(id!=='tower')assert.ok(inspect(s)); }
      assert.equal(s.phase,'field');assert.equal(beginDebrief(s),true);
      answer(s,'truth');answer(s,'evidence');answer(s,'sign');
      if(night<2){startShift(s);s.phase='field';s.entered=true;}
    }
    assert.equal(s.ending,'dissent');assert.equal(s.evidence.length,9);assert.ok(s.exposure<100);
  }
});
test('travel can stop mid-route, save, resume, and arrive exactly once without teleporting',()=>{
  let s=field();const c=controller();assert.equal(c.start(s),true);
  let arrivals=0;const tick=()=>{c.tick(s,.4,(dx,dy)=>move(s,dx,dy),()=>{arrivals++;inspect(s);});if(s.fieldEvents.pending){settle(s);c.start(s);}};
  tick();assert.equal(s.fieldSteps,1);c.stop();const stopped=serialize(s);tick();assert.equal(serialize(s),stopped);
  s=restore(stopped);assert.ok(c.start(s));
  for(let i=0;i<30;i++)tick();
  assert.deepEqual(s.player,{x:9,y:1});assert.equal(arrivals,1);assert.deepEqual(s.evidence,['dress']);assert.equal(c.travel,null);
});
test('travel permits an exposure crossing and clears when a step fails or the phase changes',()=>{
  const s=field(),c=controller();s.exposure=99.9;assert.equal(c.start(s),true);
  c.tick(s,.4,(dx,dy)=>move(s,dx,dy),()=>assert.fail('must enter corn route before arrival'));
  assert.equal(s.exposure,100);assert.equal(s.phase,'rogue');assert.equal(c.travel,null);
  s.phase='field';
  s.exposure=0;assert.equal(c.start(s),true);c.tick(s,.4,()=>false,()=>assert.fail('must not arrive'));assert.equal(c.travel,null);
  assert.equal(c.start(s),true);c.tick(s,.4,()=>{s.phase='ending';return true;},()=>assert.fail('must not arrive'));assert.equal(c.travel,null);
  assert.equal(planFieldRoute(s,site('tower')),null);
  assert.equal(planFieldRoute(field(),{x:11,y:2}),null);assert.equal(planFieldRoute(field(),{x:1.2,y:2}),null);
});
test('automatic travel halts behind pause, menu, dialogs, and a background tab',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const frame=source.slice(source.indexOf('function frame(now)'));
  for(const gate of ['paused','dialog','menu','hidden']) {
    let ticks=0;const context={game:field(),paused:gate==='paused',dialog:{open:gate==='dialog'},menuOpen:()=>gate==='menu',document:{hidden:gate==='hidden'},lastFrame:0,lastUI:0,lastSave:0,advance(){},fieldMap:{tick(){ticks++;}},updateUI(){},save(){},renderer:{draw(){}},requestAnimationFrame(){},resolutionGameActive};
    vm.createContext(context);vm.runInContext(frame,context);vm.runInContext('frame(1000)',context);assert.equal(ticks,0,gate);
    context.paused=false;context.dialog.open=false;context.document.hidden=false;context.menuOpen=()=>false;
    vm.runInContext('frame(1100)',context);assert.equal(ticks,1);
  }
});

test('encounters pause the chosen walk and continue its remaining steps',()=>{
  const s=field(),c=controller('corner','direct');
  assert.equal(c.start(s),true);
  const travel=c.travel;
  c.tick(s,1,()=>{s.fieldEvents.pending={};return true;},()=>assert.fail('arrived during encounter'));
  assert.equal(c.travel,travel);
  const remaining=travel.steps.length;
  c.tick(s,1,()=>assert.fail('moved during encounter'),()=>assert.fail('arrived'));
  assert.equal(travel.steps.length,remaining);
  s.fieldEvents.pending=null;
  c.tick(s,1,()=>true,()=>{});
  assert.equal(travel.steps.length,remaining-1);
  assert.deepEqual(s.fieldEvents.journey,{destination:'corner',style:'direct'});
});

test('arriving at an already inspected drain only reopens a card when the lantern unlocks it',()=>{
  const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const frame=source.slice(source.indexOf('function frame(now)'));
  for(const id of ['drain','pump','corner'])for(const inspected of [false,true])for(const lantern of [false,true]) {
    const game=field(),location=site(id),actions=[];
    game.player={x:location.x,y:location.y};
    if(inspected)inspect(game);
    if(lantern)game.fieldEvents.flags.push('lantern');
    const context={game,paused:false,dialog:{open:false},menuOpen:()=>false,document:{hidden:false},lastFrame:0,lastUI:0,lastSave:0,advance(){},
      fieldMap:{tick(_game,_dt,_step,arrive){arrive();}},act(action){actions.push(action);},nearbySite,investigationComplete,rogueOptions,
      updateUI(){},save(){},renderer:{draw(){}},requestAnimationFrame(){},resolutionGameActive};
    vm.createContext(context);vm.runInContext(frame,context);vm.runInContext('frame(1000)',context);
    assert.deepEqual(actions,!inspected||id==='drain'&&lantern?['inspect']:[],`${id}: inspected=${inspected}, lantern=${lantern}`);
  }
});

test('the map shows the tunnel at an inspected drain and locks it without the lantern',()=>{
  function node() {
    const children=new Map(),attributes=new Map();
    return {style:{},dataset:{},classList:{toggle(){}},setAttribute(key,value){attributes.set(key,value);},getAttribute(key){return attributes.get(key);},
      querySelector(key){if(!children.has(key))children.set(key,node());return children.get(key);},querySelectorAll(){return [];}};
  }
  for(const lantern of [false,true])for(const inspected of [false,true])for(const location of ['drain','pump']) {
    const game=field(),point=site(location),root=node();
    game.player={x:point.x,y:point.y};if(inspected)inspect(game);
    if(lantern)game.fieldEvents.flags.push('lantern');
    const map=new FieldMap(root);map.selected=location;map.render(game);
    assert.equal(root.querySelector('#field-pumps').hidden,!(inspected&&location==='pump'));
    const button=root.querySelector('#field-dungeon');
    assert.equal(button.hidden,!(inspected&&location==='drain'));
    if(inspected&&location==='drain') {
      assert.equal(button.disabled,!lantern);
      assert.match(button.innerHTML,/Acquired lantern/);
      assert.ok(button.innerHTML.includes(lantern?'requirement-met':'requirement-unmet'));
      assert.ok(button.innerHTML.includes(lantern?'✓':'✗'));
      assert.equal(button.innerHTML.includes('Too dark without a lantern.'),!lantern);
      assert.doesNotMatch(button.innerHTML,/unattended|off the path|find and take/i);
    }
    map.choose(game,'corner');
    assert.equal(root.querySelector('#field-dungeon').hidden,true,'the tunnel cannot appear on another location card');
    assert.equal(root.querySelector('#field-pumps').hidden,true,'the pumps cannot appear on another location card');
  }
});
