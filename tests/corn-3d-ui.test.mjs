import test from 'node:test';
import assert from 'node:assert/strict';
import { Corn3DUI } from '../docs/corn-3d-ui.js';
import { createMiniGame } from '../docs/mini-games.js';
import { moveRogue } from '../docs/rogue.js';

class Element extends EventTarget {
  constructor(doc) {
    super(); this.ownerDocument = doc; this.hidden = false; this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name))
    };
  }
}

function fixture(t, loadWorld) {
  const win = new EventTarget(), doc = { hidden: false, defaultView: win };
  const root = new Element(doc), canvas = new Element(doc), surface = new Element(doc), fallback = new Element(doc);
  canvas.hidden = true;
  const game = createMiniGame('corn', 'story', 42);
  const calls = { release: 0, destroy: 0, moves: 0, resized: 0, disposed: 0, renders: [] };
  const world = {
    resize() { calls.resized++; },
    render(...args) { calls.renders.push(args); },
    dispose() { calls.disposed++; }
  };
  let bindings, time = 0;
  const ui = new Corn3DUI({ root, canvas, surface, fallback, buttons: new Element(doc),
    loadWorld: loadWorld || (async () => world), now: () => time,
    bindControls(options) {
      bindings = options;
      return { release() { calls.release++; }, destroy() { calls.destroy++; } };
    },
    onMove(dx, dy) { calls.moves++; return moveRogue(game, dx, dy); }
  });
  t.after(() => ui.dispose());
  return { ui, root, canvas, surface, fallback, doc, win, game, world, calls,
    get bindings() { return bindings; }, setTime(value) { time = value; } };
}

test('loading leaves the board visible and blocks input without changing game state', async t => {
  let resolve;
  const f = fixture(t, () => new Promise(done => { resolve = done; }));
  const before = structuredClone(f.game);
  f.ui.render(f.game);
  await Promise.resolve();
  assert.equal(f.ui.loading, true);
  assert.equal(f.canvas.hidden, true);
  assert.equal(f.fallback.hidden, false);
  assert.equal(f.bindings.isEnabled(), false);
  assert.equal(f.bindings.move(0, -1), false);
  assert.deepEqual(f.game, before);
  resolve(f.world);
  await f.ui.ready;
  assert.equal(f.ui.loading, false);
  assert.equal(f.canvas.hidden, false);
  assert.equal(f.fallback.hidden, true);
  assert.equal(f.calls.resized, 1);
  assert.equal(f.bindings.isEnabled(), true);
  assert.equal(f.bindings.move(0, -1), true);
  assert.equal(f.calls.moves, 1);
});

test('pause, hidden document, hidden surface and choice stage block input and freeze visual animation', async t => {
  const f = fixture(t);
  f.ui.render(f.game);
  await f.ui.ready;
  for (const blocked of ['paused', 'hidden-document', 'hidden-surface', 'choice']) {
    f.doc.hidden = blocked === 'hidden-document';
    f.root.hidden = blocked === 'hidden-surface';
    f.game.rogue.stage = blocked === 'choice' ? 'choice' : 'play';
    const before = structuredClone(f.game);
    f.setTime(100);
    f.ui.render(f.game, blocked === 'paused');
    assert.equal(f.bindings.isEnabled(), false, blocked);
    assert.equal(f.bindings.move(0, -1), false, blocked);
    assert.equal(f.calls.renders.at(-1)[2].paused, true, blocked);
    assert.deepEqual(f.game, before, blocked);
  }
  f.game.rogue.stage = 'play'; f.doc.hidden = false; f.root.hidden = false;
  f.ui.render(f.game);
  assert.equal(f.bindings.isEnabled(), true);
});

test('held controls release on a crossing but remain held through a nonfatal hit', async t => {
  const f = fixture(t);
  f.ui.render(f.game);
  await f.ui.ready;
  const before = f.calls.release;
  f.game.rogue.hits++;
  f.ui.render(f.game);
  assert.equal(f.calls.release, before);
  f.game.rogue.crossing++;
  f.ui.render(f.game);
  assert.equal(f.calls.release, before + 1);
  f.ui.render(f.game);
  assert.equal(f.calls.release, before + 1);
  f.ui.release();
  assert.equal(f.calls.release, before + 2);
});

test('unsupported WebGL leaves a usable fallback with the same movement controls', async t => {
  const f = fixture(t, async () => { throw new Error('WebGL unavailable'); });
  f.ui.render(f.game);
  await f.ui.ready;
  assert.equal(f.ui.loading, false);
  assert.equal(f.ui.world, null);
  assert.equal(f.canvas.hidden, true);
  assert.equal(f.fallback.hidden, false);
  assert.ok(f.root.classes.has('corn-3d-fallback-active'));
  assert.equal(f.bindings.isEnabled(), true);
  assert.equal(f.bindings.move(0, -1), true);
});

test('context loss and render failure dispose WebGL and preserve fallback input', async t => {
  for (const failure of ['context', 'render']) {
    const f = fixture(t);
    f.ui.render(f.game);
    await f.ui.ready;
    if (failure === 'context') {
      const event = new Event('webglcontextlost', { cancelable: true });
      f.canvas.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    } else {
      f.world.render = () => { throw new Error('Graphics context stopped'); };
      f.ui.render(f.game);
    }
    assert.equal(f.calls.disposed, 1, failure);
    assert.equal(f.canvas.hidden, true, failure);
    assert.equal(f.fallback.hidden, false, failure);
    assert.equal(f.bindings.move(0, -1), true, failure);
    f.ui.dispose();
    assert.equal(f.calls.disposed, 1, 'disposing fallback does not dispose the same renderer twice');
  }
});

test('leaving during load cleans up listeners and disposes the late renderer without mounting it', async t => {
  let resolve;
  const f = fixture(t, () => new Promise(done => { resolve = done; }));
  f.ui.render(f.game);
  await Promise.resolve();
  f.ui.dispose();
  assert.equal(f.ui.loading, false);
  assert.equal(f.calls.destroy, 1);
  assert.equal(f.bindings.isEnabled(), false);
  resolve(f.world);
  await f.ui.ready;
  assert.equal(f.calls.disposed, 1);
  assert.equal(f.calls.resized, 0);
  assert.equal(f.calls.renders.length, 0);
  assert.equal(f.canvas.hidden, true);
  const releases = f.calls.release;
  f.win.dispatchEvent(new Event('resize'));
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(f.calls.release, releases, 'detached listeners do not react after unmount');
  f.ui.dispose();
  assert.equal(f.calls.destroy, 1);
});

test('extra UI updates share elapsed animation time and never advance the simulation', async t => {
  const f = fixture(t), before = structuredClone(f.game);
  f.ui.render(f.game);
  await f.ui.ready;
  f.setTime(16);
  f.ui.render(f.game);
  assert.equal(f.calls.renders.at(-1)[1], .016);
  f.ui.render(f.game);
  assert.equal(f.calls.renders.at(-1)[1], 0);
  f.setTime(1000);
  f.ui.render(f.game);
  assert.equal(f.calls.renders.at(-1)[1], .05);
  assert.deepEqual(f.game, before);
});
