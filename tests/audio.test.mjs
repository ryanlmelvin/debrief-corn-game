import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { GameAudio, PressureDrone, loadMusic, loadEffects } from '../docs/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
}
class Node {
  constructor() { for (const key of ['gain', 'frequency', 'pan', 'delayTime', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param(); this.connections = []; this.stops = []; this.starts = []; }
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; }
  start(...args) { this.started = true; this.starts.push(args); }
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
  createDynamicsCompressor() { return this.node(); }
  createBuffer(channels, length) { const data = Array.from({length:channels}, () => new Float32Array(length)); return {duration:length/this.sampleRate,getChannelData: channel => data[channel]}; }
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
  const context = new Context(), sound = new GameAudio(context, context.createBuffer(2, 8000));
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
  const context = new Context(), sound = new GameAudio(context, context.createBuffer(2, 8000)), count = context.nodes.length;
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
  const calls = [], context = vm.createContext({soundscape:{sync:state=>calls.push(state)},soundEvents:{update(){}},fieldMap:{style:'quiet'},soundEnabled:true,paused:false,modalKind:'',dialog:{open:false},menuOpen:()=>false,document:{hidden:false},game:{phase:'tower'},investigationPressure:()=>({strength:.7})});
  vm.runInContext(source.slice(source.indexOf('function syncAudio()'),source.indexOf("$('sound').addEventListener")),context);
  vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).pressure,.7);
  for(const gate of ['paused','dialog.open','document.hidden']) {
    vm.runInContext(`${gate}=true;syncAudio();${gate}=false`,context);assert.equal(calls.at(-1).held,true);
  }
  context.modalKind='encounter';context.dialog.open=true;
  vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).held,false);
  for(const gate of ['paused','document.hidden']) {
    vm.runInContext(`${gate}=true;syncAudio();${gate}=false`,context);assert.equal(calls.at(-1).held,true);
  }
  context.dialog.open=false;context.modalKind='';
  context.menuOpen=()=>true;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).held,true);
  context.menuOpen=()=>false;context.game.phase='field';context.game.compulsionNotice=true;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).takeover,true);
  context.game.compulsionNotice=false;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).takeover,false);
  context.soundEnabled=false;vm.runInContext('syncAudio()',context);assert.equal(calls.at(-1).enabled,false);
  const worker = readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8');
  assert.ok(worker.includes("'./audio.js'"));
});


test('sound confirmation is audible through the destination while the game mix is paused', async () => {
  const context = new Context(), sound = new GameAudio(context, context.createBuffer(2, 8000));
  sound.sync({enabled:true,held:false});
  sound.sync({enabled:true,held:true});
  sound.preview();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(context.suspends,0);
  assert.equal(sound.active,false);
  const tone = context.nodes.at(-2), gain = context.nodes.at(-1);
  assert.equal(tone.frequency.value,660);
  assert.ok(gain.gain.events.some(e=>e[0]==='linear' && e[1]===.035));
  assert.deepEqual(gain.connections,[context.destination]);
  assert.equal(tone.stops.length,1);
  tone.onended();
  assert.equal(tone.connections.length,0);assert.equal(gain.connections.length,0);
});

test('compulsion also stops a confirmation tone while paused and prevents a new preview', () => {
  const context = new Context(), sound = new GameAudio(context,{duration:134});
  sound.sync({enabled:true,held:true});sound.preview();
  const {tone,gain}=sound.previewVoice;
  sound.sync({enabled:true,held:true,takeover:true});
  assert.equal(sound.previewVoice,null);
  assert.equal(gain.gain.value,0);assert.equal(tone.stops.at(-1),context.currentTime+.012);
  const count=context.nodes.length;
  sound.preview();assert.equal(context.nodes.length,count);
  tone.onended();assert.equal(tone.connections.length,0);assert.equal(gain.connections.length,0);
  sound.sync({enabled:true,held:true,takeover:false});sound.preview();
  assert.ok(sound.previewVoice);sound.previewVoice.tone.onended();
  assert.equal(sound.previewVoice,null);
});


test('recorded music loads from the game host and decodes before playback', async () => {
  const bytes = new ArrayBuffer(8), music = {duration:134};
  const context = {decodeAudioData: async data => {assert.equal(data,bytes);return music;}};
  const decoded = await loadMusic(context,async url => {
    assert.ok(url.pathname.endsWith('/assets/lost-in-a-bad-place.mp3'));
    return {ok:true,arrayBuffer:async()=>bytes};
  });
  assert.equal(decoded,music);
  await assert.rejects(loadMusic(context,async()=>({ok:false,status:404})),/404/);
  await assert.rejects(loadMusic({decodeAudioData:async()=>{throw new Error('decode failed');}},async()=>({ok:true,arrayBuffer:async()=>bytes})),/decode failed/);
  const graph = new Context(), sound = new GameAudio(graph,music);
  assert.equal(sound.ambient.buffer,music);assert.equal(sound.ambient.loop,true);
  const worker = readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8');
  assert.ok(worker.includes("'./assets/lost-in-a-bad-place.mp3'"));
});

const fieldEffects = () => ({crickets:{duration:11.45},footstep:{duration:.42},leaves:{duration:1.4},radio:{duration:3}});

test('music, drone, insects, footsteps and shots pass through compression before the final silence gate', () => {
  const context = new Context(), sound = new GameAudio(context,{duration:134},fieldEffects());
  sound.sync({enabled:true,scene:'field'});sound.step();sound.shot(true);
  assert.deepEqual(sound.ambientLevel.connections,[sound.mix]);
  assert.deepEqual(sound.drone.output.connections,[sound.mix]);
  assert.deepEqual(sound.cricketLevel.connections,[sound.mix]);
  const stepGain = [...sound.voices.values()][0].gain;
  assert.deepEqual(stepGain.connections[0].connections,[sound.mix]);
  const shot = [...sound.shots][0];
  assert.deepEqual(shot.connections[0].connections,[sound.mix]);
  assert.deepEqual(sound.mix.connections,[sound.master]);
  assert.deepEqual(sound.master.connections,[context.destination]);
  assert.deepEqual(context.nodes.filter(node=>node.connections.includes(context.destination)),[sound.master]);
  assert.ok(sound.mix.threshold.value < 0 && sound.mix.ratio.value > 1);
  assert.ok(sound.mix.knee.value > 0 && sound.mix.attack.value > 0 && sound.mix.release.value > sound.mix.attack.value);
});

test('rapid shots keep only two full envelopes, ease in from silence, and release every replaced voice', () => {
  const context = new Context(), sound = new GameAudio(context,{duration:134});
  sound.sync({enabled:true});
  const shots = [];
  for(let i=0;i<6;i++) {
    sound.shot(i%2===0);
    const source=[...sound.shots].at(-1), gain=sound.shotGains.get(source);
    shots.push({source,gain});
    assert.ok(sound.shots.size <= 2);assert.equal(sound.shotGains.size,sound.shots.size);
    assert.deepEqual(gain.gain.events[0],['set',0,context.currentTime]);
    const attack=gain.gain.events.find(event=>event[0]==='linear'&&event[1]>0);
    assert.ok(attack && attack[1]<.5 && attack[2]>context.currentTime);
    const release=gain.gain.events.find(event=>event[0]==='exponential');
    assert.ok(release && release[1]<attack[1]/100 && release[2]>attack[2]);
    context.currentTime+=.001;
  }
  assert.equal(sound.shots.size,2);
  for(const {source,gain} of shots.slice(0,-2)) {
    assert.ok(source.stops.at(-1)<source.stops[0]);
    assert.equal(gain.gain.events.at(-1)[0],'linear');
    assert.equal(gain.gain.events.at(-1)[1],0);
    assert.equal(sound.shots.has(source),false);
  }
  for(const {source,gain} of shots) {
    source.onended();assert.equal(source.connections.length,0);assert.equal(gain.connections.length,0);
  }
  assert.equal(sound.shots.size,0);assert.equal(sound.shotGains.size,0);
});

test('every pause gate clears shot tracking and silences the downstream gate without changing the compressor graph', async () => {
  for(const gate of [{held:true},{enabled:false},{takeover:true}]) {
    const context = new Context(), sound = new GameAudio(context,{duration:134});
    sound.sync({enabled:true});sound.shot(true);sound.shot(false);
    const sources=[...sound.shots], count=context.nodes.length;
    sound.sync({enabled:true,...gate});
    assert.equal(sound.shots.size,0);assert.equal(sound.shotGains.size,0);
    assert.equal(sound.master.gain.value,0);assert.deepEqual(sound.mix.connections,[sound.master]);
    for(const source of sources)assert.ok(source.stops.at(-1)<=context.currentTime+.012);
    sound.sync({enabled:true});
    await new Promise(resolve=>setTimeout(resolve,35));
    assert.equal(context.nodes.length,count);assert.equal(context.suspends,0);
  }
});

test('field samples load independently so a missing or unsupported clip cannot block sound', async () => {
  const requested = [], bytes = new ArrayBuffer(2);
  const clips = await loadEffects({decodeAudioData:async()=>({duration:1})},async url => {
    requested.push(url.pathname);
    if (url.pathname.endsWith('/leaves.mp3')) throw new Error('offline');
    return {ok:!url.pathname.endsWith('/radio-static.mp3'),arrayBuffer:async()=>bytes};
  });
  assert.equal(requested.length,4);
  assert.ok(requested.every(path=>path.includes('/assets/')));
  assert.deepEqual(Object.keys(clips).sort(),['crickets','footstep']);
  assert.deepEqual(await loadEffects({decodeAudioData:async()=>{throw new Error('unsupported');}},async()=>({ok:true,arrayBuffer:async()=>bytes})),{});
});

test('crickets recede with pressure and story danger, return for the recording comparison, and reuse one loop', () => {
  const context = new Context(), effects = fieldEffects(), sound = new GameAudio(context,{duration:134},effects);
  const count = context.nodes.length;
  sound.sync({enabled:true,scene:'field'});
  assert.equal(sound.crickets.buffer,effects.crickets);assert.equal(sound.crickets.loop,true);
  assert.equal(sound.cricketLevel.gain.value,.18);
  sound.sync({enabled:true,scene:'tower',pressure:.7});
  assert.ok(sound.cricketLevel.gain.value < .02);
  sound.sync({enabled:true,scene:'field',encounter:{id:'extra-step',choice:null}});
  assert.equal(sound.cricketLevel.gain.value,0);
  sound.sync({enabled:true,scene:'field',encounter:{id:'second-call',choice:'compare'}});
  assert.equal(sound.cricketLevel.gain.value,.18);
  sound.sync({enabled:true,scene:'ending'});
  assert.equal(sound.cricketLevel.gain.value,0);
  assert.equal(context.nodes.length,count);
});

test('successful movement sounds are quiet, varied, bounded, and add only sparse rustles', () => {
  const context = new Context(), sound = new GameAudio(context,{duration:134},fieldEffects());
  sound.step();assert.equal(sound.voices.size,0);
  sound.sync({enabled:true,scene:'field'});
  sound.step();const first = [...sound.voices.keys()][0];
  sound.step();assert.equal(sound.voices.size,1);
  context.currentTime += .2;sound.step();
  const second = [...sound.voices.keys()][1];
  assert.notEqual(first.playbackRate.value,second.playbackRate.value);
  context.currentTime += .2;sound.step({night:2,style:'direct'});
  assert.deepEqual([...sound.voices.values()].map(v=>v.name),['footstep','footstep','footstep','leaves']);
  for (const {gain} of sound.voices.values()) assert.ok(gain.gain.events.filter(e=>['linear','set'].includes(e[0])).every(e=>e[1] <= .34));
  for (let i=0;i<20;i++) {context.currentTime += .2;sound.step();}
  assert.equal(sound.voices.size,8);
  first.onended();assert.equal(sound.voices.size,7);assert.equal(first.connections.length,0);
});

test('the extra footstep is delayed and every pause gate cancels it without replay on resume', async () => {
  for (const gate of [{held:true},{enabled:false},{takeover:true}]) {
    const context = new Context(), sound = new GameAudio(context,{duration:134},fieldEffects());
    const state = {enabled:true,held:false,scene:'field',encounter:{id:'extra-step',choice:null}};
    sound.sync(state);sound.cueEncounter(state.encounter);
    assert.equal(sound.voices.size,1);
    const source = [...sound.voices.keys()][0];
    assert.equal(source.starts[0][0],context.currentTime+.55);
    sound.sync({...state,...gate});
    assert.equal(sound.master.gain.value,0);assert.equal(sound.voices.size,0);
    assert.ok(source.stops.at(-1) < source.starts[0][0]);
    sound.cueEncounter(state.encounter);sound.step();assert.equal(sound.voices.size,0);
    await new Promise(resolve=>setTimeout(resolve,35));
    sound.sync(state);assert.equal(sound.voices.size,0);
  }
});

test('radio interference shortens over the nights and a story transition cancels the previous cue', () => {
  const context = new Context(), sound = new GameAudio(context,{duration:134},fieldEffects());
  const lengths = [];
  for (const id of ['first-call','second-call','future-call']) {
    const previous = [...sound.voices.keys()][0], encounter = {id,choice:null};
    sound.sync({enabled:true,scene:'field',encounter});
    if (previous) assert.equal(previous.stops.at(-1),context.currentTime+.012);
    sound.cueEncounter(encounter);
    const source = [...sound.voices.keys()][0];
    assert.equal(sound.voices.size,1);assert.equal(source.buffer,sound.effects.radio);
    lengths.push(source.stops[0]-source.starts[0][0]);
    context.currentTime += .1;
  }
  assert.ok(lengths[0] > lengths[1] && lengths[1] > lengths[2]);
  const encounter = {id:'last-follower',choice:null};
  sound.sync({enabled:true,scene:'field',encounter});sound.cueEncounter(encounter,2);
  assert.equal([...sound.voices.values()][0].name,'leaves');
  sound.sync({enabled:true,scene:'field',encounter:{...encounter,choice:'leave'}});
  sound.cueEncounter({...encounter,choice:'leave'},2);
  assert.equal(sound.voices.size,0);
});
