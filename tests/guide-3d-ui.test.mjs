import test from 'node:test';
import assert from 'node:assert/strict';
import { Guide3D } from '../docs/guide-3d-ui.js';
import { createGame, answer, advance, serialize, restore } from '../docs/engine.js';
import { guideTravel, guideRouteStatus, inspectGuide, projectGuide, fireGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';

class Element extends EventTarget {
  constructor(tag='DIV') {
    super();this.tagName=tag;this.hidden=false;this.inert=false;this.captured=new Set();this.properties=new Map();
    this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name);return !!on;}};
    this.style={setProperty:(key,value)=>this.properties.set(key,value)};
    this.nodes=new Map();
  }
  querySelector(selector) { if(!this.nodes.has(selector))this.nodes.set(selector,new Element(selector==='canvas'?'CANVAS':'DIV'));return this.nodes.get(selector); }
  closest() { return null; }
  setAttribute(name,value) { this.properties.set(name,value); }
  getBoundingClientRect() { return {left:100,top:200,width:100,height:100}; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id);this.pointer('lostpointercapture',id); }
  focus() { document.activeElement=this; }
  pointer(type,id,x=150,y=250) {
    const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0});this.dispatchEvent(event);
  }
  key(type,code) {
    const event=new Event(type,{cancelable:true});Object.assign(event,{code,key:code,repeat:false});this.dispatchEvent(event);
  }
}
function environment(t) {
  const document=new Element('DOCUMENT');document.body=new Element('BODY');document.hidden=false;
  const globals={document,window:new Element('WINDOW'),navigator:{maxTouchPoints:2},location:{search:''},matchMedia:()=>Object.assign(new Element(),{matches:true}),ResizeObserver:undefined};
  for(const [key,value] of Object.entries(globals)) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  return document;
}
function start() {
  const s=createGame('story',123);Object.assign(s,{phase:'debrief',shift:2,question:2});answer(s,'guide');return s;
}
function escape() {
  const s=start();
  for(let clue=0;clue<3;clue++) {
    guideTravel(s);for(let frame=0;frame<500&&!guideRouteStatus(s).ready;frame++)advance(s,.1);
    assert.ok(inspectGuide(s));
  }
  return s;
}
function world() {
  return {
    visible:new Set([1,2,3]),rendered:[],aim:null,
    render(s,moving){this.rendered.push([s.guide.stage,moving]);},resize(){},
    visiblePerson(s,id){const person=s.guide.team.find(person=>person.id===id);return this.visible.has(id)&&person?.status==='running'&&!!projectGuide(s.guide,person);},
    focusPerson(s,id){if(!this.visiblePerson(s,id))return false;this.aim=id;return true;},
    aimPoint(s){const person=s.guide.team.find(person=>person.id===s.guide.focused);const p=person&&projectGuide(s.guide,person);return p?{x:p.x,y:p.y-p.height*.5}:{x:0,y:0};},
    setAim(x,y){this.aim={x,y};},shotPoint(){return {x:0,y:0};},pick(){return null;}
  };
}
function viewFor(s,callbacks={}) {
  const view=new Guide3D(new Element(),callbacks);view.world=world();view.ready=true;view.sync(s,false);return view;
}

test('recovery remains in the same 3D view through escape, interview and ending while search input stops',t=>{
  const document=environment(t),s=escape(),view=viewFor(s);
  assert.equal(view.root.hidden,false);assert.equal(view.canInput(),false);assert.equal(view.canAim(),true);
  assert.equal(view.sticks.hidden,true);assert.equal(view.examine.hidden,true);
  const before=serialize(s);document.key('keydown','KeyW');view.update(s,.1,false);assert.equal(serialize(s),before);
  advance(s,.7);spareGuide(s);view.update(s,.1,true);
  assert.equal(s.guide.stage,'debrief');assert.equal(view.root.hidden,false);assert.equal(view.canAim(),false);
  while(s.phase==='guide')answerGuideDebrief(s,guideDebrief(s).options[0].id);
  view.update(s,.1,true);assert.equal(s.phase,'ending');assert.equal(view.root.hidden,false);assert.equal(view.canAim(),false);
  assert.deepEqual(view.world.rendered.map(([stage])=>stage),['escape','debrief','debrief']);
});

test('changing to the escape stage releases both captured thumbs and prevents held inputs carrying into rifle fire',t=>{
  environment(t);
  const search=start(),fired=[],view=viewFor(search,{onFire:p=>fired.push(p)});
  const left=view.root.querySelector('.guide3d-move'),right=view.root.querySelector('.guide3d-look');
  left.pointer('pointerdown',11,150,218);right.pointer('pointerdown',22,182,250);
  assert.equal(view.movement.y,-1);assert.equal(view.look.x,1);
  const final=escape();Object.assign(search.guide,final.guide);view.sync(search,false);
  assert.deepEqual(view.movement,{x:0,y:0});assert.deepEqual(view.look,{x:0,y:0});
  assert.equal(left.captured.size,0);assert.equal(right.captured.size,0);
  left.pointer('pointermove',11,150,218);right.pointer('pointerup',22);view.canvas.pointer('pointerup',22);
  assert.equal(fired.length,0);assert.equal(search.guide.fired,0);
});

test('3D aim skips invisible people and firing preserves the real reveal lock, ammunition and first-shot commitment',t=>{
  environment(t);const s=escape(),results=[];
  const view=viewFor(s,{onFire:p=>results.push(fireGuide(s,p.x,p.y))});
  view.world.visible=new Set([2]);assert.equal(view.focusNext(),true);assert.equal(s.guide.focused,2);
  view.fireAim();assert.deepEqual(results,['blocked']);assert.equal(s.guide.fired,0);
  advance(s,.65);view.fireAim();assert.equal(results.at(-1),'person');assert.equal(s.guide.team[1].status,'shot');
  assert.equal(s.guide.fired,1);assert.equal(spareGuide(s),false);
  const before=JSON.parse(serialize(s));before.guide.focused=null;
  assert.equal(view.fireAim(),false);assert.deepEqual(JSON.parse(serialize(s)),before,'A hidden or fallen focused person only clears focus and cannot consume another round.');
  view.world.visible=new Set();assert.equal(view.focusNext(),false);assert.equal(s.guide.focused,null);
  assert.deepEqual(restore(serialize(s)),s);
});

test('pause, menus, hidden documents and a loading saved encounter block both pointer and button firing',t=>{
  const document=environment(t),s=restore(serialize(escape())),shots=[];
  const view=viewFor(s,{onFire:p=>shots.push(p)});
  for(const blocked of [true,false]) {
    view.sync(s,blocked);document.hidden=!blocked;
    assert.equal(view.fireAim(),false);assert.equal(view.focusNext(),false);view.canvas.pointer('pointerdown',1);
    assert.equal(shots.length,0);
  }
  document.hidden=false;view.ready=false;view.sync(s,false);
  assert.equal(view.root.hidden,false);assert.equal(view.loading.hidden,false);assert.equal(view.active,false);
  view.canvas.pointer('pointerdown',2);assert.equal(view.fireAim(),false);assert.equal(shots.length,0);
  view.ready=true;view.sync(s,false);view.canvas.pointer('pointerdown',3);
  assert.equal(shots.length,1,'A fresh tap can fire only once the saved scene is ready.');
});

test('a rendering failure hands the same saved escape to the fallback without changing people or ammunition',t=>{
  environment(t);t.mock.method(console,'warn',()=>{});
  const s=escape();advance(s,.7);fireGuide(s,0,0);
  const unavailable=[],view=viewFor(s,{onUnavailable:message=>unavailable.push(message)});
  const before=serialize(s);view.world.render=()=>{throw new Error('Lost renderer');};view.update(s,.1,false);
  assert.equal(serialize(s),before);assert.equal(view.failed,true);assert.equal(view.root.hidden,true);assert.equal(view.canAim(),false);
  assert.equal(unavailable.length,1);view.update(s,.1,false);assert.equal(unavailable.length,1);
  assert.deepEqual(restore(serialize(s)),s);
});
