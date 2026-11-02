import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, answer, advance, serialize, restore, endingId } from '../docs/engine.js';
import { GUIDE_SITES, guideWall, enableGuideExploration, moveGuide, guideClueInReach, availableGuideSites, nearbyGuideSite, inspectGuide, guideTravel, guideRouteStatus, fireGuide, focusGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';

const SEARCH_ORDERS=[['corner'],['boot','corner'],['radio','corner'],['boot','radio','corner'],['radio','boot','corner']];

function begin() {
  const s=createGame('story',123);
  Object.assign(s,{phase:'debrief',shift:2,question:2});
  assert.equal(answer(s,'guide'),true);
  assert.equal(enableGuideExploration(s),true);
  return s;
}
function pathTo(s,site) {
  const start=[Math.floor(s.guide.x),Math.floor(s.guide.y)],end=[Math.floor(site.x),Math.floor(site.y)];
  const key=point=>point.join(','),queue=[start],previous=new Map([[key(start),null]]);
  for(let i=0;i<queue.length&&!previous.has(key(end));i++) {
    const [x,y]=queue[i];
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const point=[x+dx,y+dy],id=key(point);
      if(guideWall(point[0]+.5,point[1]+.5)||previous.has(id))continue;
      previous.set(id,queue[i]);queue.push(point);
    }
  }
  assert.ok(previous.has(key(end)));
  const path=[];
  for(let point=end;point;point=previous.get(key(point)))path.unshift({x:point[0]+.5,y:point[1]+.5});
  return path;
}
function walkTo(s,site) {
  for(const point of pathTo(s,site)) {
    for(let frame=0;Math.hypot(point.x-s.guide.x,point.y-s.guide.y)>.00001;frame++) {
      assert.ok(frame<100,'The player reaches the next open cell using actual movement inputs.');
      const g=s.guide,dx=point.x-g.x,dy=point.y-g.y,length=Math.hypot(dx,dy),speed=Math.min(1,length/(.95*.08));
      const forward=(dx*Math.cos(g.angle)+dy*Math.sin(g.angle))/length*speed;
      const strafe=(-dx*Math.sin(g.angle)+dy*Math.cos(g.angle))/length*speed;
      moveGuide(s,{forward,strafe},.08);advance(s,.08);
      assert.equal(guideWall(g.x,g.y),false);
    }
  }
}
function find(s,id) {
  const site=GUIDE_SITES.find(site=>site.id===id);
  walkTo(s,site);
  assert.equal(nearbyGuideSite(s)?.id,id);
  assert.equal(inspectGuide(s,id),site);
}
function finishSearch(s,order=['boot','radio','corner']) {
  for(const id of order)find(s,id);
  assert.equal(s.guide.stage,'escape');
  return s;
}
function finishInterview(s,interrupt=false) {
  const q=guideDebrief(s);
  assert.ok(q);
  if(interrupt)assert.equal(answerGuideDebrief(s,q.options.find(option=>option.action==='rifle').id),true);
  else while(s.guide.stage==='debrief'&&s.phase==='guide') {
    assert.equal(answerGuideDebrief(s,guideDebrief(s).options[0].id),true);
    assert.deepEqual(restore(serialize(s)),s,'Each recorded answer resumes without changing discoveries.');
  }
}

test('free recovery movement uses original heading, collision and bounded analog speed',()=>{
  const s=begin(),g=s.guide,origin={x:g.x,y:g.y};
  assert.equal(moveGuide(s,{forward:1},.1),true);assert.equal(g.x,origin.x);assert.ok(g.y<origin.y);
  const single=g.steps;
  const diagonal=begin();moveGuide(diagonal,{forward:1,strafe:1},.1);
  assert.ok(Math.abs(diagonal.guide.steps-single)<1e-10);
  const angle=g.angle;moveGuide(s,{turn:1,look:1},.1);assert.ok(g.angle<angle);assert.ok(g.pitch>-.12);
  walkTo(s,{x:1.5,y:10.5});
  // Move east relative to the current camera until the corn stops the player.
  for(let i=0;i<100;i++)moveGuide(s,{forward:Math.cos(g.angle),strafe:-Math.sin(g.angle)},.1);
  assert.ok(g.x<1.87&&g.x>1.7);assert.equal(guideWall(g.x+.14,g.y),false);
  const snapshot=serialize(s);for(const dt of [0,-1,NaN,Infinity])assert.equal(moveGuide(s,{forward:1},dt),false);
  assert.equal(serialize(s),snapshot);
  const before=g.steps;moveGuide(s,{forward:-1},100);assert.ok(g.steps-before<=.095000001);
});

test('clue prompts and examination use proximity and corn sightlines rather than camera aim',()=>{
  const s=begin(),boot=GUIDE_SITES[0];
  assert.equal(nearbyGuideSite(s),null);assert.equal(inspectGuide(s,'boot'),null);
  walkTo(s,boot);
  for(let i=0;i<40;i++){moveGuide(s,{turn:1,look:1},.1);assert.equal(nearbyGuideSite(s),boot);}
  assert.equal(s.guide.pitch,.65);
  assert.equal(guideClueInReach(s,boot),true);assert.equal(inspectGuide(s,'not-a-clue'),null);
  assert.equal(inspectGuide(s,'boot'),boot);assert.equal(inspectGuide(s,'boot'),null);
  const blocked={...s,guide:{...s.guide,x:2.5,y:8.5}};
  assert.equal(guideClueInReach(blocked,{x:1.5,y:8.5}),false);
  for(const patch of [{x:NaN},{y:Infinity}])assert.equal(guideClueInReach({...s,guide:{...s.guide,...patch}},boot),false);
});

test('the clearing starts the encounter after skipping either or both optional clues, or examining both in either order',()=>{
  for(const order of SEARCH_ORDERS) {
    const s=begin();
    for(const [index,id] of order.entries()) {
      find(s,id);assert.deepEqual(s.guide.clues,order.slice(0,index+1));
      assert.equal(s.guide.stage,id==='corner'?'escape':'search');
      assert.deepEqual(restore(serialize(s)),s,'Every collected order can resume exactly.');
    }
    assert.equal(s.guide.stage,'escape');
    assert.deepEqual(s.guide.clues,order,'Skipped clues are not recorded as examined.');
    assert.deepEqual(availableGuideSites(s),[]);
    assert.deepEqual([s.guide.x,s.guide.y,s.guide.angle,s.guide.routeProgress],[11.5,1.5,Math.PI/2,20]);
    assert.equal(s.guide.time,0);assert.equal(s.guide.team.length,3);assert.equal(s.guide.fired,0);
    assert.equal(spareGuide(s),false);const p=focusGuide(s);assert.ok(p);assert.equal(fireGuide(s,p.x,p.y),'blocked');
    advance(s,.65);assert.equal(spareGuide(s),true);
    assert.deepEqual(restore(serialize(s)),s);
  }
});

test('older exploration saves that already examined the clearing can gather there without finding missing clues',()=>{
  for(const clues of [['corner'],['corner','radio'],['radio','corner','boot']]) {
    const old=begin();old.guide.clues=[...clues];
    const s=restore(serialize(old));assert.deepEqual(s,old);
    assert.ok(availableGuideSites(s).some(site=>site.id==='corner'));
    assert.equal(inspectGuide(s,'corner'),null,'Gathering still requires reaching the clearing.');
    find(s,'corner');assert.equal(s.guide.stage,'escape');
    assert.deepEqual(s.guide.clues,clues,'Revisiting the clearing does not duplicate its recorded discovery.');
    assert.deepEqual(restore(serialize(s)),s);
  }
});

test('partial-clue encounter saves require the clearing and cannot be loaded as a legacy guided search',()=>{
  const s=finishSearch(begin(),['corner']);
  for(const clues of [[],['boot'],['boot','radio'],['radio','radio','corner']]) {
    assert.equal(restore(serialize({...s,guide:{...s.guide,clues}})),null);
  }
  const legacy={...s,guide:{...s.guide}};delete legacy.guide.explorationVersion;delete legacy.guide.pitch;
  assert.equal(restore(serialize(legacy)),null,'Legacy encounters still require the original three discoveries.');
});

test('free recovery poses and discovered clues round-trip while corrupt exploration saves are rejected',()=>{
  const s=begin();find(s,'radio');moveGuide(s,{forward:.4,strafe:.2,turn:.3,look:-.5},.1);
  const resumed=restore(serialize(s));assert.deepEqual(resumed,s);
  for(const patch of [
    {explorationVersion:2},{pitch:NaN},{pitch:2},{x:2.5,y:2.5},{x:1.05},
    {clues:['radio','radio']},{clues:['unknown']},{routeProgress:-1},{routeProgress:21},
    {walking:true},{explorationPath:[]},{explorationGoal:'radio'},{explorationLength:1},
    {outcome:'secured'},{debriefQuestion:1}
  ])assert.equal(restore(serialize({...s,guide:{...s.guide,...patch}})),null,JSON.stringify(patch));
});

test('enabling free exploration preserves the exact legacy walking position and discoveries',()=>{
  const s=createGame('story',123);Object.assign(s,{phase:'debrief',shift:2,question:2});answer(s,'guide');
  guideTravel(s);while(!guideRouteStatus(s).ready)advance(s,.1);inspectGuide(s);
  guideTravel(s);advance(s,.37);
  const legacy=restore(serialize(s));assert.ok(legacy);
  const before={x:legacy.guide.x,y:legacy.guide.y,angle:legacy.guide.angle,steps:legacy.guide.steps,clues:[...legacy.guide.clues]};
  enableGuideExploration(legacy);
  assert.deepEqual({x:legacy.guide.x,y:legacy.guide.y,angle:legacy.guide.angle,steps:legacy.guide.steps,clues:legacy.guide.clues},before);
  assert.equal(legacy.guide.walking,false);assert.deepEqual(restore(serialize(legacy)),legacy);
  assert.equal(enableGuideExploration(legacy),true);
});

test('automatic fallback walks real rows, can stop, and resumes its saved path without jumping',()=>{
  const s=begin();find(s,'radio');
  assert.equal(guideTravel(s),true);advance(s,.3);
  const moving=restore(serialize(s));assert.deepEqual(moving,s);
  const before=[moving.guide.x,moving.guide.y,moving.guide.steps];
  assert.equal(guideTravel(moving),true);advance(moving,.5);
  assert.deepEqual([moving.guide.x,moving.guide.y,moving.guide.steps],before);
  assert.equal(guideTravel(moving),true);
  let previous={x:moving.guide.x,y:moving.guide.y};
  for(let i=0;moving.guide.walking&&i<600;i++) {
    advance(moving,.1);
    assert.ok(Math.hypot(moving.guide.x-previous.x,moving.guide.y-previous.y)<=.180001);
    assert.equal(guideWall(moving.guide.x,moving.guide.y),false);
    previous={x:moving.guide.x,y:moving.guide.y};
  }
  assert.equal(moving.guide.walking,false);assert.equal(nearbyGuideSite(moving).id,'boot');
  assert.equal(inspectGuide(moving).id,'boot');assert.deepEqual(restore(serialize(moving)),moving);
  for(const patch of [{explorationPath:[{x:2.5,y:2.5}]},{explorationGoal:'unknown'},{explorationLength:.001}]) {
    assert.equal(restore(serialize({...s,guide:{...s.guide,...patch}})),null);
  }
});

test('manual input stops automatic fallback and non-search phases cannot walk or change camera',()=>{
  const s=begin();guideTravel(s);advance(s,.2);moveGuide(s,{turn:1},.1);
  assert.equal(s.guide.walking,false);assert.equal(s.guide.explorationPath,undefined);
  for(const phase of ['briefing','field','debrief','ending']) {
    const inactive={...s,phase},before=serialize(inactive);
    assert.equal(moveGuide(inactive,{forward:1,turn:1},.1),false);assert.equal(serialize(inactive),before);
  }
  const escape=finishSearch(begin());const before=serialize(escape);
  assert.equal(moveGuide(escape,{forward:1,turn:1},.1),false);assert.equal(serialize(escape),before);
  assert.equal(enableGuideExploration(escape),false);
});

test('every optional clue combination retains all four original endings, ammunition rules and exact saves through the interview',()=>{
  for(const order of SEARCH_ORDERS)for(const outcome of ['spared','secured','arrested','interrupted']) {
    const s=finishSearch(begin(),order);assert.deepEqual(restore(serialize(s)),s);advance(s,.7);
    if(outcome==='secured')for(let i=0;i<3;i++){const p=focusGuide(s);assert.equal(fireGuide(s,p.x,p.y),'person');}
    else if(outcome==='arrested')for(let i=0;i<6;i++)assert.equal(fireGuide(s,0,0),'miss');
    else assert.equal(spareGuide(s),true);
    assert.equal(s.guide.stage,'debrief');assert.deepEqual(restore(serialize(s)),s);
    if(outcome==='arrested')assert.ok(guideDebrief(s).options.every(option=>option.action!=='rifle'));
    finishInterview(s,outcome==='interrupted');
    assert.equal(endingId(s),{spared:'guide',secured:'guide_shot',arrested:'guide_arrested',interrupted:'guide_interrupted'}[outcome]);
    assert.deepEqual(s.guide.clues,order);
    assert.deepEqual(restore(serialize(s)),s);
  }
});
