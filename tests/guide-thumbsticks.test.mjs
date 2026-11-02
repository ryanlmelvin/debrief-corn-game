import test from 'node:test';
import assert from 'node:assert/strict';
import { bindThumbstick, stickVector } from '../docs/guide-thumbsticks.js';

// A small DOM stand-in exercises pointer ownership and capture lifecycle without
// depending on a browser's touch hardware. Release dispatches the same event a
// browser sends, including during an explicit pause/reset.
class StickElement extends EventTarget {
  captured = new Set();
  released = [];
  classes = new Set();
  properties = new Map();
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  style = { setProperty: (name, value) => this.properties.set(name, value) };
  getBoundingClientRect() { return { left: 100, top: 200, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) {
    this.captured.delete(id);
    this.released.push(id);
    this.pointer('lostpointercapture', id);
  }
  pointer(type, pointerId, clientX = 150, clientY = 250, extra = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId, clientX, clientY, pointerType: 'touch', isPrimary: false, button: 0 }, extra);
    this.dispatchEvent(event);
    return event;
  }
}

function stick(options = {}) {
  const element = new StickElement();
  let value = { x: 0, y: 0 };
  const values = [];
  const controller = bindThumbstick(element, { ...options, onChange: next => { value = next; values.push(next); } });
  return { element, controller, values, get value() { return value; } };
}

test('neutral and tiny thumb movements stay still; invalid coordinates cannot create motion', () => {
  for (const [x, y, radius] of [[0, 0, 32], [2, 2, 32], [NaN, 0, 32], [0, Infinity, 32], [0, 0, 0], [1, 1, -1]]) {
    assert.deepEqual(stickVector(x, y, radius), { x: 0, y: 0 });
  }
});

test('analog strength rises gradually and diagonals remain bounded outside the stick', () => {
  const small = stickVector(8, 0, 32), medium = stickVector(20, 0, 32), full = stickVector(32, 0, 32);
  assert.ok(small.x > 0 && small.x < medium.x && medium.x < full.x);
  assert.equal(full.x, 1);
  const diagonal = stickVector(200, -200, 32);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.equal(diagonal.x, -diagonal.y);
  assert.deepEqual(stickVector(-32, 0, 32), { x: -1, y: 0 });
});

test('both thumbs move independently even when the second pointer is not primary', () => {
  const left = stick(), right = stick();
  left.element.pointer('pointerdown', 41, 150, 218, { isPrimary: true });
  right.element.pointer('pointerdown', 42, 182, 250, { isPrimary: false });
  assert.deepEqual(left.value, { x: 0, y: -1 });
  assert.deepEqual(right.value, { x: 1, y: 0 });
  left.element.pointer('pointermove', 41, 118, 250);
  assert.deepEqual(left.value, { x: -1, y: 0 });
  assert.deepEqual(right.value, { x: 1, y: 0 });
  left.element.pointer('pointerup', 41);
  assert.deepEqual(left.value, { x: 0, y: 0 });
  assert.deepEqual(right.value, { x: 1, y: 0 });
  assert.ok(right.element.hasPointerCapture(42));
});

test('another pointer cannot steal a stick, move it, or release its owner', () => {
  const bound = stick();
  bound.element.pointer('pointerdown', 7, 182, 250);
  bound.element.pointer('pointerdown', 8, 118, 250);
  for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) bound.element.pointer(type, 8, 118, 250);
  assert.deepEqual(bound.value, { x: 1, y: 0 });
  assert.ok(bound.element.hasPointerCapture(7));
  assert.equal(bound.element.hasPointerCapture(8), false);
  bound.element.pointer('pointerup', 7);
  assert.deepEqual(bound.value, { x: 0, y: 0 });
});

test('captured dragging stays bounded when a thumb leaves its visual disc', () => {
  const bound = stick();
  const down = bound.element.pointer('pointerdown', 1);
  const moved = bound.element.pointer('pointermove', 1, 1000, 250);
  assert.ok(down.defaultPrevented && moved.defaultPrevented);
  assert.deepEqual(bound.value, { x: 1, y: 0 });
  assert.ok(Math.abs(parseFloat(bound.element.properties.get('--thumb-x')) - 32) < 1e-10);
  assert.equal(bound.element.properties.get('--thumb-y'), '0px');
});

test('cancellation and lost capture stop motion and return the knob to center', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const bound = stick();
    bound.element.pointer('pointerdown', 12, 182, 250);
    bound.element.pointer(type, 12);
    assert.deepEqual(bound.value, { x: 0, y: 0 }, type);
    assert.equal(bound.element.properties.get('--thumb-x'), '0px');
    assert.equal(bound.element.properties.get('--thumb-y'), '0px');
    assert.equal(bound.element.hasPointerCapture(12), false);
    assert.equal(bound.element.classes.has('engaged'), false);
  }
});

test('pause/reset releases both thumbs and old pointer moves cannot restart them', () => {
  const left = stick(), right = stick();
  for (const [bound, id] of [[left, 11], [right, 22]]) {
    bound.element.pointer('pointerdown', id, 182, 250);
    bound.controller.reset();
    assert.deepEqual(bound.value, { x: 0, y: 0 });
    assert.deepEqual(bound.element.released, [id]);
    bound.element.pointer('pointermove', id, 118, 250);
    assert.deepEqual(bound.value, { x: 0, y: 0 });
    bound.element.pointer('pointerdown', id + 1, 118, 250);
    assert.deepEqual(bound.value, { x: -1, y: 0 });
  }
});

test('disabled sticks reject new touches and stop an active gesture', () => {
  let enabled = false;
  const bound = stick({ isEnabled: () => enabled });
  bound.element.pointer('pointerdown', 3, 182, 250);
  assert.deepEqual(bound.value, { x: 0, y: 0 });
  assert.equal(bound.element.captured.size, 0);
  enabled = true;
  bound.element.pointer('pointerdown', 4, 182, 250);
  assert.equal(bound.value.x, 1);
  enabled = false;
  bound.element.pointer('pointermove', 4, 182, 250);
  assert.deepEqual(bound.value, { x: 0, y: 0 });
  assert.equal(bound.element.captured.size, 0);
});

test('a failed capture stops input instead of leaving a stuck stick', () => {
  const bound = stick();
  bound.element.setPointerCapture = () => { throw new Error('Pointer ended'); };
  bound.element.pointer('pointerdown', 1, 182, 250);
  assert.deepEqual(bound.value, { x: 0, y: 0 });
  assert.equal(bound.element.classes.has('engaged'), false);
});

test('destroy releases capture and removes handlers; right mouse clicks do not move', () => {
  const bound = stick();
  bound.element.pointer('pointerdown', 1, 182, 250, { pointerType: 'mouse', button: 2 });
  assert.deepEqual(bound.value, { x: 0, y: 0 });
  bound.element.pointer('pointerdown', 2, 182, 250);
  bound.controller.destroy();
  assert.deepEqual(bound.value, { x: 0, y: 0 });
  assert.deepEqual(bound.element.released, [2]);
  const count = bound.values.length;
  bound.element.pointer('pointerdown', 3, 182, 250);
  bound.element.pointer('pointermove', 3, 118, 250);
  assert.equal(bound.values.length, count);
  assert.equal(bound.element.captured.size, 0);
});
