// The tape keeps the roots quiet. The player still has to let go between grips.
// This activity never decides an ending: carrying the person costs the recordings
// only when the player accepts that final choice in the resolution scene.
const TAPE_STEPS = 12;
const CYCLE = 5.6;
const QUIET_START = 1;
const QUIET_END = 3.6;
const WARNING_START = 3;
const GRIP_SECONDS = 1.3;
const TOTAL_PULLS = 4;
const MAX_TIME = 1e7;
const KEYS = ['version', 'stage', 'time', 'offset', 'target', 'pulls', 'progress', 'holding', 'needsRelease', 'lastPullCycle', 'slips'];
const finite = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const cycleAt = time => Math.floor((time + 1e-9) / CYCLE);
const positionAt = time => Math.max(0, time - cycleAt(time) * CYCLE);
const quietAt = time => positionAt(time) >= QUIET_START && positionAt(time) < QUIET_END;

export function createRescue(seed = 0) {
  return {
    version: 1, stage: 'align', time: 0, offset: 0,
    target: 2 + ((Number.isFinite(seed) ? seed : 0) >>> 0) % 8,
    pulls: 0, progress: 0, holding: false, needsRelease: false,
    lastPullCycle: -1, slips: 0
  };
}

export function rescueStatus(r) {
  if (!validRescue(r)) return null;
  const cycle = cycleAt(r.time), position = positionAt(r.time);
  const aligned = r.offset === r.target;
  const safe = r.stage === 'pull' && quietAt(r.time);
  const warning = safe && position >= WARNING_START;
  const canPull = safe && !r.holding && !r.needsRelease && r.lastPullCycle !== cycle;
  let cue, instruction;
  if (r.stage === 'align') {
    cue = aligned ? 'The two breaths overlap.' : 'Bring the two breaths together.';
    instruction = aligned ? 'Play them together. The roots will loosen between breaths.' : 'Move the tape earlier or later until its dashed line matches the radio.';
  } else if (r.stage === 'complete') {
    cue = 'Both boots are free.';
    instruction = 'The radio and recorder must stay here. You have both hands free to help.';
  } else if (r.needsRelease) {
    cue = r.lastPullCycle === cycle ? 'A little farther. Let go.' : 'The roots caught your grip. Let go.';
    instruction = 'Release the pull control, then wait for the next quiet breath.';
  } else if (r.lastPullCycle === cycle) {
    cue = 'A little farther. Rest your hands.';
    instruction = 'One grip at a time. Wait for the next quiet breath.';
  } else if (warning) {
    cue = 'The roots are tightening.';
    instruction = 'Release before the silence ends. Your completed grips are safe.';
  } else if (safe) {
    cue = r.holding ? 'Keep pulling. The roots are loose.' : 'Quiet. Pull now.';
    instruction = 'Hold to pull, then release after each grip.';
  } else {
    cue = position < QUIET_START ? 'Listen. The voices are coming together.' : 'The roots are tight. Wait.';
    instruction = 'Wait for QUIET, then hold to pull. Release when the roots tighten.';
  }
  return {
    stage: r.stage, aligned, offset: r.offset, target: r.target,
    safe, warning, cycle, cyclePosition: position / CYCLE, canPull,
    pulls: r.pulls, totalPulls: TOTAL_PULLS, progress: r.progress / GRIP_SECONDS,
    holding: r.holding, needsRelease: r.needsRelease, cue, instruction,
    boots: [0, 1].map(index => ({
      freed: r.pulls >= (index + 1) * 2,
      progress: Math.max(0, Math.min(1, (r.pulls + r.progress / GRIP_SECONDS - index * 2) / 2))
    }))
  };
}

function loseGrip(r) {
  r.progress = 0;
  r.needsRelease = true;
  r.slips = Math.min(1e6, r.slips + 1);
}

export function rescueAction(r, action) {
  if (!validRescue(r) || r.stage === 'complete') return false;
  if (r.stage === 'align') {
    if (action === 'earlier' || action === 'later') {
      r.offset = (r.offset + (action === 'earlier' ? -1 : 1) + TAPE_STEPS) % TAPE_STEPS;
      return true;
    }
    if (action !== 'align' || r.offset !== r.target) return false;
    r.stage = 'pull';
    return true;
  }
  if (action === 'release') {
    if (!r.holding && !r.needsRelease && !r.progress) return false;
    r.holding = false;
    r.needsRelease = false;
    r.progress = 0;
    return true;
  }
  if (action !== 'pull' || r.holding || r.needsRelease) return false;
  r.holding = true;
  if (!quietAt(r.time) || r.lastPullCycle === cycleAt(r.time)) loseGrip(r);
  return true;
}

export function advanceRescue(r, dt) {
  if (!validRescue(r) || r.stage !== 'pull' || !Number.isFinite(dt) || dt <= 0) return false;
  // Splitting the simulation prevents a large frame from skipping a tightening
  // interval and awarding progress for time spent pulling against closed roots.
  let remaining = Math.min(dt, 60, MAX_TIME - r.time);
  const initial = remaining;
  while (remaining > 1e-9 && r.stage === 'pull') {
    const step = Math.min(remaining, .02);
    remaining -= step;
    r.time = Math.min(MAX_TIME, r.time + step);
    if (!r.holding || r.needsRelease) continue;
    if (!quietAt(r.time) || r.lastPullCycle === cycleAt(r.time)) { loseGrip(r); continue; }
    r.progress += step;
    if (r.progress + 1e-9 < GRIP_SECONDS) continue;
    r.pulls++;
    r.progress = 0;
    r.lastPullCycle = cycleAt(r.time);
    r.needsRelease = true;
    if (r.pulls === TOTAL_PULLS) {
      r.stage = 'complete';
      r.holding = false;
      r.needsRelease = false;
    }
  }
  return initial > 0;
}

export function validRescue(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) ||
      Object.keys(r).length !== KEYS.length || Object.keys(r).some(key => !KEYS.includes(key)) ||
      r.version !== 1 || !['align', 'pull', 'complete'].includes(r.stage) ||
      !finite(r.time, 0, MAX_TIME) || !integer(r.offset, 0, TAPE_STEPS - 1) || !integer(r.target, 2, 9) ||
      !integer(r.pulls, 0, TOTAL_PULLS) || !finite(r.progress, 0, GRIP_SECONDS - Number.EPSILON) ||
      typeof r.holding !== 'boolean' || typeof r.needsRelease !== 'boolean' ||
      !integer(r.lastPullCycle, -1, cycleAt(r.time)) || !integer(r.slips, 0, 1e6)) return false;
  if (r.stage === 'align') return r.time === 0 && r.pulls === 0 && r.progress === 0 && !r.holding && !r.needsRelease && r.lastPullCycle === -1 && r.slips === 0;
  if (r.offset !== r.target || (r.pulls === 0) !== (r.lastPullCycle === -1) || r.pulls > r.lastPullCycle + 1) return false;
  if (r.stage === 'complete') return r.pulls === TOTAL_PULLS && r.progress === 0 && !r.holding && !r.needsRelease;
  if (r.pulls === TOTAL_PULLS || r.needsRelease && !r.holding || r.progress > 0 && (!r.holding || r.needsRelease || !quietAt(r.time) || r.lastPullCycle === cycleAt(r.time))) return false;
  return true;
}
