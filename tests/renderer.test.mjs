import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../docs/renderer.js';

for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`tap coordinates match the full-screen field at ${width} × ${height}`, () => {
    const renderer={canvas:{getBoundingClientRect:()=>({left:12,top:8,width,height})}};
    for(const [x,y] of [[0,0],[480,300],[960,600],[240,450]]) {
      const point=Renderer.prototype.coords.call(renderer,{clientX:12+x/960*width,clientY:8+y/600*height});
      assert.ok(Math.abs(point.x-x)<1e-8);
      assert.ok(Math.abs(point.y-y)<1e-8);
    }
  });
}
