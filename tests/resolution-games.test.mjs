import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, restore, serialize } from '../docs/engine.js';
import { createMiniGame, getMiniGameUnlocks, miniGameComplete, miniGameResult } from '../docs/mini-games.js';
import { chooseResolution, getResolution, validResolution } from '../docs/alternate-endings.js';
import { resolutionGameAction, releaseResolutionGame } from '../docs/resolution-games.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';
import { rescueStatus } from '../docs/rescue.js';

function storyRescue() {
  const s = createMiniGame('rescue', 'story', 753);
  delete s.practice;
  s.runId = 'resolution-story-fixture';
  return s;
}

test('rescue completion preserves the final sacrifice; practice cannot commit or withdraw into the story', () => {
  for (const practice of [false, true]) {
    let s = practice ? createMiniGame('rescue', 'hard', 754) : storyRescue();
    assert.equal(getResolution(s).options.find(o => o.id === 'rescue-leave').disabled, true);
    assert.equal(chooseResolution(s, 'rescue-leave'), false);
    const journal = structuredClone(s.fieldEvents.journal), reports = structuredClone(s.reports);
    solveResolutionGame(s);
    s = restore(serialize(s));
    assert.ok(s);
    assert.equal(s.phase, 'resolution');
    assert.equal(s.ending, null);
    assert.equal(s.resolution.recordingsRelinquished, undefined);
    assert.deepEqual(s.fieldEvents.journal, journal);
    assert.deepEqual(s.reports, reports);
    assert.equal(getResolution(s).options.find(o => o.id === 'rescue-leave').disabled, false);
    if (practice) {
      assert.equal(miniGameComplete(s), true);
      assert.equal(miniGameResult(s).success, true);
      for (const id of ['back', 'rescue-leave']) assert.equal(chooseResolution(s, id), false);
      assert.deepEqual(getMiniGameUnlocks(s), []);
    } else {
      assert.equal(chooseResolution(s, 'rescue-leave'), true);
      assert.equal(s.ending, 'rescue');
      assert.equal(s.resolution.recordingsRelinquished, true);
      assert.deepEqual(restore(serialize(s)), s);
    }
  }
});

test('mid-pull saves and released pause/update inputs preserve earned grips without pulling unattended', () => {
  let s = storyRescue();
  while (!rescueStatus(s.resolution.activity.state).aligned) resolutionGameAction(s, 'later');
  resolutionGameAction(s, 'align');
  while (!rescueStatus(s.resolution.activity.state).canPull) advance(s, .05);
  resolutionGameAction(s, 'pull');advance(s, .4);
  const original = structuredClone(s);
  s = restore(serialize(s));
  assert.deepEqual(s, original);
  assert.ok(s.resolution.activity.state.progress > 0);
  releaseResolutionGame(s);
  advance(s, 30);
  assert.equal(s.resolution.activity.state.pulls, 0);
  assert.equal(s.resolution.activity.state.holding, false);
  assert.equal(validResolution(s), true);
  solveResolutionGame(s);
  assert.equal(chooseResolution(s, 'back'), true);
  assert.equal(s.phase, 'debrief');
  assert.deepEqual(getMiniGameUnlocks(s), ['watch', 'rescue'], 'entry receipt survives withdrawal');
});

test('legacy unfinished rescue saves enter the activity, while old completed endings stay completed', () => {
  const unfinished = storyRescue();
  delete unfinished.resolution.version;delete unfinished.resolution.activity;
  delete unfinished.reports.at(-1).resolutionGame;
  const previous = structuredClone(unfinished.reports);
  const resumed = restore(serialize(unfinished));
  assert.ok(resumed);
  assert.equal(resumed.resolution.activity.state.stage, 'align');
  assert.deepEqual(resumed.reports.map(({resolutionGame, ...report}) => report), previous);
  assert.equal(chooseResolution(resumed, 'rescue-leave'), false);
  const ended = storyRescue();solveResolutionGame(ended);chooseResolution(ended, 'rescue-leave');
  delete ended.resolution.version;delete ended.resolution.activity;
  for (const report of ended.reports) delete report.resolutionGame;
  assert.deepEqual(restore(serialize(ended)), ended, 'an update never replays an achieved ending');
  assert.deepEqual(getMiniGameUnlocks(ended), ['watch'], 'legacy click-through endings do not grant an unplayed game');
});

test('resolution saves reject missing, mismatched, premature and corrupted gameplay', () => {
  const s = storyRescue();
  for (const mutate of [
    c => { delete c.resolution.activity; },
    c => { c.resolution.activity.kind = 'transmission'; },
    c => { c.resolution.activity.state.stage = 'complete'; },
    c => { c.resolution.activity.state.time = -1; },
    c => { c.resolution.step = 1; },
    c => { c.resolution.version = 99; },
    c => { c.phase = 'ending';c.ending = 'rescue'; }
  ]) {
    const copy = structuredClone(s);mutate(copy);
    assert.equal(restore(serialize(copy)), null);
  }
});
