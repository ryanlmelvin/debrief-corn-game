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
    this.ambient = context.createBufferSource(); this.ambient.buffer = noise; this.ambient.loop = true;
    this.ambientLevel = context.createGain(); this.ambientLevel.gain.value = .16;
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
      ramp(this.master.gain, .08, now, .06);
      this.context.resume().catch(() => {});
    }
    const p = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0;
    if (p === this.pressure) return;
    this.pressure = p;
    this.drone.setPressure(p);
    ramp(this.ambientLevel.gain, .16 * (1 - .88 * p), now, .4);
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
