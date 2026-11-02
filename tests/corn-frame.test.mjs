import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { advance, serialize } from '../docs/engine.js';
import { createMiniGame, miniGameComplete } from '../docs/mini-games.js';
import { cornHazards } from '../docs/rogue.js';
import { resolutionGameActive } from '../docs/resolution-games.js';

const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const frameSource=source.slice(source.indexOf('function frame(now) {'));

function harness(game=createMiniGame('corn','story',192)) {
  const renders=[],updates=[],saves=[];
  let menu=false;
  const context=vm.createContext({
    game,paused:false,dialog:{open:false},document:{hidden:false},menuOpen:()=>menu,
    lastFrame:1000,lastUI:1000,lastSave:1000,
    advance,miniGameComplete,resolutionGameActive,
    guide3d:{ready:true,failed:false,update(){}},
    rogueUI:{loading:false,render(state,blocked){renders.push({time:state.rogue.time,blocked});}},
    resolutionUI:{render(){}},renderer:{draw(){}},$ :()=>({hidden:true}),
    updateReloadUI(){},updateUI(){updates.push(serialize(game));},save(){saves.push(serialize(game));},
    requestAnimationFrame(){}
  });
  vm.runInContext(frameSource,context);
  return {context,game,renders,updates,saves,frame:now=>vm.runInContext(`frame(${now})`,context),set menu(value){menu=value;}};
}

test('loading the Corn renderer freezes the real clock and hazards, then resumes without catch-up',()=>{
  const h=harness();h.context.rogueUI.loading=true;
  const before=serialize(h.game),hazards=cornHazards(h.game);
  for(const now of [1100,2000,5000])h.frame(now);
  assert.equal(serialize(h.game),before,'Loading cannot spend immunity, move hazards, or change the game.');
  assert.deepEqual(cornHazards(h.game),hazards);
  assert.equal(h.updates.length,0);assert.equal(h.saves.length,0);
  assert.equal(h.renders.length,3,'The view continues rendering so its loading lifecycle can complete.');

  h.context.rogueUI.loading=false;h.frame(5100);
  assert.ok(Math.abs(h.game.rogue.time-.1)<1e-9,'Only the new active frame advances; loading time is not replayed.');
  assert.notDeepEqual(cornHazards(h.game),hazards,'The actual rifle volleys resume with the game clock.');
  assert.ok(h.updates.length);assert.ok(h.saves.length);
});

test('pause, menus, documents and hidden tabs freeze Corn simulation and block the rendered controls',()=>{
  for(const gate of ['paused','menu','dialog','hidden']) {
    const h=harness();h.frame(1100);
    if(gate==='paused')h.context.paused=true;
    if(gate==='menu')h.menu=true;
    if(gate==='dialog')h.context.dialog.open=true;
    if(gate==='hidden')h.context.document.hidden=true;
    const before=serialize(h.game),hazards=cornHazards(h.game),renderCount=h.renders.length;
    h.frame(1200);h.frame(1700);
    assert.equal(serialize(h.game),before,gate);
    assert.deepEqual(cornHazards(h.game),hazards,gate);
    assert.ok(h.renders.slice(renderCount).every(frame=>frame.blocked),`${gate} is passed to Corn's input/render wrapper.`);

    h.context.paused=false;h.menu=false;h.context.dialog.open=false;h.context.document.hidden=false;
    h.frame(1800);
    assert.ok(Math.abs(h.game.rogue.time-.2)<1e-9,`${gate} resumes by one active frame.`);
    assert.equal(h.renders.at(-1).blocked,false);
  }
});

test('a leftover Corn loading flag cannot stop other game modes',()=>{
  for(const id of ['watch','broadcast','transmission']) {
    const game=createMiniGame(id,'story',193),h=harness(game);
    const clock=()=>id==='watch'?game.time:id==='broadcast'?game.rogue.time:game.resolution.activity.state.time;
    const before=clock();h.context.rogueUI.loading=true;
    h.frame(1100);
    assert.ok(clock()>before,`${id} retains its own frame clock outside Corn Escape.`);
  }
});
