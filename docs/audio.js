// Generated locally: no recordings, downloads, or connection needed for sound.
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

// A composed, seamless night field rather than a constant bed of raw noise.
// Fixed event positions keep the atmosphere reproducible and work offline.
export function cornfieldAmbience(context) {
  const duration = 32, rate = context.sampleRate, length = rate * duration;
  const buffer = context.createBuffer(2, length, rate);
  const rustles = [2.4, 8.7, 15.2, 21.8, 28.1];
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 4301 + channel * 971, wind = 0, leafLow = 0, leafHigh = 0;
    const smooth = 1 - Math.exp(-2 * Math.PI * 380 / rate);
    const low = 1 - Math.exp(-2 * Math.PI * 650 / rate);
    const high = 1 - Math.exp(-2 * Math.PI * 2400 / rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 4294967296 * 2 - 1;
      wind += smooth * (noise - wind);
      leafLow += low * (noise - leafLow); leafHigh += high * (noise - leafHigh);
      // Long, uneven gusts with stretches of near stillness between them.
      const gust = (.5 + .5 * Math.sin(2 * Math.PI * t / 16 + channel * .4)) ** 3;
      let sample = wind * (.025 + .24 * gust);
      for (let event = 0; event < rustles.length; event++) {
        const age = t - rustles[event] - channel * .16;
        if (age > 0 && age < 2.2) {
          const envelope = Math.sin(Math.PI * age / 2.2) ** 2;
          const side = event % 2 === channel ? 1 : .35;
          sample += (leafHigh - leafLow) * envelope * side * .65;
          // A dry stalk flexing inside the rustle, well below the insect calls.
          sample += Math.sin(2 * Math.PI * (185 * age - 12 * age * age)) * envelope * side * .018;
        }
      }
      // Small groups of distant cricket chirps; no continuous high-pitched tone.
      const insectAge = (t + channel * 1.7) % 6.4;
      if (insectAge < .85) {
        const pulse = Math.max(0, Math.sin(2 * Math.PI * 14 * insectAge)) ** 4;
        const phrase = Math.sin(Math.PI * insectAge / .85) ** 2;
        sample += Math.sin(2 * Math.PI * (2600 + channel * 190) * t) * pulse * phrase * .035;
      }
      // A distant, barely tonal unease underneath the natural sounds.
      sample += Math.sin(2 * Math.PI * 96 * t) * .009 * (.3 + .7 * gust);
      const edge = Math.min(1, t / .4, (duration - 1 / rate - t) / .4);
      data[i] = sample * Math.max(0, edge);
    }
  }
  return buffer;
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
    ramp(this.output.gain, p ? .1 + .85 * p ** 1.3 : 0, now, p ? .6 : .3);
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
  constructor(context) {
    this.context = context; this.active = false; this.pressure = -1; this.suspendTimer = null; this.shots = new Set();
    this.master = context.createGain(); this.master.gain.value = 0; this.master.connect(context.destination);
    const noise = brownNoise(context);
    this.ambient = context.createBufferSource(); this.ambient.buffer = cornfieldAmbience(context); this.ambient.loop = true;
    this.ambientLevel = context.createGain(); this.ambientLevel.gain.value = .55;
    this.ambient.connect(this.ambientLevel); this.ambientLevel.connect(this.master); this.ambient.start();
    this.drone = new PressureDrone(context, this.master, noise);
  }
  sync({ enabled, held, pressure = 0, takeover = false }) {
    const active = enabled && !held && !takeover, now = this.context.currentTime;
    if (!active) {
      if (!this.active) return;
      this.active = false; this.pressure = -1;
      // Twelve milliseconds avoids a speaker click but reads as an abrupt cut.
      // This is after the delay, so neither the drone nor its tail can escape it.
      ramp(this.master.gain, 0, now, .012);
      for (const shot of this.shots) shot.stop(now + .012);
      this.shots.clear();
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (!this.active) { this.drone.reset(); this.context.suspend().catch(() => {}); }
      }, 25);
      return;
    }
    if (!this.active) {
      clearTimeout(this.suspendTimer); this.suspendTimer = null;
      this.drone.reset(); this.active = true;
      ramp(this.master.gain, .32, now, .06);
      this.context.resume().catch(() => {});
    }
    const p = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0;
    if (p === this.pressure) return;
    this.pressure = p;
    this.drone.setPressure(p);
    ramp(this.ambientLevel.gain, .55 * (1 - .88 * p), now, .4);
  }
  preview() {
    // Bypass the paused mix so enabling sound in the menu always confirms it.
    clearTimeout(this.suspendTimer); this.suspendTimer = null;
    const context = this.context, now = context.currentTime;
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'sine'; tone.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.12, now + .02);
    gain.gain.exponentialRampToValueAtTime(.001, now + .3);
    tone.connect(gain); gain.connect(context.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(); tone.stop(now + .32);
  }
  shot(hit) {
    if (!this.active) return;
    const context = this.context, oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(hit ? 170 : 130, now); oscillator.frequency.exponentialRampToValueAtTime(45, now + .14);
    gain.gain.setValueAtTime(.9, now); gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    oscillator.connect(gain); gain.connect(this.master); this.shots.add(oscillator);
    oscillator.onended = () => { this.shots.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(now + .2);
  }
}
