// Recorded CC0 music and field sounds; see assets/MUSIC-LICENSE.txt and SOUND-LICENSE.txt.
function ramp(param, value, time, duration = .25) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else { const held = param.value; param.cancelScheduledValues(time); param.setValueAtTime(held, time); }
  if (duration) param.linearRampToValueAtTime(value, time + duration);
  else param.setValueAtTime(value, time);
}

function brownNoise(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 40130, previous = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    previous = (previous + ((seed / 4294967296) * 2 - 1) * .035) / 1.025;
    data[i] = previous * 3;
  }
  // Remove the endpoint mismatch so the loop doesn't announce itself with a click.
  const first = data[0], last = data[data.length - 1];
  for (let i = 0; i < data.length; i++) data[i] -= first + (last - first) * i / (data.length - 1);
  return buffer;
}

export async function loadMusic(context, fetchFile = fetch) {
  const response = await fetchFile(new URL('./assets/lost-in-a-bad-place.mp3', import.meta.url));
  if (!response.ok) throw new Error(`Music download failed: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export async function loadEffects(context, fetchFile = fetch) {
  const files = {crickets:'crickets.mp3', footstep:'footstep.mp3', leaves:'leaves.mp3', radio:'radio-static.mp3'};
  const sounds = await Promise.all(Object.entries(files).map(async ([name, file]) => {
    try {
      const response = await fetchFile(new URL(`./assets/${file}`, import.meta.url));
      if (!response.ok) return null;
      return [name, await context.decodeAudioData(await response.arrayBuffer())];
    } catch { return null; } // One unavailable effect must never prevent music or play.
  }));
  return Object.fromEntries(sounds.filter(Boolean));
}

export class PressureDrone {
  constructor(context, destination, noise = brownNoise(context)) {
    this.context = context;
    this.output = context.createGain(); this.output.gain.value = 0; this.output.connect(destination);
    this.pulse = context.createGain(); this.pulse.gain.value = .75;
    this.dry = context.createGain(); this.dry.gain.value = .12;
    this.distant = context.createGain(); this.distant.gain.value = .65;
    const delay = context.createDelay(.5); delay.delayTime.value = .23;
    const muffled = context.createBiquadFilter(); muffled.type = 'lowpass'; muffled.frequency.value = 230;
    this.pulse.connect(this.dry); this.dry.connect(this.output);
    this.pulse.connect(delay); delay.connect(muffled); muffled.connect(this.distant); this.distant.connect(this.output);
    const voice = (type, frequency, level, pan = 0) => {
      const oscillator = context.createOscillator(), gain = context.createGain(), position = context.createStereoPanner();
      oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.value = level; position.pan.value = pan;
      oscillator.connect(gain); gain.connect(position); position.connect(this.pulse); oscillator.start();
      return { oscillator, gain, position };
    };
    this.low = voice('sine', 51, .6);
    this.body = voice('triangle', 102, .28);
    this.left = voice('sine', 153, .03, -.85);
    this.right = voice('sine', 153.7, .03, .85);
    this.breath = context.createBufferSource(); this.breath.buffer = noise; this.breath.loop = true;
    this.breathFilter = context.createBiquadFilter(); this.breathFilter.type = 'bandpass'; this.breathFilter.Q.value = .65;
    this.breathLevel = context.createGain(); this.breathLevel.gain.value = .09;
    this.breath.connect(this.breathFilter); this.breathFilter.connect(this.breathLevel); this.breathLevel.connect(this.pulse); this.breath.start();
    this.throb = context.createOscillator(); this.throb.frequency.value = .16;
    this.throbDepth = context.createGain(); this.throbDepth.gain.value = .02;
    this.throb.connect(this.throbDepth); this.throbDepth.connect(this.pulse.gain); this.throb.start();
  }
  reset() { ramp(this.output.gain, 0, this.context.currentTime, 0); }
  setPressure(value) {
    const p = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0, now = this.context.currentTime;
    // Build tension through proximity and beating tones without a large bass jump.
    ramp(this.output.gain, .28 * p ** .85, now, p ? .8 : .3);
    if (!p) return;
    // The delayed, muffled space gives way to a dry, almost centered beating tone.
    ramp(this.dry.gain, .12 + .78 * p, now, .6);
    ramp(this.distant.gain, .65 * (1 - p) ** 2, now, .6);
    ramp(this.low.oscillator.frequency, 51 - 5 * p, now, .6);
    ramp(this.body.oscillator.frequency, 102 - 10 * p, now, .6);
    ramp(this.left.oscillator.frequency, 153 - 13 * p, now, .6);
    ramp(this.right.oscillator.frequency, 153.7 - 9.7 * p, now, .6);
    for (const [voice, side] of [[this.left, -1], [this.right, 1]]) {
      ramp(voice.gain.gain, .03 + .15 * p ** 2, now, .6);
      ramp(voice.position.pan, side * (.85 - .77 * p), now, .6);
    }
    ramp(this.breathFilter.frequency, 220 + 300 * p, now, .6);
    ramp(this.breathLevel.gain, .09 + .11 * p, now, .6);
    ramp(this.throb.frequency, .16 + .49 * p, now, .6);
    ramp(this.throbDepth.gain, .02 + .15 * p, now, .6);
  }
}

export class GameAudio {
  constructor(context, musicBuffer, effects = {}) {
    this.context = context; this.active = false; this.pressure = -1; this.suspendTimer = null; this.shots = new Set();
    this.shotGains = new Map();
    this.effects = effects; this.voices = new Map(); this.stepCount = 0; this.lastStepAt = -Infinity;
    this.encounterKey = ''; this.scene = ''; this.mixKey = '';
    this.master = context.createGain(); this.master.gain.value = 0; this.master.connect(context.destination);
    // Level the music swells and overlapping effects before the final silence
    // gate. Compressor look-ahead/release can never leak past a takeover cut.
    this.mix = context.createDynamicsCompressor();
    this.mix.threshold.value = -24; this.mix.knee.value = 12; this.mix.ratio.value = 3;
    this.mix.attack.value = .015; this.mix.release.value = .35;
    this.mix.connect(this.master);
    const noise = brownNoise(context);
    this.ambient = context.createBufferSource(); this.ambient.buffer = musicBuffer; this.ambient.loop = true;
    this.ambientLevel = context.createGain(); this.ambientLevel.gain.value = .55;
    this.ambient.connect(this.ambientLevel); this.ambientLevel.connect(this.mix); this.ambient.start();
    this.drone = new PressureDrone(context, this.mix, noise);
    if (effects.crickets) {
      this.crickets = context.createBufferSource(); this.crickets.buffer = effects.crickets; this.crickets.loop = true;
      this.cricketLevel = context.createGain(); this.cricketLevel.gain.value = 0;
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 4200;
      this.crickets.connect(filter); filter.connect(this.cricketLevel); this.cricketLevel.connect(this.mix); this.crickets.start();
    }
  }
  sync({ enabled, held, pressure = 0, takeover = false, scene = 'tower', night = 0, encounter = null }) {
    const active = enabled && !held && !takeover, now = this.context.currentTime;
    this.takeover = takeover;
    if (takeover && this.previewVoice) {
      ramp(this.previewVoice.gain.gain, 0, now, .012);
      this.previewVoice.tone.stop(now + .012); this.previewVoice = null;
    }
    const encounterKey = encounter ? `${encounter.id}:${encounter.choice || ''}` : '';
    if (scene !== this.scene || encounterKey !== this.encounterKey) {
      // Cancel scheduled scares on every story transition; they must not follow
      // the player into the next page or resume after a pause.
      this.stopEffects(); this.lastStepAt = -Infinity;
      this.scene = scene; this.encounterKey = encounterKey;
    }
    if (!active) {
      if (!this.active) return;
      this.active = false; this.pressure = -1; this.mixKey = '';
      // Twelve milliseconds avoids a speaker click but reads as an abrupt cut.
      // This is after the delay, so neither the drone nor its tail can escape it.
      ramp(this.master.gain, 0, now, .012);
      for (const shot of this.shots) shot.stop(now + .012);
      this.shots.clear(); this.shotGains.clear();
      this.stopEffects();
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (!this.active) { this.drone.reset(); this.context.suspend().catch(() => {}); }
      }, 25);
      return;
    }
    if (!this.active) {
      clearTimeout(this.suspendTimer); this.suspendTimer = null;
      this.drone.reset(); this.active = true;
      // Compensate for the compressor's built-in makeup gain.
      ramp(this.master.gain, .22, now, .12);
      this.context.resume().catch(() => {});
    }
    const p = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0;
    if (p !== this.pressure) { this.pressure = p; this.drone.setPressure(p); }
    const mixKey = `${p}:${scene}:${night}:${encounterKey}`;
    if (mixKey === this.mixKey) return;
    this.mixKey = mixKey;
    const ordinaryField = encounter?.id === 'second-call' && encounter.choice === 'compare';
    ramp(this.ambientLevel.gain, .55 * (1 - .55 * p) * (encounter ? .9 : 1), now, .6);
    if (this.cricketLevel) {
      const outdoors = ['tower', 'field', 'guide'].includes(scene);
      const insects = outdoors && (!encounter || ordinaryField) ? .18 * (1 - p) ** 2 : 0;
      ramp(this.cricketLevel.gain, insects, now, insects ? 1.2 : .18);
    }
  }
  stopEffects() {
    const now = this.context.currentTime;
    for (const [source, voice] of this.voices) {
      ramp(voice.gain.gain, 0, now, .012);
      source.stop(now + .012);
    }
    this.voices.clear();
  }
  sample(name, {level = .25, pan = 0, toPan = pan, rate = 1, delay = 0, duration, cutoff = 3200} = {}) {
    const buffer = this.effects[name];
    if (!this.active || !buffer || this.voices.size >= 8) return;
    const context = this.context, source = context.createBufferSource(), gain = context.createGain();
    const position = context.createStereoPanner(), filter = context.createBiquadFilter();
    const start = context.currentTime + delay, length = Math.min(duration || buffer.duration / rate, buffer.duration / rate);
    source.buffer = buffer; source.playbackRate.value = rate;
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .7;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + Math.min(.02, length / 4));
    gain.gain.setValueAtTime(level, start + Math.max(length / 2, length - .12));
    gain.gain.linearRampToValueAtTime(0, start + length);
    position.pan.setValueAtTime(pan, start); position.pan.linearRampToValueAtTime(toPan, start + length);
    source.connect(filter); filter.connect(gain); gain.connect(position); position.connect(this.mix);
    this.voices.set(source, {gain, name});
    source.onended = () => {
      this.voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); position.disconnect();
    };
    source.start(start); source.stop(start + length);
    return source;
  }
  step({night = 0, style = 'quiet'} = {}) {
    const now = this.context.currentTime;
    if (!this.active || now - this.lastStepAt < .14) return;
    this.lastStepAt = now; this.stepCount++;
    this.sample('footstep', {level:.24, pan:this.stepCount % 2 ? -.1 : .1, rate:[1,.96,1.035,.985][this.stepCount % 4], cutoff:2200});
    if (this.stepCount % 3 === 0) {
      const shift = Math.max(0, Math.min(2, night));
      const side = this.stepCount % 2 ? -1 : 1;
      this.sample('leaves', {level:(style === 'direct' ? .26 : .18) + .025 * shift, pan:side * (.6 - .15 * shift), rate:.94 + .025 * shift});
    }
  }
  cueEncounter({id, choice = null}, night = 0) {
    if (!this.active) return;
    if (!choice) {
      const radioNight = ['first-call', 'second-call', 'future-call'].indexOf(id);
      if (radioNight >= 0) this.sample('radio', {level:[.26,.22,.18][radioNight], duration:[1.2,.7,.3][radioNight], cutoff:3200, pan:-.18});
      if (id === 'extra-step' || id === 'paired-tracks') this.sample('footstep', {level:.26, delay:id === 'extra-step' ? .55 : .35, pan:.45, rate:.93, cutoff:1700});
      if (id === 'last-follower') this.sample('leaves', {level:.31, delay:.15, pan:-.65, toPan:.55, rate:.9});
      if (id === 'lamp-keeper' || id === 'your-outline') this.sample('leaves', {level:.18 + Math.min(2, Math.max(0, night)) * .025, pan:.5, delay:.2, rate:.91});
    } else if (id === 'first-call' && choice === 'answer') {
      this.sample('leaves', {level:.25, pan:.6, delay:.12, rate:.95});
    } else if (id === 'extra-step' && choice === 'turn') {
      this.sample('leaves', {level:.2, pan:.35, rate:.9});
    } else if (id === 'second-call' && choice === 'disconnect') {
      this.sample('footstep', {level:.2, pan:-.18, delay:.12, cutoff:1100});
    }
    // Comparing recordings restores the ordinary insects through sync(). The
    // final radio choices intentionally add nothing after the follower stops.
  }
  watchCue(kind) {
    if (!this.active || this.scene !== 'tower') return;
    // Small mechanical sounds belong to the station equipment. Avoid a musical
    // fanfare, and replace any unfinished cue instead of stacking reward sounds.
    const notes = {
      bell: [[540, .085, .48, 0, 'triangle'], [1370, .022, .27, 0, 'sine']],
      rush: [[440, .055, .1, 0, 'sine'], [660, .045, .16, .13, 'sine']],
      flare: [[720, .05, .18, 0, 'triangle']],
      reload: [[310, .05, .09, 0, 'triangle']]
    }[kind];
    if (!notes) return;
    const context = this.context, now = context.currentTime;
    for (const [source, voice] of this.voices) if (voice.name.startsWith('watch-')) {
      ramp(voice.gain.gain, 0, now, .012); source.stop(now + .012); this.voices.delete(source);
    }
    if (this.voices.size + notes.length > 8) return;
    for (const [frequency, level, duration, delay, type] of notes) {
      const tone = context.createOscillator(), gain = context.createGain(), start = now + delay;
      tone.type = type; tone.frequency.setValueAtTime(frequency, start);
      tone.frequency.exponentialRampToValueAtTime(frequency * .97, start + duration);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      tone.connect(gain); gain.connect(this.mix);
      this.voices.set(tone, {gain, name:`watch-${kind}`});
      tone.onended = () => { this.voices.delete(tone); tone.disconnect(); gain.disconnect(); };
      tone.start(start); tone.stop(start + duration + .01);
    }
  }
  preview() {
    if (this.takeover) return;
    // Bypass the paused mix so enabling sound in the menu always confirms it.
    clearTimeout(this.suspendTimer); this.suspendTimer = null;
    const context = this.context, now = context.currentTime;
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'sine'; tone.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.035, now + .03);
    gain.gain.exponentialRampToValueAtTime(.001, now + .3);
    tone.connect(gain); gain.connect(context.destination);
    if (this.previewVoice) this.previewVoice.tone.stop(now);
    this.previewVoice = {tone,gain};
    tone.onended = () => { if(this.previewVoice?.tone===tone)this.previewVoice=null; tone.disconnect(); gain.disconnect(); };
    tone.start(); tone.stop(now + .32);
  }
  shot(result) {
    if (!this.active) return;
    const armor = result === 'armor', hit = result === true || result === 'hit';
    const context = this.context, now = context.currentTime;
    // Keep rapid clicks from piling up several full-volume impacts.
    if (this.shots.size >= 2) {
      const oldest = this.shots.values().next().value;
      ramp(this.shotGains.get(oldest).gain, 0, now, .008);
      oldest.stop(now + .008); this.shots.delete(oldest); this.shotGains.delete(oldest);
    }
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(armor ? 340 : hit ? 170 : 130, now); oscillator.frequency.exponentialRampToValueAtTime(45, now + (armor ? .09 : .14));
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(armor ? .2 : .24, now + .006); gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    oscillator.connect(gain); gain.connect(this.mix); this.shots.add(oscillator); this.shotGains.set(oscillator,gain);
    oscillator.onended = () => { this.shots.delete(oscillator); this.shotGains.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(now + .2);
  }
}
