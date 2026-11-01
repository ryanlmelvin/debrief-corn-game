import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, restore, serialize } from '../docs/engine.js';
import { createMiniGame, getMiniGameUnlocks, miniGameComplete, miniGameResult } from '../docs/mini-games.js';
import { chooseResolution, startResolution, getResolution, validResolution } from '../docs/alternate-endings.js';
import { resolutionGameAction, releaseResolutionGame } from '../docs/resolution-games.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';
import { rescueStatus } from '../docs/rescue.js';
import { transmissionStatus } from '../docs/transmission.js';

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

function storyTransmission(firstCall = 'record') {
  const s = createMiniGame('transmission', 'story', 755);
  delete s.practice;s.runId = 'transmission-story-fixture';
  chooseResolution(s, 'back');
  s.fieldEvents.journal.find(entry => entry.id === 'first-call').choice = firstCall;
  assert.equal(startResolution(s), true);
  for (const action of ['transmission', 'transmission-tower', 'transmission-listen']) assert.equal(chooseResolution(s, action), true);
  return s;
}

test('Transmission preserves every first-call memory through pending saves, completion and the final broadcast', () => {
  for (const firstCall of ['answer', 'record', 'leave']) {
    let s = storyTransmission(firstCall);
    const journal = structuredClone(s.fieldEvents.journal), reports = structuredClone(s.reports);
    assert.equal(s.resolution.activity.state.firstCall, firstCall);
    assert.equal(chooseResolution(s, 'transmission-broadcast'), false);
    while (!transmissionStatus(s.resolution.activity.state).arrivalSafe) advance(s, .05);
    assert.equal(resolutionGameAction(s, 'advance'), true);
    advance(s, .4);
    assert.ok(s.resolution.activity.state.pending);
    const pending = structuredClone(s);
    s = restore(serialize(s));
    assert.deepEqual(s, pending);
    solveResolutionGame(s);
    assert.equal(s.ending, null);
    assert.deepEqual(s.fieldEvents.journal, journal);
    assert.deepEqual(s.reports, reports);
    assert.deepEqual(getMiniGameUnlocks(s), ['watch', 'transmission']);
    assert.equal(chooseResolution(s, 'transmission-broadcast'), true);
    assert.equal(s.ending, 'transmission');
    assert.deepEqual(restore(serialize(s)), s);
  }
});

test('Transmission practice stops before the ending and cannot escape into the story', () => {
  const s = createMiniGame('transmission', 'hard', 756);
  assert.equal(s.resolution.activity.state.firstCall, 'record');
  assert.equal(chooseResolution(s, 'back'), false);
  solveResolutionGame(s);
  assert.equal(miniGameComplete(s), true);
  assert.equal(miniGameResult(s).success, true);
  assert.deepEqual(getMiniGameUnlocks(s), []);
  const complete = serialize(s);
  for (const id of ['back', 'transmission-broadcast']) assert.equal(chooseResolution(s, id), false);
  for (const id of ['advance', 'wait', 'turn']) assert.equal(resolutionGameAction(s, id), false);
  advance(s, 60);
  assert.equal(serialize(s), complete);
  assert.deepEqual(restore(complete), s);
});

test('the second release upgrades unfinished first-release routes and preserves both generations of achieved endings', () => {
  for (const version of [undefined, 1]) {
    const old = storyTransmission();
    delete old.resolution.activity;
    if (version === undefined) delete old.resolution.version;else old.resolution.version = version;
    for (const report of old.reports) delete report.resolutionGame;
    const resumed = restore(serialize(old));
    assert.ok(resumed);
    assert.equal(resumed.resolution.version, 2);
    assert.equal(resumed.resolution.activity.state.crossing, 0);
    assert.equal(chooseResolution(resumed, 'transmission-broadcast'), false);
    solveResolutionGame(resumed);chooseResolution(resumed, 'transmission-broadcast');
    delete resumed.resolution.activity;
    if (version === undefined) delete resumed.resolution.version;else resumed.resolution.version = version;
    for (const report of resumed.reports) delete report.resolutionGame;
    assert.deepEqual(restore(serialize(resumed)), resumed);
    assert.deepEqual(getMiniGameUnlocks(resumed), ['watch']);
  }
  const rescue = storyRescue();solveResolutionGame(rescue);chooseResolution(rescue, 'rescue-leave');
  rescue.resolution.version = 1;
  assert.deepEqual(restore(serialize(rescue)), rescue, 'first-release rescue endings retain earned play');
  const activeRescue = storyRescue();activeRescue.resolution.version = 1;
  const upgraded = restore(serialize(activeRescue));
  assert.equal(upgraded.resolution.version, 2);
  assert.deepEqual(upgraded.resolution.activity, activeRescue.resolution.activity);
});

test('Transmission saves reject changed memories, wrong route provenance, impossible queued controls and premature finales', () => {
  const s = storyTransmission();
  for (const mutate of [
    c => { c.resolution.activity.state.firstCall = 'answer'; },
    c => { c.resolution.activity.state.pending = { action: 'turn', dueAt: .5 }; },
    c => { c.resolution.activity.kind = 'rescue'; },
    c => { c.resolution.activity.state.stage = 'complete'; },
    c => { delete c.resolution.activity; },
    c => { c.practice = 'rescue'; }
  ]) {
    const copy = structuredClone(s);mutate(copy);
    assert.equal(restore(serialize(copy)), null);
  }
});
