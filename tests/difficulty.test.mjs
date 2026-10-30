import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, advance, shoot, reload, restore, serialize, SHIFT_LENGTH, SAVE_VERSION } from '../docs/engine.js';
import { fieldStepCost } from '../docs/field.js';

function watch(mode, seed = 42, shift = 0) {
  const s = createGame(mode, seed);
  s.shift = shift;
  startShift(s);
  return s;
}

test('Story is the default and retains the former Standard crop and walking balance', () => {
  const s = watch();
  assert.equal(s.mode, 'story');
  advance(s, 4);
  assert.equal(s.targets[0].speed, 19.002988393884152);
  assert.equal(s.nextSpawn, 8.8);
  assert.equal(fieldStepCost(s, 4, 4), 1.15);
  assert.equal(fieldStepCost(s, 1, 4), 1.15 * .55);
});

test('Hard spawns more crops on every night while keeping the human sighting unchanged', () => {
  for (let shift = 0; shift < 3; shift++) {
    const story = watch('story', 42, shift), hard = watch('hard', 42, shift);
    for (const s of [story, hard]) advance(s, 4);
    assert.equal(hard.targets[0].speed, story.targets[0].speed * 1.4);
    for (const s of [story, hard]) advance(s, 9);
    const { id: storyId, ...storyFigure } = story.targets.find(t => t.kind === 'person');
    const { id: hardId, ...hardFigure } = hard.targets.find(t => t.kind === 'person');
    assert.deepEqual(hardFigure, storyFigure);
    for (const s of [story, hard]) advance(s, 7);
    assert.ok(hard.nextId > story.nextId, `night ${shift + 1} should spawn more crops`);
  }
});

test('both intensities allow every watch to be defended across varied seeds with supplied ammunition', () => {
  for (const mode of ['story', 'hard']) for (const seed of [1, 42, 123, 2026, 98765]) for (let shift = 0; shift < 3; shift++) {
    const s = watch(mode, seed, shift);
    while (s.phase === 'tower') {
      advance(s, .5);
      for (const target of [...s.targets]) {
        if (target.kind === 'corn') shoot(s, target.x, target.y - 34);
      }
      if (s.rounds < 2) reload(s);
    }
    assert.ok(s.time >= SHIFT_LENGTH);
    assert.equal(s.breaches, 0, `${mode}, seed ${seed}, night ${shift + 1}`);
    assert.ok(s.kills >= 7);
    assert.ok(s.rounds + s.reserve > 0);
  }
});

test('new Story and Hard saves preserve difficulty and live targets exactly', () => {
  for (const mode of ['story', 'hard']) {
    const s = watch(mode);
    advance(s, 13);
    assert.deepEqual(restore(serialize(s)), s);
  }
});

test('old Standard saves become Story without changing progress or live targets', () => {
  const expected = watch('story');
  advance(expected, 13);
  expected.evidence = ['ledger'];
  expected.exposure = 23;
  expected.reports = [{ shift: 0, question: 'What happened?', answer: 'I saw movement.' }];
  const old = { ...expected, version: 1, mode: 'standard' };
  assert.deepEqual(restore(serialize(old)), expected);
});

test('old easy Story saves upgrade crop speeds once and retain all other progress', () => {
  const old = watch('story');
  advance(old, 13);
  old.version = 1;
  old.exposure = 17;
  const expected = structuredClone(old);
  expected.version = SAVE_VERSION;
  for (const target of old.targets) if (target.kind === 'corn') target.speed *= .58;
  const resumed = restore(serialize(old));
  assert.deepEqual(resumed, expected);
  assert.deepEqual(restore(serialize(resumed)), resumed);
});

test('unknown modes and impossible save-version/mode pairs are rejected', () => {
  for (const [version, mode] of [[1, 'hard'], [SAVE_VERSION, 'standard'], [SAVE_VERSION, 'easy'], [SAVE_VERSION, null]]) {
    assert.equal(restore(serialize({ ...createGame(), version, mode })), null);
  }
});
