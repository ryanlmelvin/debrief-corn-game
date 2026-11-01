// The earlier watch stays fixed. These commands fill the gaps between its
// recorded events; they never edit the encounter journal or choose an ending.
export const TRANSMISSION_DELAY = 1.2;
export const TRANSMISSION_SPEED = .27;
export const TRANSMISSION_EXPOSURE_COST = 10;
const CYCLE = 8, OPEN_FROM = 2.4, OPEN_TO = 6.4;
const GATE_ENTER = .43, GATE_EXIT = .63, MAX_TIME = 10000000;
const EPSILON = 1e-8;
const CALLS = ['answer', 'record', 'leave'];
const COMMANDS = ['wait', 'advance', 'turn'];
const POINTS = [[18, 84], [18, 50], [70, 50], [70, 16]];
const mod = (n, d) => ((n % d) + d) % d;
const finite = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const learningFirstMove = t => t.version === 2 && t.crossing === 0;

export function createTransmission(seed = 0, firstCall = 'record') {
  return {
    version: 2, stage: 'play', time: 0,
    offset: mod(Number.isFinite(seed) ? Math.floor(seed) : 0, 80) / 10,
    firstCall: CALLS.includes(firstCall) ? firstCall : 'leave',
    crossing: 0, progress: 0, heading: 0, moving: false, pending: null,
    setbacks: 0, commands: 0,
    message: 'Press Advance. Your light follows after a short delay.'
  };
}

export function transmissionGate(t, crossing = t.crossing, at = t.time) {
  // The first move teaches the delayed command without a timing penalty.
  // Version-one saves retain their original moving first row.
  if (t.version === 2 && crossing === 0) return { open: true, phase: OPEN_FROM, remaining: OPEN_TO - OPEN_FROM };
  const phase = mod(at + t.offset + crossing * 2.1, CYCLE);
  const open = phase >= OPEN_FROM && phase < OPEN_TO;
  return {
    open, phase,
    remaining: open ? OPEN_TO - phase : phase < OPEN_FROM ? OPEN_FROM - phase : CYCLE - phase + OPEN_FROM
  };
}

export function transmissionHorror(t, crossing = t.crossing, at = t.time) {
  if (t.version !== 2 || ![1, 2].includes(crossing)) return { present: false, warning: false };
  const phase = mod(at + t.offset + crossing * 1.7, 10);
  return { present: phase < 4, warning: phase >= 8.5 };
}

// A crossing needs an open gap for the entire time spent between the roots.
// Checking only the frame when the lantern enters would allow a slow crossing
// to survive a closing row, or a large frame to jump through it.
function openThroughout(t, crossing, from, to) {
  if (t.version === 2 && crossing === 0) return true;
  const phase = transmissionGate(t, crossing, from).phase;
  return phase >= OPEN_FROM - EPSILON && phase + to - from <= OPEN_TO + EPSILON;
}

export function transmissionStatus(t) {
  const complete = t.stage === 'complete';
  const tutorial = learningFirstMove(t);
  const crossing = Math.min(2, t.crossing), gate = transmissionGate(t, crossing);
  const start = POINTS[crossing], end = POINTS[crossing + 1];
  const progress = complete ? 1 : t.progress;
  const pastGate = progress > GATE_EXIT;
  const needsTurn = !complete && t.heading !== t.crossing;
  const arrival = t.time + TRANSMISSION_DELAY + Math.max(0, GATE_ENTER - progress) / TRANSMISSION_SPEED;
  const departure = t.time + TRANSMISSION_DELAY + Math.max(0, GATE_EXIT - progress) / TRANSMISSION_SPEED;
  const clues = {
    answer: 'First night: you asked where you were. The voice told you not to turn around.',
    record: 'First night: you recorded the radio. Only your breathing survived on the tape.',
    leave: 'First night: you passed the radio. Your voice kept describing the path ahead.'
  };
  return {
    complete, crossing, gate, needsTurn, pastGate, tutorial, clue: clues[t.firstCall],
    position: { x: start[0] + (end[0] - start[0]) * progress, y: start[1] + (end[1] - start[1]) * progress },
    arrivalIn: arrival - t.time,
    // Once beyond the roots, their next closure cannot block this light. When
    // stopped inside them, account for the radio delay as well as the walk out.
    arrivalSafe: !complete && !needsTurn && (pastGate || openThroughout(t, crossing, progress >= GATE_ENTER ? t.time : arrival, departure)),
    commandRemaining: t.pending ? Math.max(0, t.pending.dueAt - t.time) : 0,
    canAdvance: !complete && !t.pending && !t.moving && !needsTurn,
    canWait: !complete && !tutorial && !t.pending && t.moving,
    canTurn: !complete && !t.pending && !t.moving && t.progress === 0 && needsTurn
  };
}

function explain(t, message) {
  if (t.message === message) return false;
  t.message = message;
  return true;
}

export function transmissionAction(t, action) {
  if (!validTransmission(t) || t.stage !== 'play' || !COMMANDS.includes(action) || t.pending || t.time > MAX_TIME - TRANSMISSION_DELAY) return false;
  if (learningFirstMove(t) && (action !== 'advance' || t.commands > 0)) return false;
  if (action === 'advance' && t.heading !== t.crossing) return explain(t, 'The path bends at this marker. Send Turn before Advance.');
  if (action === 'advance' && t.moving) return explain(t, 'Your light is already moving. Send Wait to stop it.');
  if (action === 'wait' && !t.moving) return explain(t, 'Your light is waiting at the safe ground. Watch for the next gap.');
  if (action === 'turn' && (t.moving || t.progress !== 0 || t.heading === t.crossing)) return explain(t, 'Turn only at the marked bend. Stay on this row until the next marker.');
  t.pending = { action, dueAt: t.time + TRANSMISSION_DELAY };
  t.commands = Math.min(1000000, t.commands + 1);
  t.message = `${{ wait: 'Wait', advance: 'Advance', turn: 'Turn' }[action]} is on the air. Give it a moment to reach you.`;
  return true;
}

function deliver(t, onCollision) {
  const action = t.pending.action;
  t.pending = null;
  if (action === 'wait') {
    t.moving = false;
    t.message = 'The light stops. The rows keep moving.';
  } else if (action === 'turn') {
    if (transmissionHorror(t).present) {
      loseCrossing(t, onCollision, 'Something waits at the bend. Static clears: you are back at the marker.');
      return;
    }
    t.heading = t.crossing;
    t.message = 'Your light turns into the next row. Wait for an opening, then send Advance.';
  } else {
    t.moving = true;
    t.message = 'The light moves. You remember this stretch of the path.';
  }
}

function loseCrossing(t, onCollision, message = 'The row closes across your light. Static clears: you are back at the last marker. Try the next opening.') {
  t.progress = 0;
  t.moving = false;
  t.pending = null;
  t.setbacks = Math.min(1000000, t.setbacks + 1);
  t.message = message;
  onCollision?.();
}

export function advanceTransmission(t, dt, onCollision) {
  if (!validTransmission(t) || t.stage !== 'play' || !Number.isFinite(dt) || dt <= 0) return false;
  let remaining = Math.min(dt, 60, MAX_TIME - t.time);
  if (remaining <= 0) return false;
  while (remaining > EPSILON && t.stage === 'play') {
    if (t.pending && t.pending.dueAt - t.time <= EPSILON) deliver(t, onCollision);
    const step = Math.min(remaining, .05, t.pending ? t.pending.dueAt - t.time : .05);
    const before = t.time;
    t.time += step;
    remaining -= step;
    if (t.moving) {
      const next = Math.min(1, t.progress + TRANSMISSION_SPEED * step);
      const entering = Math.max(t.progress, GATE_ENTER), leaving = Math.min(next, GATE_EXIT);
      if (entering <= leaving && next >= GATE_ENTER && t.progress <= GATE_EXIT &&
          !openThroughout(t, t.crossing, before + (entering - t.progress) / TRANSMISSION_SPEED, before + (leaving - t.progress) / TRANSMISSION_SPEED)) {
        loseCrossing(t, onCollision);
      } else {
        t.progress = next;
        if (next >= 1 - EPSILON) {
          t.crossing++;
          t.progress = 0;
          t.moving = false;
          t.pending = null;
          if (t.crossing === 3) {
            t.stage = 'complete';
            t.message = 'The light reaches the buried radio. You recognize your own boots. Now give the warning.';
          } else t.message = 'Your light reaches a safe marker. The path bends here: send Turn, then Advance.';
        }
      }
    } else if (t.progress >= GATE_ENTER && t.progress <= GATE_EXIT && !openThroughout(t, t.crossing, before, t.time)) loseCrossing(t, onCollision);
    if (t.pending && t.pending.dueAt - t.time <= EPSILON) deliver(t, onCollision);
  }
  return true;
}

export function validTransmission(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t) ||
      Object.keys(t).some(key => !['version', 'stage', 'time', 'offset', 'firstCall', 'crossing', 'progress', 'heading', 'moving', 'pending', 'setbacks', 'commands', 'message'].includes(key)) ||
      ![1, 2].includes(t.version) || !['play', 'complete'].includes(t.stage) || !finite(t.time, 0, MAX_TIME) || !finite(t.offset, 0, 7.9) ||
      !CALLS.includes(t.firstCall) || !integer(t.crossing, 0, 3) || !finite(t.progress, 0, 1) || !integer(t.heading, 0, 2) ||
      typeof t.moving !== 'boolean' || !integer(t.setbacks, 0, 1000000) || !integer(t.commands, 0, 1000000) || typeof t.message !== 'string' || t.message.length > 250) return false;
  if (t.stage === 'complete') return t.crossing === 3 && t.progress === 0 && t.heading === 2 && !t.moving && t.pending === null;
  if (t.crossing >= 3 || t.progress >= 1 || t.heading > t.crossing || t.heading < Math.max(0, t.crossing - 1)) return false;
  if (t.heading !== t.crossing && (t.progress !== 0 || t.moving)) return false;
  if (learningFirstMove(t)) {
    if (t.setbacks !== 0 || t.commands > 1) return false;
    if (t.commands === 0 && (t.moving || t.pending !== null || t.progress !== 0)) return false;
    if (t.commands === 1 && (t.pending ? t.pending.action !== 'advance' || t.progress !== 0 : !t.moving)) return false;
  }
  if (t.pending === null) return true;
  const p = t.pending;
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== 2 || !COMMANDS.includes(p.action) || !finite(p.dueAt, t.time - EPSILON, Math.min(MAX_TIME, t.time + TRANSMISSION_DELAY + EPSILON))) return false;
  if (p.action === 'advance') return !t.moving && t.heading === t.crossing;
  if (p.action === 'wait') return t.moving && t.heading === t.crossing;
  return !t.moving && t.progress === 0 && t.heading === t.crossing - 1;
}
