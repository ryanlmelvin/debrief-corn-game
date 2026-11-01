import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransmission, transmissionAction, advanceTransmission, transmissionStatus, transmissionGate, transmissionHorror, validTransmission, TRANSMISSION_DELAY } from '../docs/transmission.js';

// Version one is the shipped pre-tutorial save format.
const legacyTransmission = seed => ({ ...createTransmission(seed), version: 1 });

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
    if (status.canTurn && !transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present) assert.equal(transmissionAction(t, 'turn'), true);
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
  const t = legacyTransmission(0);
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
  const t = legacyTransmission(35);
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
  const t = legacyTransmission(0);
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
  while (transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present) advanceTransmission(t, .05);
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

  const stopped = legacyTransmission(0);
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
    { version: 3 }, { extra: true }, { firstCall: 'invented' }, { time: Infinity }, { offset: -1 },
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


test('the first move is a safe delayed tutorial at every offset, even after waiting and reloading', () => {
  for (const seed of [0, 1, 17, 35, 79]) for (const idle of [0, 3, 7.9, 60]) {
    let t = createTransmission(seed, 'answer');
    assert.equal(t.version, 2);
    if (idle) advanceTransmission(t, idle);
    assert.equal(t.commands, 0);
    assert.equal(t.progress, 0);
    assert.equal(transmissionStatus(t).tutorial, true);
    assert.equal(transmissionStatus(t).arrivalSafe, true);
    assert.equal(transmissionGate(t).open, true);
    const waiting = roundTrip(t);
    for (const action of ['wait', 'turn']) assert.equal(transmissionAction(t, action), false);
    assert.deepEqual(t, waiting, 'only Advance is introduced in the first move');
    assert.equal(transmissionAction(t, 'advance'), true);
    advanceTransmission(t, .4);
    t = roundTrip(t);
    assert.equal(t.progress, 0, 'the safe tutorial still demonstrates the real delay');
    assert.ok(t.pending);
    advanceTransmission(t, TRANSMISSION_DELAY - .4 + .4);
    t = roundTrip(t);
    assert.equal(t.moving, true);
    assert.equal(transmissionStatus(t).canWait, false);
    for (const action of ['wait', 'turn', 'advance']) assert.equal(transmissionAction(t, action), false);
    for (let frame = 0; t.crossing === 0 && frame < 150; frame++) advanceTransmission(t, .05);
    assert.equal(t.crossing, 1);
    assert.equal(t.setbacks, 0);
    assert.equal(t.commands, 1);
    assert.equal(transmissionStatus(t).tutorial, false);
    assert.equal(transmissionStatus(t).canTurn, true, 'Turn is introduced only after the first marker');
    t = roundTrip(t);
    while (transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present) advanceTransmission(t, .05);
    assert.equal(transmissionAction(t, 'turn'), true);
    advanceTransmission(t, TRANSMISSION_DELAY);
    assert.equal(transmissionStatus(t).canAdvance, true);
    solve(t);
    assert.equal(t.commands, 5);
    assert.equal(t.firstCall, 'answer');
  }
});

test('tutorial saves reject impossible interruption and retry states', () => {
  const t = createTransmission(0);
  transmissionAction(t, 'advance');advanceTransmission(t, 1.4);
  for (const patch of [{ commands: 2 }, { setbacks: 1 }, { moving: false }, { pending: { action: 'wait', dueAt: t.time + 1 } }]) {
    assert.equal(validTransmission({ ...t, ...patch }), false);
  }
  const original = createTransmission(0);
  for (const patch of [{ commands: 1 }, { moving: true }, { progress: .1 }, { pending: { action: 'advance', dueAt: 1 } }]) {
    assert.equal(validTransmission({ ...original, ...patch }), false);
  }
});

test('legacy pending and moving saves retain their original first crossing instead of entering tutorial', () => {
  for (const elapsed of [.4, 1.4]) {
    let t = legacyTransmission(35);
    transmissionAction(t, 'advance');advanceTransmission(t, elapsed);
    t = roundTrip(t);
    assert.equal(transmissionStatus(t).tutorial, false);
    for (let frame = 0; t.setbacks === 0 && frame < 200; frame++) advanceTransmission(t, .05);
    assert.equal(t.setbacks, 1, 'an existing unsafe first crossing keeps its original result');
    solve(t);
    assert.equal(t.stage, 'complete');
  }
});

test('the horror checks delayed Turn arrival, keeps the marker on contact, and clears for a safe retry', () => {
  let t = createTransmission(35);
  transmissionAction(t, 'advance');advanceTransmission(t, 6);
  assert.equal(t.crossing, 1);
  assert.equal(transmissionStatus(t).canTurn, true);
  for (let frame = 0; !(transmissionHorror(t).warning && transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present); frame++) {
    assert.ok(frame < 250);advanceTransmission(t, .05);
  }
  assert.equal(transmissionHorror(t).present, false, 'the return warning precedes the entity');
  assert.equal(transmissionAction(t, 'turn'), true, 'Turn remains a player decision even when its timing is risky');
  advanceTransmission(t, .4);t = roundTrip(t);
  let collisions = 0;
  advanceTransmission(t, 60, () => { collisions++; });
  assert.equal(collisions, 1);
  assert.equal(t.setbacks, 1);
  assert.equal(t.crossing, 1);assert.equal(t.heading, 0);assert.equal(t.progress, 0);
  assert.equal(t.pending, null);assert.equal(t.moving, false);
  assert.match(t.message, /^Something waits at the bend/);
  assert.equal(transmissionStatus(t).canTurn, true);
  t = roundTrip(t);
  while (transmissionHorror(t).present || transmissionHorror(t).warning) advanceTransmission(t, .05);
  assert.equal(transmissionAction(t, 'turn'), true);
  advanceTransmission(t, TRANSMISSION_DELAY, () => { collisions++; });
  assert.equal(t.heading, 1);assert.equal(collisions, 1);
  solve(t);
  assert.equal(t.stage, 'complete');assert.equal(t.setbacks, 1);
});

test('legacy turn deliveries have no new horror and horror observation does not change saves or randomness', () => {
  const t = legacyTransmission(0);
  transmissionAction(t, 'advance');advanceTransmission(t, 6);
  assert.equal(t.crossing, 1);
  for (let frame = 0; !transmissionHorror({ ...t, version: 2 }, t.crossing, t.time + TRANSMISSION_DELAY).present; frame++) {
    assert.ok(frame < 250);advanceTransmission(t, .05);
  }
  assert.deepEqual(transmissionHorror(t), { present: false, warning: false });
  transmissionAction(t, 'turn');advanceTransmission(t, TRANSMISSION_DELAY);
  assert.equal(t.heading, 1);assert.equal(t.setbacks, 0);
  roundTrip(t);
  const current = createTransmission(12), before = JSON.stringify(current), random = Math.random;
  try {
    Math.random = () => { throw Error('horror must not consume randomness'); };
    for (const time of [0, 1, 4, 8.5, 10, 123]) {
      for (const crossing of [0, 1, 2, 3]) {
        const h = transmissionHorror(current, crossing, time);
        assert.equal(typeof h.present, 'boolean');assert.equal(typeof h.warning, 'boolean');
        assert.ok(!h.present || !h.warning);
      }
    }
  } finally { Math.random = random; }
  assert.equal(JSON.stringify(current), before);
});

test('the tutorial presents one action at a time and shows only the radio delivery timer', async () => {
  const { TransmissionUI, transmissionMarkup } = await import('../docs/transmission-ui.js');
  const markup = transmissionMarkup();
  assert.doesNotMatch(markup, /transmission-memory|transmission-forecast|transmission-instructions|transmission-map-key|transmission-signal|transmission-gap/);
  const nodes = new Map(), document = { activeElement: null };
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      hidden: false, disabled: false, textContent: '', style: {}, dataset: {}, attributes: new Map(),
      classList: { toggle() {} },
      setAttribute(name, value) { this.attributes.set(name, value); },
      getAttribute(name) { return this.attributes.get(name); },
      querySelector(selector) { return node(`${key} ${selector}`); },
      focus() { document.activeElement = this; }
    });
    return nodes.get(key);
  };
  const root = { ownerDocument: document, querySelector: node, querySelectorAll: () => [], innerHTML: '' };
  const ui = new TransmissionUI(root), t = createTransmission(35);
  const advance = node('[data-value="advance"]'), wait = node('[data-value="wait"]'), turn = node('[data-value="turn"]');
  ui.render(t);
  assert.equal(advance.hidden, false);assert.equal(advance.disabled, false);
  assert.equal(wait.hidden, true);assert.equal(turn.hidden, true);
  assert.equal(node('.transmission-delivery').hidden, true, 'no timer appears before a command is sent');
  assert.match(node('#transmission-message').textContent, /Press Advance/);
  advance.focus();transmissionAction(t, 'advance');ui.render(t);
  assert.equal(node('.transmission-delivery').hidden, false);
  assert.match(node('#transmission-delivery').textContent, /Advance arriving · 1\.2s/);
  assert.equal(advance.disabled, true);assert.equal(wait.hidden, true);
  advanceTransmission(t, 1.4);ui.render(t);
  assert.equal(node('.transmission-delivery').hidden, true);
  assert.match(node('#transmission-message').textContent, /Follow your light/);
  advanceTransmission(t, 4);ui.render(t);
  assert.equal(advance.hidden, true);assert.equal(turn.hidden, false);assert.equal(turn.disabled, false);
  assert.equal(document.activeElement, turn, 'keyboard focus follows the newly introduced action');
  assert.match(node('#transmission-message').textContent, /Turn while the shape is gone/);
  assert.equal(node('.transmission-delivery').hidden, true);
  while (!transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present) advanceTransmission(t, .05);
  transmissionAction(t, 'turn');ui.render(t);
  assert.equal(node('.transmission-delivery').hidden, false);
  assert.match(node('#transmission-delivery').textContent, /Turn arriving · 1\.2s/);
  advanceTransmission(t, TRANSMISSION_DELAY);ui.render(t, false, 10);
  assert.equal(turn.hidden, false, 'the blocked turn stays at the bend');
  assert.match(node('#transmission-message').textContent, /caught your turn · \+10 exposure/);
  assert.equal(node('#transmission-exposure').value, 10);
  assert.equal(node('#transmission-exposure-value').textContent, '10');
  while (transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present) advanceTransmission(t, .05);
  transmissionAction(t, 'turn');
  advanceTransmission(t, TRANSMISSION_DELAY);ui.render(t);
  assert.equal(turn.hidden, true);assert.equal(advance.hidden, false);
  assert.equal(document.activeElement, advance);
  assert.equal(node('.transmission-delivery').hidden, true, 'the countdown disappears once the command arrives');
  assert.equal(node('#transmission-step').hidden, true);
  const arrivalStates = new Set();
  for (let frame = 0; frame < 100; frame++) {
    arrivalStates.add(transmissionStatus(t).arrivalSafe);
    ui.render(t);
    assert.equal(node('#transmission-message').hidden, true, 'normal play never predicts when to Advance');
    advanceTransmission(t, .1);
  }
  assert.deepEqual([...arrivalStates].sort(), [false, true], 'both arrival windows were exercised');
  ui.render(t, false, 99.5);
  assert.equal(node('#transmission-exposure').value, 99.5);
  assert.equal(node('#transmission-exposure-value').textContent, '99', 'the display must not claim the failure threshold before it is reached');
});
