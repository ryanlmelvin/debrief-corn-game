import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEvents } from '../docs/audio-events.js';
import { createGame, move } from '../docs/engine.js';

function setup() {
  const game=createGame('story');game.phase='field';
  const events=new SoundEvents(), calls=[];
  const sound={step:options=>calls.push(['step',options]),cueEncounter:(event,night)=>calls.push(['encounter',event,night])};
  events.reset(game);
  const sync=(enabled=true,style='quiet')=>events.update(game,sound,enabled,style);
  return {game,events,calls,sound,sync};
}

test('only successful movement produces footsteps, including automatic route callbacks',()=>{
  const {game,calls,sync}=setup();
  move(game,-1,0);sync();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'step');
  assert.equal(move(game,-1,0),false);sync();
  assert.equal(calls.length,1);
  move(game,1,0);sync(true,'direct');
  assert.deepEqual(calls[1],['step',{night:0,style:'direct'}]);
  sync();sync();assert.equal(calls.length,2);
});

test('encounter arrival and choice are each heard once across repeated renders',()=>{
  const {game,calls,sync}=setup();
  game.fieldEvents.pending={id:'first-call',choice:null};sync();sync();
  game.fieldEvents.pending.choice='answer';sync();sync();
  assert.deepEqual(calls,[['encounter',{id:'first-call',choice:null},0],['encounter',{id:'first-call',choice:'answer'},0]]);
});

test('resuming an encounter save is quiet; the next choice still has its own cue',()=>{
  const {game,events,calls,sync}=setup();
  game.fieldSteps=23;game.fieldEvents.pending={id:'extra-step',choice:null};
  events.reset(game);sync();assert.deepEqual(calls,[]);
  game.fieldEvents.pending.choice='turn';sync();assert.equal(calls.length,1);
});

test('mute, pause, hidden tabs and takeover consume cues without replay on resume',()=>{
  for(const soundReady of [true,false]) {
    const {game,events,calls,sound}=setup();
    game.fieldSteps++;game.fieldEvents.pending={id:'extra-step',choice:null};
    events.update(game,soundReady?sound:null,false);
    events.update(game,sound,true);
    assert.deepEqual(calls,[]);
    game.fieldEvents.pending.choice='turn';events.update(game,sound,true);
    assert.equal(calls.length,1);
  }
});

test('continuous guide travel has a steady walking cadence and no sound when stopped',()=>{
  const {game,events,calls,sync}=setup();
  game.phase='guide';game.guide={steps:0};events.reset(game);
  for(const steps of [.2,.6,1.1,1.6,2.1,2.1]){game.guide.steps=steps;sync();}
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call[0]==='step'));
});

test('new nights, runs, and phases do not replay movement or old encounters',()=>{
  const {game,calls,sync}=setup();
  game.shift++;game.fieldSteps=23;game.fieldEvents.pending={id:'extra-step',choice:null};sync();
  game.runId='another-run';sync();
  game.phase='ending';sync();
  assert.deepEqual(calls,[]);
});
