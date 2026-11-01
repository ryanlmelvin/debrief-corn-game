import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../docs/engine.js';

test('practice watches never replace stored or in-memory story best scores', async t => {
  const globals = ['location', 'localStorage', 'document'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const stored = new Map(), writes = [], nodes = new Map();
  globalThis.location = new URL('http://localhost:4317/debrief-corn-game/');
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); stored.set(key, value); }
  };
  globalThis.document = { getElementById: id => {
    if (!nodes.has(id)) nodes.set(id, {});
    return nodes.get(id);
  } };
  const { updateWatchUI, bestWatch, watchRecord } = await import('../docs/watch-ui.js');
  const completed = (score, practice = false) => {
    const state = createGame('story', 42);
    state.phase = 'field';
    state.watch.score = score;
    if (practice) state.practice = 'watch';
    return state;
  };

  updateWatchUI(completed(900, true));
  assert.equal(writes.length, 0);
  assert.equal(bestWatch(completed(0)), 0, 'practice must not create an in-memory best either');

  updateWatchUI(completed(120));
  assert.equal(writes.length, 1, 'normal completed watches still record their scores');
  const beforePractice = [...stored];
  const practice = completed(5000, true);
  practice.phase = 'ending';
  updateWatchUI(practice);
  assert.deepEqual([...stored], beforePractice);
  assert.equal(writes.length, 1);
  assert.equal(watchRecord(completed(0)).best, 120, 'a later story record must not display the practice score');

  updateWatchUI(completed(130));
  assert.equal(bestWatch(completed(0)), 130);
  assert.equal(writes.length, 2, 'practice must not prevent a lower but legitimate story best');
  assert.deepEqual(JSON.parse(stored.get('debrief-watch-bests-v1:/debrief-corn-game/')), { 'story-0': 130 });
  updateWatchUI(completed(110));
  assert.equal(writes.length, 2, 'a lower normal score still leaves the best intact');
});
