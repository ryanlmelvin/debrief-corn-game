import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { GameAudio, PressureDrone } from '../docs/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
}
class Node {
  constructor() { for (const key of ['gain', 'frequency', 'pan', 'delayTime', 'Q']) this[key] = new Param(); this.connections = []; this.stops = []; }
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; }
  start() { this.started = true; }
  stop(time) { this.stops.push(time); }
}
class Context {
  constructor() { this.currentTime = 2; this.sampleRate = 8000; this.destination = new Node(); this.nodes = []; this.resumes = 0; this.suspends = 0; }
  node() { const node = new Node(); this.nodes.push(node); return node; }
  createGain() { return this.node(); }
  createOscillator() { return this.node(); }
  createStereoPanner() { return this.node(); }
  createBufferSource() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createDelay() { return this.node(); }
  createBuffer(channels, length) { const data = new Float32Array(length); return {getChannelData: () => data}; }
  async resume() { this.resumes++; }
  async suspend() { this.suspends++; }
}

test('pressure becomes louder, drier, closer and more insistent without allocating more voices', () => {
  const context = new Context(), drone = new PressureDrone(context, context.destination), count = context.nodes.length;
  drone.setPressure(.22);
  const early = {gain:drone.output.gain.value,wet:drone.distant.gain.value,dry:drone.dry.gain.value,pan:drone.right.position.pan.value,pulse:drone.throb.frequency.value};
  for (let p = .23; p < 1; p += .01) drone.setPressure(p);
  drone.setPressure(1);
  assert.ok(drone.output.gain.value > early.gain);
  assert.ok(drone.dry.gain.value > early.dry); assert.ok(drone.distant.gain.value < early.wet);
  assert.ok(drone.right.position.pan.value < early.pan); assert.ok(drone.throb.frequency.value > early.pulse);
  assert.ok(drone.output.gain.value <= 1); assert.equal(context.nodes.length, count);
  assert.equal(drone.breath.buffer.getChannelData(0)[0], 0);
  assert.equal(drone.breath.buffer.getChannelData(0).at(-1), 0);
  for (const invalid of [NaN, Infinity, -1, 0]) { drone.setPressure(invalid); assert.equal(drone.output.gain.value, 0); }
});

test('the takeover cuts the entire mix and any shot, even without an open dialog', async () => {
  const context = new Context(), sound = new GameAudio(context);
  sound.sync({enabled:true,held:false,pressure:1});sound.shot(true);
  const shot = [...sound.shots][0];
  sound.sync({enabled:true,held:false,pressure:1,takeover:true});
  assert.equal(sound.active,false);assert.equal(sound.master.gain.value,0);
  assert.deepEqual(sound.master.gain.events.at(-1),['linear',0,context.currentTime+.012]);
  assert.equal(shot.stops.at(-1),context.currentTime+.012);
  sound.shot(true);assert.equal(sound.shots.size,0);
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(context.suspends,1);assert.equal(sound.drone.output.gain.value,0);
  sound.sync({enabled:true,held:false,pressure:0});
  assert.equal(sound.drone.output.gain.value,0);assert.equal(sound.ambientLevel.gain.value,.55);
});

test('mute and pause resume the current pressure without a stale suspension or another sound graph', async () => {
  const context = new Context(), sound = new GameAudio(context), count = context.nodes.length;
  assert.equal(sound.master.gain.value,0);assert.equal(context.resumes,0);
  sound.sync({enabled:false,held:false,pressure:1});assert.equal(context.resumes,0);
  for (const gate of [{enabled:false,held:false},{enabled:true,held:true}]) {
    sound.sync({enabled:true,held:false,pressure:.6});
    sound.sync({...gate,pressure:.6});assert.equal(sound.master.gain.value,0);
    sound.sync({enabled:true,held:false,pressure:.6});
    assert.equal(sound.active,true);assert.equal(sound.pressure,.6);
    await new Promise(resolve=>setTimeout(resolve,35));
    assert.equal(context.suspends,0);
  }
  assert.equal(context.nodes.length,count);
});

test('AudioParam fallback cancels previous ramps before applying a new envelope', () => {
  const context = new Context(), drone = new PressureDrone(context, context.destination);
  drone.output.gain.cancelAndHoldAtTime = undefined;
  drone.setPressure(.5);drone.reset();
  assert.equal(drone.output.gain.value,0);assert.ok(drone.output.gain.events.some(e=>e[0]==='cancel'));
});

test('the game sends sound preference, pressure, all pause gates and the takeover to the mixer', () => {
  const source = readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  const calls = [], context = vm.createContext({soundscape:{sync:state=>calls.push(state)},soundEnabled:true,paused:false,dialog:{open:false},menuOpen:()=>false,document:{hidden:false},game:{phase:'tower'},investigationPressure:()=>({strength:.7})});
  vm.runInContext(source.slice(source.indexOf('function syncAudio()'),source.indexOf("$('sound').addEventListener")),context);
  vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).pressure,.7);
  for(const gate of ['paused','dialog.open','document.hidden']) {
    vm.runInContext(`${gate}=true;syncAudio();${gate}=false`,context);assert.equal(calls.at(-1).held,true);
  }
  context.menuOpen=()=>true;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).held,true);
  context.menuOpen=()=>false;context.game.phase='field';context.game.compulsionNotice=true;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).takeover,true);
  context.game.compulsionNotice=false;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).takeover,false);
  context.soundEnabled=false;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).enabled,false);
  const worker = readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8');
  assert.ok(worker.includes("'./audio.js'"));
});


test('sound confirmation is audible through the destination while the game mix is paused', async () => {
  const context = new Context(), sound = new GameAudio(context);
  sound.sync({enabled:true,held:false});
  sound.sync({enabled:true,held:true});
  sound.preview();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(context.suspends,0);
  assert.equal(sound.active,false);
  const tone = context.nodes.at(-2), gain = context.nodes.at(-1);
  assert.equal(tone.frequency.value,660);
  assert.ok(gain.gain.events.some(e=>e[0]==='linear' && e[1]===.12));
  assert.deepEqual(gain.connections,[context.destination]);
  assert.equal(tone.stops.length,1);
  tone.onended();
  assert.equal(tone.connections.length,0);assert.equal(gain.connections.length,0);
});
