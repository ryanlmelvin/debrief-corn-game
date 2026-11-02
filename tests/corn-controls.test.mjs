import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCornControls } from '../docs/corn-controls.js';

class Target {
  listeners=new Map();
  addEventListener(type,handler) {if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler) {this.listeners.get(type)?.delete(handler);}
  emit(type,properties={}) {
    const event={type,target:this,defaultPrevented:false,propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...properties};
    for(const handler of [...this.listeners.get(type)||[]])handler(event);
    return event;
  }
}
class Clock extends Target {
  now=0;nextId=0;tasks=new Map();
  setTimeout(callback,delay) {const id=++this.nextId;this.tasks.set(id,{callback,at:this.now+delay});return id;}
  clearTimeout(id) {this.tasks.delete(id);}
  tick(ms) {
    const end=this.now+ms;
    while(this.tasks.size) {
      const [id,task]=[...this.tasks].sort((a,b)=>a[1].at-b[1].at)[0];
      if(task.at>end)break;
      this.tasks.delete(id);this.now=task.at;task.callback();
    }
    this.now=end;
  }
}
class Element extends Target {
  captured=new Set();classes=new Set();
  classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
  constructor(doc,kind='canvas',direction=null){super();this.ownerDocument=doc;this.kind=kind;this.dataset={direction};}
  closest(selector){return selector.split(',').includes(this.kind)?this:null;}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id});}
  pointer(type,id,x=0,y=0,extra={}){return this.emit(type,{pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0,...extra});}
}
function setup(options={}) {
  const win=new Clock(),doc=new Target();doc.defaultView=win;doc.hidden=false;
  const canvas=new Element(doc),directions=Object.fromEntries(['up','down','left','right'].map(name=>[name,new Element(doc,'button',name)]));
  const buttons={querySelectorAll:()=>Object.values(directions)},moves=[];
  let enabled=true,pauses=0;
  const controls=bindCornControls({canvas,buttons,isEnabled:()=>enabled,move:(x,y)=>{moves.push([x,y]);return options.move?.(x,y,win.now)??true;},...(options.onPause?{onPause:()=>{pauses++;}}:{})});
  const key=(type,code,extra={})=>doc.emit(type,{code,repeat:false,target:canvas,...extra});
  return {win,doc,canvas,directions,moves,controls,key,set enabled(value){enabled=value;},get pauses(){return pauses;}};
}

test('held keyboard movement is cardinal, follows the last press and stops when keys lift',()=>{
  const h=setup();
  assert.equal(h.key('keydown','KeyW').defaultPrevented,true);
  h.key('keydown','KeyW',{repeat:true});h.win.tick(200);
  assert.deepEqual(h.moves,[[0,-1],[0,-1]]);
  h.key('keydown','ArrowRight');h.win.tick(200);
  assert.deepEqual(h.moves.slice(-2),[[1,0],[1,0]]);
  h.key('keyup','ArrowRight');h.win.tick(200);
  assert.deepEqual(h.moves.at(-1),[0,-1]);
  h.key('keyup','KeyW');const count=h.moves.length;h.win.tick(1000);
  assert.equal(h.moves.length,count);assert.equal(h.win.tasks.size,0);
});

test('a simulation frame just short of the cooldown does not lose the next held step',()=>{
  let lastAccepted=-Infinity;const accepted=[];
  const h=setup({move:(x,y,time)=>{
    if(time-lastAccepted<205)return false;
    lastAccepted=time;accepted.push([x,y,time]);return true;
  }});
  h.key('keydown','ArrowUp');h.win.tick(200);
  assert.equal(accepted.length,1);
  h.win.tick(40);
  assert.equal(accepted.length,2);assert.ok(accepted[1][2]<300);
  h.controls.release();assert.equal(h.win.tasks.size,0);
});

test('text fields and focused buttons retain their keys; explicitly opted-in Escape releases and calls pause',()=>{
  const h=setup({onPause:true});
  for(const kind of ['input','textarea','select','button','a']) {
    assert.equal(h.key('keydown','ArrowUp',{target:new Element(h.doc,kind)}).defaultPrevented,false);
  }
  assert.deepEqual(h.moves,[]);
  h.key('keydown','KeyW');h.key('keydown','Escape');h.win.tick(1000);
  assert.equal(h.pauses,1);assert.equal(h.moves.length,1);
  h.key('keydown','Escape',{repeat:true});assert.equal(h.pauses,1);
  h.key('keydown','Escape',{target:new Element(h.doc,'input')});assert.equal(h.pauses,1);
});

test('main-game Escape stays untouched and disabled controls never consume keyboard input',()=>{
  const h=setup();
  assert.equal(h.key('keydown','Escape').defaultPrevented,false);
  assert.equal(h.pauses,0);
  h.key('keydown','KeyW');h.enabled=false;
  assert.equal(h.key('keyup','KeyW').defaultPrevented,false,'Releasing an old hold during a pause does not steal the key event.');
  for(const code of ['KeyW','ArrowLeft','Escape'])assert.equal(h.key('keydown',code).defaultPrevented,false);
  h.win.tick(1000);assert.equal(h.moves.length,1);
  const standalone=setup({onPause:true});standalone.enabled=false;
  assert.equal(standalone.key('keydown','Escape').defaultPrevented,false);
  assert.equal(standalone.pauses,0);
});

test('browser shortcuts and already-handled keys never become game movement',()=>{
  const h=setup({onPause:true});
  for(const modifier of ['ctrlKey','metaKey','altKey'])for(const code of ['KeyW','ArrowLeft','Escape']) {
    assert.equal(h.key('keydown',code,{[modifier]:true}).defaultPrevented,false);
  }
  h.key('keydown','ArrowUp',{defaultPrevented:true});
  assert.deepEqual(h.moves,[]);assert.equal(h.pauses,0);
  h.key('keydown','KeyW');
  assert.equal(h.key('keyup','KeyW',{metaKey:true}).defaultPrevented,false);
  h.win.tick(1000);assert.equal(h.moves.length,1,'A modified key release still stops an existing hold.');
});

test('touch holds and keyboard activation move once without a duplicate pointer click',()=>{
  const h=setup(),up=h.directions.up;
  up.pointer('pointerdown',3);h.win.tick(200);up.pointer('pointerup',3);
  assert.equal(up.emit('click',{detail:1,pointerType:'touch'}).propagationStopped,true,'Pointer click must not reach the app movement delegate.');
  assert.deepEqual(h.moves,[[0,-1],[0,-1]]);
  assert.equal(up.captured.size,0);assert.equal(up.classes.has('held'),false);
  assert.equal(up.emit('click',{detail:0}).propagationStopped,true,'Keyboard activation must not also reach the app movement delegate.');assert.equal(h.moves.length,3);
  const count=h.moves.length;h.win.tick(1000);assert.equal(h.moves.length,count);
});

test('each pointer owns its hold, while the last active pointer wins without diagonals',()=>{
  const h=setup(),left=h.directions.left,right=h.directions.right;
  left.pointer('pointerdown',10);right.pointer('pointerdown',11);h.win.tick(200);
  assert.deepEqual(h.moves.at(-1),[1,0]);
  right.pointer('pointercancel',11);h.win.tick(200);
  assert.deepEqual(h.moves.at(-1),[-1,0]);
  assert.equal(left.hasPointerCapture(10),true);assert.equal(right.hasPointerCapture(11),false);
  h.doc.emit('pointerup',{pointerId:10});const count=h.moves.length;h.win.tick(1000);
  assert.equal(h.moves.length,count);assert.equal(left.captured.size,0);
});

test('pause, hidden pages, blur and disabled callbacks cannot leave held movement behind',()=>{
  for(const stop of [h=>h.controls.release(),h=>h.win.emit('blur'),h=>{h.doc.hidden=true;h.doc.emit('visibilitychange');},h=>{h.enabled=false;h.win.tick(200);}]) {
    const h=setup();h.key('keydown','KeyW');h.directions.right.pointer('pointerdown',8);
    stop(h);const count=h.moves.length;h.win.tick(1000);
    assert.equal(h.moves.length,count);assert.equal(h.win.tasks.size,0);assert.equal(h.directions.right.captured.size,0);
    h.enabled=true;h.doc.hidden=false;h.win.tick(1000);assert.equal(h.moves.length,count,'Old inputs do not resume.');
  }
  const h=setup();h.enabled=false;h.key('keydown','KeyW');h.directions.up.pointer('pointerdown',2);h.directions.up.emit('click',{detail:0});
  assert.deepEqual(h.moves,[]);
});

test('a canvas swipe makes one dominant-axis step, with taps and canceled gestures inert',()=>{
  const h=setup(),c=h.canvas;
  c.pointer('pointerdown',1,100,100);c.pointer('pointermove',1,130,22);c.pointer('pointerup',1,130,22);
  assert.deepEqual(h.moves,[[0,-1]]);assert.equal(c.captured.size,0);
  h.win.tick(1000);assert.equal(h.moves.length,1);
  c.pointer('pointerdown',2,100,100);c.pointer('pointerup',2,109,110);
  c.pointer('pointerdown',3,100,100);c.pointer('pointercancel',3);c.pointer('pointerup',3,200,100);
  c.pointer('pointerdown',4,100,100);c.pointer('lostpointercapture',4);c.pointer('pointerup',4,200,100);
  assert.equal(h.moves.length,1);assert.equal(c.captured.size,0);
  c.pointer('pointerdown',5,100,100);h.enabled=false;c.pointer('pointerup',5,200,100);
  assert.equal(h.moves.length,1);
});

test('multiple fingers, failed captures and destroy leave no active gesture or listener',()=>{
  const h=setup(),c=h.canvas;
  c.pointer('pointerdown',1,100,100);c.pointer('pointerdown',2,110,100);c.pointer('pointerup',1,200,100);c.pointer('pointerup',2,200,100);
  assert.deepEqual(h.moves,[]);assert.equal(c.captured.size,0);
  h.directions.up.setPointerCapture=()=>{throw new Error('Pointer canceled');};h.directions.up.pointer('pointerdown',3);
  assert.deepEqual(h.moves,[]);
  h.directions.left.pointer('pointerdown',4);h.controls.destroy();const count=h.moves.length;
  h.win.tick(1000);h.key('keydown','KeyW');h.directions.left.pointer('pointerdown',5);h.directions.left.emit('click',{detail:0});
  assert.equal(h.moves.length,count);assert.equal(h.directions.left.captured.size,0);
  assert.equal([...h.doc.listeners.values()].reduce((sum,set)=>sum+set.size,0),0);
});
