import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, cameraFor, targetProjection } from '../docs/renderer.js';

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
