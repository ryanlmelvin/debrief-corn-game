import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransmission, transmissionAction, advanceTransmission, transmissionStatus, validTransmission, TRANSMISSION_DELAY } from '../docs/transmission.js';

function roundTrip(t) {
  assert.equal(validTransmission(t), true, JSON.stringify(t));
  const restored = JSON.parse(JSON.stringify(t));
  assert.equal(validTransmission(restored), true);
  assert.deepEqual(restored, t);
  return restored;
}

// Only real commands and elapsed time; no edited coordinates, gates or results.
function solve(t, inspect = () => {}) {
  for (let frames = 0; t.stage !== 'complete'; frames++) {
    assert.ok(frames < 3000, 'the three crossings must remain solvable');
    const status = transmissionStatus(t);
    inspect(t, status);
    if (status.canTurn) assert.equal(transmissionAction(t, 'turn'), true);
    else if (status.canAdvance && status.arrivalSafe) assert.equal(transmissionAction(t, 'advance'), true);
    assert.equal(advanceTransmission(t, .05), true);
    assert.equal(validTransmission(t), true, JSON.stringify(t));
  }
  return t;
}

test('all first-call memories and gate offsets reach the radio with real delayed commands', () => {
  for (const seed of [0, 1, 17, 35, 79, 80, -1, 4294967295]) for (const choice of ['answer', 'record', 'leave']) {
    const t = createTransmission(seed, choice), original = roundTrip(t);
    let savedPending = false, savedMoving = false, savedBend = false;
    solve(t, (state, status) => {
      if (state.pending && !savedPending) { roundTrip(state); savedPending = true; }
      if (state.moving && !savedMoving) { roundTrip(state); savedMoving = true; }
      if (status.needsTurn && !savedBend) { roundTrip(state); savedBend = true; }
    });
    assert.equal(t.stage, 'complete');
    assert.equal(t.crossing, 3);
    assert.equal(t.commands, 5, 'three Advances and two Turns are required');
    assert.equal(t.setbacks, 0, 'visible timing guidance describes a safe whole crossing');
    assert.equal(t.firstCall, original.firstCall, 'guidance never rewrites the earlier choice');
    assert.ok(savedPending && savedMoving && savedBend);
    roundTrip(t);
    const ended = structuredClone(t);
    for (const action of ['advance', 'wait', 'turn', 'unknown']) assert.equal(transmissionAction(t, action), false);
    assert.equal(advanceTransmission(t, 40), false);
    assert.deepEqual(t, ended, 'completion waits for the outer narrative choice');
  }
});

test('the radio delay is real, and repeated commands cannot replace or accelerate a transmission', () => {
  const t = createTransmission(0);
  assert.equal(transmissionAction(t, 'advance'), true);
  const sent = structuredClone(t);
  for (let i = 0; i < 30; i++) for (const action of ['advance', 'wait', 'turn', 'unknown']) assert.equal(transmissionAction(t, action), false);
  assert.deepEqual(t, sent);
  advanceTransmission(t, TRANSMISSION_DELAY - .01);
  assert.equal(t.progress, 0);
  assert.equal(t.moving, false);
  assert.ok(t.pending);
  advanceTransmission(t, .01);
  assert.equal(t.pending, null);
  assert.equal(t.progress, 0);
  assert.equal(t.moving, true);
  advanceTransmission(t, .1);
  assert.ok(t.progress > 0);
});

test('Wait stops a moving light after the same delay and Advance can resume it', () => {
  const t = createTransmission(0);
  transmissionAction(t, 'advance');
  advanceTransmission(t, TRANSMISSION_DELAY + .2);
  assert.equal(transmissionAction(t, 'wait'), true);
  const queuedAt = t.progress;
  advanceTransmission(t, TRANSMISSION_DELAY / 2);
  assert.ok(t.progress > queuedAt);
  assert.equal(t.moving, true);
  advanceTransmission(t, TRANSMISSION_DELAY / 2);
  assert.equal(t.moving, false);
  const heldAt = t.progress;
  advanceTransmission(t, 10);
  assert.equal(t.progress, heldAt, 'a stop before the moving row is safe across later cycles');
  solve(t);
  assert.equal(t.crossing, 3);
  assert.equal(t.setbacks, 0);
  assert.equal(t.commands, 7, 'the stop and resumed Advance are genuine additional inputs');
});

test('a closing row resets only that crossing, then permits a complete retry', () => {
  const t = createTransmission(35);
  assert.equal(transmissionStatus(t).arrivalSafe, false);
  assert.equal(transmissionAction(t, 'advance'), true);
  for (let i = 0; i < 200 && t.setbacks === 0; i++) advanceTransmission(t, .05);
  assert.equal(t.setbacks, 1);
  assert.equal(t.crossing, 0);
  assert.equal(t.progress, 0);
  assert.equal(t.pending, null);
  assert.equal(t.moving, false);
  assert.match(t.message, /last marker/);
  roundTrip(t);
  solve(t);
  assert.equal(t.stage, 'complete');
  assert.equal(t.setbacks, 1);
});

test('a stopped light beyond the roots can advance even when the row behind it closes', () => {
  const t = createTransmission(0);
  transmissionAction(t, 'advance');
  advanceTransmission(t, TRANSMISSION_DELAY + 1.4);
  transmissionAction(t, 'wait');
  advanceTransmission(t, TRANSMISSION_DELAY);
  assert.equal(t.moving, false);
  assert.ok(t.progress > .63 && t.progress < 1, 'Wait arrives after the light has crossed the roots');
  advanceTransmission(t, 3);
  const status = transmissionStatus(t);
  assert.equal(status.gate.open, false);
  assert.equal(status.pastGate, true);
  assert.equal(status.arrivalSafe, true, 'the closed row is behind the light, so it cannot obstruct the next move');
  assert.equal(t.setbacks, 0);
  assert.equal(transmissionAction(t, 'advance'), true);
  advanceTransmission(t, TRANSMISSION_DELAY + 2);
  assert.equal(t.crossing, 1);
  assert.equal(t.setbacks, 0);
  roundTrip(t);
});

test('later setbacks preserve cleared crossings and waiting inside a closing row is not safe', () => {
  const t = createTransmission(0);
  for (let i = 0; t.crossing === 0 && i < 300; i++) {
    const status = transmissionStatus(t);
    if (status.canAdvance && status.arrivalSafe) transmissionAction(t, 'advance');
    advanceTransmission(t, .05);
  }
  assert.equal(t.crossing, 1);
  assert.equal(transmissionAction(t, 'advance'), true, 'wrong direction explains the required Turn');
  assert.match(t.message, /Turn before Advance/);
  assert.equal(t.pending, null);
  assert.equal(transmissionAction(t, 'turn'), true);
  advanceTransmission(t, TRANSMISSION_DELAY);
  while (transmissionStatus(t).arrivalSafe) advanceTransmission(t, .05);
  transmissionAction(t, 'advance');
  for (let i = 0; i < 200 && t.setbacks === 0; i++) advanceTransmission(t, .05);
  assert.equal(t.setbacks, 1);
  assert.equal(t.crossing, 1, 'first crossing remains cleared');
  assert.equal(t.heading, 1, 'a retry keeps the correctly chosen direction');
  solve(t);
  assert.equal(t.stage, 'complete');

  const stopped = createTransmission(0);
  transmissionAction(stopped, 'advance');
  advanceTransmission(stopped, TRANSMISSION_DELAY + .6);
  transmissionAction(stopped, 'wait');
  advanceTransmission(stopped, TRANSMISSION_DELAY);
  assert.ok(stopped.progress > .43 && stopped.progress < .63);
  assert.equal(stopped.moving, false);
  advanceTransmission(stopped, 5);
  assert.equal(stopped.setbacks, 1, 'staying inside the roots does not bypass their closing');
  assert.equal(stopped.progress, 0);
});

test('a single Advance never completes more than one leg, even across a long frame', () => {
  const t = createTransmission(0);
  transmissionAction(t, 'advance');
  advanceTransmission(t, 1000);
  assert.ok(Math.abs(t.time - 60) < 1e-8, 'large deltas have a bounded simulation budget');
  assert.equal(t.crossing, 1);
  assert.equal(t.stage, 'play');
  assert.equal(t.moving, false);
  assert.equal(transmissionStatus(t).needsTurn, true);
  const before = structuredClone(t);
  for (const delta of [NaN, Infinity, -Infinity, -1, 0, undefined, null, '1']) assert.equal(advanceTransmission(t, delta), false);
  assert.deepEqual(t, before);
});

test('validation rejects damaged saves and mismatched motion or delayed commands', () => {
  const original = createTransmission(0);
  for (const patch of [
    { version: 2 }, { extra: true }, { firstCall: 'invented' }, { time: Infinity }, { offset: -1 },
    { crossing: 3 }, { progress: 1 }, { heading: 1 }, { moving: 1 }, { commands: -1 }, { setbacks: .5 },
    { stage: 'complete' }, { pending: {} }, { pending: { action: 'wait', dueAt: 1 } },
    { pending: { action: 'advance', dueAt: -1 } }, { pending: { action: 'advance', dueAt: 10 } },
    { pending: { action: 'advance', dueAt: 1, extra: true } }
  ]) {
    const damaged = { ...original, ...patch }, before = structuredClone(damaged);
    assert.equal(validTransmission(damaged), false, JSON.stringify(patch));
    assert.equal(transmissionAction(damaged, 'advance'), false);
    assert.equal(advanceTransmission(damaged, 1), false);
    assert.deepEqual(damaged, before);
  }
  for (const value of [null, [], 0, '', undefined]) assert.equal(validTransmission(value), false);
});

test('read-only status and deterministic replay preserve state and ambient randomness', () => {
  const t = createTransmission(71, 'leave'), before = JSON.stringify(t), random = Math.random;
  let randomCalls = 0;
  try {
    Math.random = () => { randomCalls++; return .5; };
    for (let i = 0; i < 20; i++) transmissionStatus(t);
    assert.equal(JSON.stringify(t), before);
    assert.deepEqual(solve(t), solve(createTransmission(71, 'leave')));
  } finally { Math.random = random; }
  assert.equal(randomCalls, 0);
});
