import test from 'node:test';
import assert from 'node:assert/strict';
import { createRescue, rescueAction, advanceRescue, rescueStatus, validRescue } from '../docs/rescue.js';
import { rescueMarkup } from '../docs/rescue-ui.js';

function roundTrip(r) {
  const copy = JSON.parse(JSON.stringify(r));
  assert.equal(validRescue(copy), true, 'every playable activity state survives serialization');
  assert.deepEqual(copy, r);
  return copy;
}
function align(r) {
  let steps = 0;
  while (!rescueStatus(r).aligned) {
    assert.equal(rescueAction(r, 'later'), true);
    assert.ok(++steps < 12, 'the recorded breath can be aligned within one reel rotation');
  }
  assert.equal(rescueAction(r, 'align'), true);
  assert.equal(r.stage, 'pull');
  return r;
}
function waitFor(r, predicate) {
  for (let frame = 0; frame < 2000; frame++) {
    if (predicate(rescueStatus(r))) return;
    assert.equal(advanceRescue(r, .025), true);
    assert.equal(validRescue(r), true);
  }
  assert.fail('the next breathing cue must arrive');
}
function grip(r) {
  waitFor(r, view => view.canPull && !view.warning);
  const before = r.pulls;
  assert.equal(rescueAction(r, 'pull'), true);
  waitFor(r, view => view.needsRelease || view.stage === 'complete');
  assert.equal(r.pulls, before + 1, 'a complete grip moves the person one step out of the roots');
  if (r.stage !== 'complete') assert.equal(rescueAction(r, 'release'), true);
  return r;
}

test('tape alignment varies deterministically without drawing ambient randomness', () => {
  const random = Math.random;
  try {
    Math.random = () => { throw Error('Rescue must not consume ambient randomness.'); };
    const targets = new Set();
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 42, 903, 0xffffffff]) {
      const r = createRescue(seed);
      assert.deepEqual(createRescue(seed), r);
      targets.add(r.target);
      assert.equal(validRescue(r), true);
      const before = structuredClone(r);
      assert.equal(rescueAction(r, 'align'), false);
      assert.equal(rescueAction(r, 'pull'), false);
      assert.equal(advanceRescue(r, 10), false);
      assert.deepEqual(r, before, 'neither waiting nor pulling can skip the alignment');
      assert.equal(rescueAction(r, 'earlier'), true);
      assert.equal(rescueAction(r, 'later'), true);
      assert.deepEqual(r, before, 'moving the tape back and forward is reversible');
      align(r);
      roundTrip(r);
    }
    assert.equal(targets.size, 8);
  } finally { Math.random = random; }
});

test('four actual hold and release grips free both boots across seeds and saved frames', () => {
  for (const seed of [0, 1, 7, 42, 903]) {
    let r = roundTrip(align(createRescue(seed)));
    for (let count = 1; count <= 4; count++) {
      waitFor(r, view => view.canPull && !view.warning);
      assert.equal(rescueAction(r, 'pull'), true);
      advanceRescue(r, .25);
      assert.equal(r.holding, true);
      assert.ok(rescueStatus(r).progress > 0);
      r = roundTrip(r);
      waitFor(r, view => view.needsRelease || view.stage === 'complete');
      assert.equal(r.pulls, count);
      assert.equal(rescueStatus(r).boots.filter(boot => boot.freed).length, Math.floor(count / 2));
      if (count < 4) {
        assert.equal(r.stage, 'pull');
        assert.equal(r.needsRelease, true);
        assert.equal(rescueAction(r, 'pull'), false);
        assert.equal(rescueAction(r, 'release'), true);
      }
      r = roundTrip(r);
    }
    assert.equal(r.stage, 'complete');
    assert.equal(r.holding, false);
    assert.equal(r.slips, 0);
    assert.equal(rescueStatus(r).boots.every(boot => boot.freed), true);
    const finished = structuredClone(r);
    for (const action of ['pull', 'release', 'align', 'earlier', 'later', 'back']) assert.equal(rescueAction(r, action), false);
    assert.equal(advanceRescue(r, 100), false);
    assert.deepEqual(r, finished, 'completion leaves the existing final story choice to the resolution engine');
  }
});

test('holding continuously cannot win and one quiet breath cannot award multiple grips', () => {
  const r = align(createRescue(42));
  waitFor(r, view => view.canPull);
  assert.equal(rescueAction(r, 'pull'), true);
  advanceRescue(r, 60);
  assert.equal(r.pulls, 1);
  assert.equal(r.stage, 'pull');
  assert.equal(r.needsRelease, true);
  assert.equal(r.holding, true);
  roundTrip(r);
  assert.equal(rescueAction(r, 'release'), true);
  grip(r);
  assert.equal(r.pulls, 2);

  const sameBreath = align(createRescue(0));
  grip(sameBreath);
  assert.equal(rescueStatus(sameBreath).safe, true);
  assert.equal(rescueStatus(sameBreath).canPull, false);
  assert.equal(rescueAction(sameBreath, 'pull'), true);
  advanceRescue(sameBreath, .2);
  assert.equal(sameBreath.pulls, 1);
  assert.equal(sameBreath.needsRelease, true);
  assert.equal(rescueAction(sameBreath, 'release'), true);
  grip(sameBreath);
  assert.equal(sameBreath.pulls, 2);
});

test('tightening resets only the current grip and the player can recover by releasing', () => {
  let r = align(createRescue(42));
  grip(r);
  waitFor(r, view => view.canPull && view.warning);
  assert.equal(rescueAction(r, 'pull'), true);
  advanceRescue(r, .2);
  assert.ok(r.progress > 0, 'a late pull initially moves the boot');
  waitFor(r, view => view.needsRelease);
  assert.equal(r.pulls, 1, 'previous completed grips are retained');
  assert.equal(r.progress, 0);
  assert.equal(r.slips, 1);
  r = roundTrip(r);
  assert.equal(rescueAction(r, 'release'), true);
  while (r.stage !== 'complete') grip(r);
  assert.equal(r.pulls, 4);
  assert.equal(r.slips, 1);
});

test('pulling before the silence requires a fresh grip, and early release preserves checkpoints only', () => {
  const r = align(createRescue(1));
  assert.equal(rescueStatus(r).safe, false);
  assert.equal(rescueAction(r, 'pull'), true);
  advanceRescue(r, 12);
  assert.equal(r.pulls, 0);
  assert.equal(r.needsRelease, true);
  assert.equal(r.slips, 1, 'holding against the roots reports one slip, not one each frame');
  assert.equal(rescueAction(r, 'release'), true);
  waitFor(r, view => view.canPull && !view.warning);
  rescueAction(r, 'pull');
  advanceRescue(r, .2);
  assert.ok(r.progress > 0);
  rescueAction(r, 'release');
  assert.equal(r.progress, 0);
  assert.equal(r.holding, false);
  assert.equal(r.pulls, 0);
  grip(r);
  assert.equal(r.pulls, 1);
});

test('unknown controls and invalid time never change a playable save', () => {
  for (const r of [createRescue(), align(createRescue())]) {
    const before = structuredClone(r);
    for (const action of [null, undefined, '', 'begin', 'back', 'finish', 'rescue-leave', {}, 12]) assert.equal(rescueAction(r, action), false);
    for (const dt of [0, -1, NaN, Infinity, '1', null]) assert.equal(advanceRescue(r, dt), false);
    assert.deepEqual(r, before);
    const view = rescueStatus(r);
    assert.ok(view.cue && view.instruction);
    assert.deepEqual(r, before, 'rendering status never consumes time or changes the save');
  }
});

test('damaged saves and impossible combinations fail validation without mutation', () => {
  const alignState = createRescue(2), pullState = align(createRescue(2));
  const broken = [null, undefined, {}, [], 3, { ...alignState, surprise: true }, { ...alignState, version: 2 },
    { ...alignState, stage: 'unknown' }, { ...alignState, time: -1 }, { ...alignState, time: NaN },
    { ...alignState, offset: 12 }, { ...alignState, offset: .5 }, { ...alignState, target: 0 },
    { ...alignState, holding: true }, { ...alignState, pulls: 1 }, { ...pullState, offset: 0 },
    { ...pullState, needsRelease: true }, { ...pullState, progress: .2 },
    { ...pullState, lastPullCycle: 5 }, { ...pullState, pulls: 4 },
    { ...pullState, stage: 'complete' }, { ...pullState, slips: -1 }];
  for (const r of broken) {
    const before = structuredClone(r);
    assert.equal(validRescue(r), false);
    assert.equal(rescueStatus(r), null);
    assert.equal(rescueAction(r, 'pull'), false);
    assert.equal(advanceRescue(r, 10), false);
    assert.deepEqual(r, before);
  }
});

test('rescue controls expose visual timing, tape keys and an explicit release without sound', () => {
  const markup = rescueMarkup();
  for (const action of ['earlier', 'later', 'align', 'pull', 'release']) assert.match(markup, new RegExp(`data-value="${action}"`));
  assert.match(markup, /data-hold="pull"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /YOUR TAPE/);
  assert.match(markup, /QUIET/);
  assert.match(markup, /LEFT BOOT/);
  assert.match(markup, /RIGHT BOOT/);
  assert.match(markup, /Sound is optional/);
  assert.doesNotMatch(markup, /data-value="rescue-leave"/, 'the final sacrifice remains a separate story choice');
});
