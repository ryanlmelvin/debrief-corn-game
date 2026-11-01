import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, restore, serialize } from '../docs/engine.js';
import { createMiniGame, getMiniGameUnlocks, miniGameComplete, miniGameResult } from '../docs/mini-games.js';
import { chooseResolution, startResolution, getResolution, validResolution } from '../docs/alternate-endings.js';
import { resolutionGameAction, resolutionGameActive, releaseResolutionGame } from '../docs/resolution-games.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';
import { rescueStatus } from '../docs/rescue.js';
import { chooseRogue } from '../docs/rogue.js';
import { transmissionStatus, transmissionHorror, TRANSMISSION_DELAY, TRANSMISSION_EXPOSURE_COST } from '../docs/transmission.js';

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


function waitForTransmissionState(s, condition) {
  for (let frame = 0; !condition(); frame++) {
    assert.ok(frame < 1000, 'the requested state must be reachable through the real clock');
    advance(s, .05);
  }
}
function firstTransmissionBend(s) {
  const t = s.resolution.activity.state;
  while (!transmissionStatus(t).arrivalSafe) advance(s, .05);
  assert.equal(resolutionGameAction(s, 'advance'), true);
  waitForTransmissionState(s, () => t.crossing === 1);
  return t;
}
function faceSecondCrossing(s) {
  const t = firstTransmissionBend(s);
  waitForTransmissionState(s, () => !transmissionHorror(t).present && !transmissionHorror(t).warning);
  assert.equal(resolutionGameAction(s, 'turn'), true);
  advance(s, TRANSMISSION_DELAY);
  assert.equal(t.heading, 1);
  return t;
}
function hitTransmissionRow(s) {
  const t = s.resolution.activity.state, previous = t.setbacks;
  waitForTransmissionState(s, () => transmissionStatus(t).canAdvance && !transmissionStatus(t).arrivalSafe);
  assert.equal(resolutionGameAction(s, 'advance'), true);
  waitForTransmissionState(s, () => t.setbacks > previous);
  return t;
}
function hitTransmissionHorror(s) {
  const t = s.resolution.activity.state, previous = t.setbacks;
  waitForTransmissionState(s, () => transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present);
  assert.equal(resolutionGameAction(s, 'turn'), true);
  waitForTransmissionState(s, () => t.setbacks > previous);
  return t;
}

test('Transmission collisions add ten exposure once, while tutorial, idle time and reloading add none', () => {
  let s = storyTransmission();s.exposure = 23.5;
  const journal = structuredClone(s.fieldEvents.journal), reports = structuredClone(s.reports);
  advance(s, 60);
  assert.equal(s.exposure, 23.5);
  faceSecondCrossing(s);
  assert.equal(s.exposure, 23.5, 'the tutorial and correctly timed Turn are safe');
  hitTransmissionRow(s);
  assert.equal(s.exposure, 23.5 + TRANSMISSION_EXPOSURE_COST);
  advance(s, 60);
  assert.equal(s.exposure, 33.5, 'the same setback cannot be charged on a later frame');
  s = restore(serialize(s));assert.ok(s);
  advance(s, 60);
  assert.equal(s.exposure, 33.5, 'restoring a past setback is not a new collision');
  hitTransmissionRow(s);
  assert.equal(s.exposure, 43.5);
  assert.deepEqual(s.fieldEvents.journal, journal);assert.deepEqual(s.reports, reports);
  assert.deepEqual(restore(serialize(s)), s);
});

test('a delayed blocked Turn adds exposure without turning or losing the cleared crossing', () => {
  let s = storyTransmission();firstTransmissionBend(s);
  const t = s.resolution.activity.state;
  waitForTransmissionState(s, () => transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present);
  resolutionGameAction(s, 'turn');advance(s, .4);
  s = restore(serialize(s));assert.ok(s);
  advance(s, 60);
  assert.equal(s.exposure, 10);
  assert.equal(s.resolution.activity.state.crossing, 1);
  assert.equal(s.resolution.activity.state.heading, 0);
  assert.equal(s.resolution.activity.state.setbacks, 1);
  assert.equal(transmissionStatus(s.resolution.activity.state).canTurn, true);
  assert.deepEqual(restore(serialize(s)), s);
  solveResolutionGame(s);
  assert.equal(s.exposure, 10, 'safe commands add no further exposure');
});

test('story exposure reaching 100 follows the existing Corn consequence and retains the Transmission receipt', () => {
  let s = storyTransmission();s.exposure = 95;
  faceSecondCrossing(s);
  const reports = structuredClone(s.reports);
  hitTransmissionRow(s);
  assert.equal(s.exposure, 100);assert.equal(s.phase, 'rogue');assert.equal(s.rogue.route, 'corn');
  assert.equal(s.rogue.stage, 'intro');assert.equal(s.ending, null);assert.equal(s.resolution, undefined);
  assert.deepEqual(s.reports, reports, 'the completed entry receipt remains in the transcript');
  assert.deepEqual(getMiniGameUnlocks(s), ['watch', 'transmission']);
  s = restore(serialize(s));assert.ok(s);
  assert.equal(chooseRogue(s, 'root'), true);assert.equal(s.ending, 'assimilation');
  assert.deepEqual(restore(serialize(s)), s);
});

test('practice exposure reaches a failed result at 100 without chaining into story or awarding an ending', () => {
  let s = createMiniGame('transmission', 'story', 4);firstTransmissionBend(s);
  for (let hit = 1; hit <= 10; hit++) {
    hitTransmissionHorror(s);
    assert.equal(s.exposure, hit * 10);
    s = restore(serialize(s));assert.ok(s);
    assert.equal(miniGameComplete(s), hit === 10);
  }
  assert.equal(s.phase, 'resolution');assert.equal(s.practice, 'transmission');
  assert.equal(s.ending, null);assert.equal(s.rogue, undefined);
  assert.equal(resolutionGameActive(s), false);
  assert.equal(miniGameResult(s).success, false);assert.equal(miniGameResult(s).id, 'transmission');
  assert.match(miniGameResult(s).message, /Exposure reached 100/);
  assert.deepEqual(getMiniGameUnlocks(s), []);
  const finished = serialize(s);
  for (const action of ['advance', 'turn', 'wait']) assert.equal(resolutionGameAction(s, action), false);
  advance(s, 60);assert.equal(serialize(s), finished);
  for (const action of ['back', 'transmission-broadcast']) assert.equal(chooseResolution(s, action), false);
  assert.deepEqual(restore(finished), s);
});

test('legacy pending saves pay only their new collision even when the saved retry counter is saturated', () => {
  for (const priorSetbacks of [7, 1000000]) {
    let s = storyTransmission();s.exposure = 18;
    const t = s.resolution.activity.state;t.version = 1;t.setbacks = priorSetbacks;
    waitForTransmissionState(s, () => !transmissionStatus(t).arrivalSafe);
    resolutionGameAction(s, 'advance');advance(s, .4);
    s = restore(serialize(s));assert.ok(s);
    assert.equal(s.exposure, 18, 'old failures are never retroactively charged');
    advance(s, 60);
    assert.equal(s.exposure, 28);
    assert.equal(s.resolution.activity.state.setbacks, Math.min(1000000, priorSetbacks + 1));
    s = restore(serialize(s));advance(s, 60);
    assert.equal(s.exposure, 28);
  }
});
