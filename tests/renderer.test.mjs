import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, shoot, focusNext } from '../docs/engine.js';
import { Renderer, cameraFor, targetProjection, aimProjection, updateGroundTracks, visibleGuideTarget } from '../docs/renderer.js';
import { fireGuide, projectGuide } from '../docs/guide.js';

for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`proportional camera and target taps at ${width} × ${height}`, () => {
    const view=cameraFor(width,height);
    assert.ok(Math.abs(view.width*view.scale-width)<1e-8);
    assert.ok(Math.abs(view.height*view.scale-height)<1e-8);
    for(const x of [65,480,895]) {
      const target={x,y:440},p=targetProjection(target,view);
      assert.ok(p.x-24*p.size>=view.left);
      assert.ok(p.x+24*p.size<=view.left+view.width);
      const renderer={scene:{phase:'tower',targets:[target]},canvas:{getBoundingClientRect:()=>({left:12,top:8,width,height})}};
      const point=Renderer.prototype.coords.call(renderer,{clientX:12+(p.x-view.left)*view.scale,clientY:8+(p.y-34*p.size-view.top)*view.scale});
      assert.ok(Math.abs(point.x-x)<1e-8);
      assert.ok(Math.abs(point.y-(target.y-34))<1e-8);
      const miss=Renderer.prototype.coords.call(renderer,{clientX:12,clientY:8});
      assert.equal(miss.x,-1000);
    }
  });
}

test('eclipse cuts one shadow from a lit moon without painting gray shadow disks', () => {
  const calls=[];
  const context=new Proxy({}, {get:(_,name)=>(...args)=>calls.push([name,...args]),set:(_,name,value)=>{calls.push([name,value]);return true;}});
  for(const time of [0,30,60]) {
    calls.length=0;
    Renderer.prototype.drawEclipse.call({c:context,view:cameraFor(390,844)},{phase:'tower',time},false);
    assert.deepEqual(calls.filter(c=>c[0]==='fill'),[['fill','evenodd']]);
    assert.deepEqual(calls.filter(c=>c[0]==='fillStyle'),[['fillStyle','#d9d6ae']]);
    assert.equal(calls.filter(c=>c[0]==='clip').length,1);
  }
});

for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`perspective keeps pointer and keyboard shots aligned at ${width} × ${height}`, () => {
    const view=cameraFor(width,height);
    for(const y of [331,360,410,450])for(const x of [65,480,895]) {
      const s=createGame();startShift(s);
      const target={id:1,kind:'corn',x,y,direction:1,speed:20,wobble:0};s.targets=[target];
      const p=targetProjection(target,view),aim=aimProjection(focusNext(s),view,s.targets);
      assert.ok(Math.abs(aim.x-p.x)<1e-8);
      assert.ok(Math.abs(aim.y-(p.y-34*p.size))<1e-8);
      assert.ok(p.x-24*p.size>=view.left&&p.x+24*p.size<=view.left+view.width);
      const renderer={scene:s,canvas:{getBoundingClientRect:()=>({left:12,top:8,width,height})}};
      const point=Renderer.prototype.coords.call(renderer,{clientX:12+(aim.x-view.left)*view.scale,clientY:8+(aim.y-view.top)*view.scale});
      assert.equal(shoot(s,point.x,point.y),'hit');
      assert.equal(s.targets.length,0);
    }
  });
}

test('distant figures scale down while keeping their feet at their field depth', () => {
  const view=cameraFor(960,600),far=targetProjection({x:480,y:331},view),near=targetProjection({x:480,y:450},view);
  assert.ok(far.size<near.size);
  assert.equal(far.y,331);assert.equal(near.y,450);assert.equal(far.x,near.x);
});

test('soil trails record actual crop movement, survive a shot, and expire in simulation time', () => {
  const corn={id:1,kind:'corn',x:480,y:410},person={id:2,kind:'person',x:710,y:331};
  let tracks=updateGroundTracks([], [corn,person], 3);
  assert.equal(tracks.length,1);
  assert.equal(tracks[0].x0,480);assert.equal(tracks[0].x1,480);
  corn.x=460;tracks=updateGroundTracks(tracks,[corn,person],4);
  assert.equal(tracks[0].x0,480);assert.equal(tracks[0].x1,460);
  const paused=structuredClone(tracks);
  for(let frame=0;frame<120;frame++)tracks=updateGroundTracks(tracks,[corn,person],4);
  assert.deepEqual(tracks,paused);
  assert.deepEqual(updateGroundTracks(tracks,[],10),paused);
  assert.deepEqual(updateGroundTracks(tracks,[],22),[]);
  assert.deepEqual(corn,{id:1,kind:'corn',x:460,y:410});
});

test('guide aim assistance excludes people outside the portrait camera', () => {
  const guide={x:5.5,y:5.5,angle:0};
  const centered={x:6.5,y:5.5},peripheral={x:6.5,y:5.9};
  assert.ok(projectGuide(guide,peripheral),'The person is inside the full scene field of view.');
  assert.ok(visibleGuideTarget(guide,centered,cameraFor(390,844)));
  assert.equal(visibleGuideTarget(guide,peripheral,cameraFor(390,844)),null);
  assert.ok(visibleGuideTarget(guide,peripheral,cameraFor(1440,900)));
});

test('distant guide figures have a 44px touch target without widening mouse aim', () => {
  const width=844,height=390,view=cameraFor(width,height);
  const person={id:1,x:11.5,y:10.5,status:'running'};
  const guide={x:11.5,y:1.5,angle:Math.PI/2,stage:'escape',fired:0,team:[person]};
  const s={phase:'guide',guide,shots:0},p=projectGuide(guide,person);
  const renderer={scene:s,canvas:{getBoundingClientRect:()=>({left:0,top:0,width,height})}};
  const event={clientX:(p.x-view.left)*view.scale+21,clientY:(p.y-p.height*.5-view.top)*view.scale};
  const mouse=Renderer.prototype.coords.call(renderer,{...event,pointerType:'mouse'});
  assert.equal(fireGuide(structuredClone(s),mouse.x,mouse.y),'miss');
  const touch=Renderer.prototype.coords.call(renderer,{...event,pointerType:'touch'});
  assert.equal(fireGuide(structuredClone(s),touch.x,touch.y),'person');
  const outside=Renderer.prototype.coords.call(renderer,{...event,clientX:event.clientX+3,pointerType:'touch'});
  assert.equal(fireGuide(structuredClone(s),outside.x,outside.y),'miss');
});
