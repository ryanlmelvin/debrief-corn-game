import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, enterField, move, chooseFieldEncounter, continueFieldEncounter, restore, serialize } from '../docs/engine.js';
import { ENCOUNTERS, currentEncounter, encounterAfterStep, encounterSchedule } from '../docs/encounters.js';
import { ENCOUNTER_DETOURS } from '../docs/encounter-detours.js';
import { chooseRogue } from '../docs/rogue.js';

function atEncounter(id, exposure = 20, variant = 0) {
  const game = createGame('story', 42);
  startShift(game); game.incident = true; enterField(game);
  // Choose a presentation directly; the real director's first radio is tested
  // below, and detours are checked separately rather than mistaken for radios.
  delete game.fieldEvents.director;
  game.fieldEvents.plan.find(entry => entry.id === id).variant = variant;
  const encounter = encounterSchedule(game).find(entry => entry.id === id);
  Object.assign(game, { shift: encounter.night, fieldSteps: encounter.step, exposure, player: { x: 4, y: 4 } });
  game.fieldEvents.seen = ENCOUNTERS.slice(0, ENCOUNTERS.findIndex(entry => entry.id === id)).map(entry => entry.id);
  game.fieldEvents.journey = { destination: 'pump', style: 'quiet' };
  assert.equal(encounterAfterStep(game), true);
  return game;
}

function roundTrip(game) {
  const restored = restore(serialize(game));
  assert.ok(restored);
  assert.deepEqual(restored, game);
  return restored;
}

test('radio encounter choices enter tuning, retain the discovery, and can withdraw without playing', () => {
  for (const id of ['first-call', 'second-call', 'future-call']) for (const variant of [0, 1, 2]) {
    let game = roundTrip(atEncounter(id, 25, variant));
    assert.ok(currentEncounter(game).choices.some(option => option.id === 'broadcast'));
    const before = { rng: game.rng, exposure: game.exposure, player: { ...game.player } };
    assert.equal(chooseFieldEncounter(game, 'broadcast'), true);
    assert.equal(game.phase, 'rogue');
    assert.equal(game.rogue.route, 'broadcast');
    assert.equal(game.rogue.stage, 'intro');
    assert.deepEqual(game.fieldEvents.journal, [{ id, choice: 'broadcast', delta: 0, ...before.player }]);
    assert.equal(game.fieldEvents.pending, null);
    assert.equal(game.fieldEvents.journey, null);
    assert.equal(game.rng, before.rng);
    assert.equal(game.exposure, before.exposure);
    assert.equal(game.reports.length, 0, 'the introduction is not a played mini game');
    game = roundTrip(game);
    assert.equal(chooseRogue(game, 'back'), true);
    assert.equal(game.phase, 'field');
    assert.equal(game.rogue, undefined);
    assert.equal(game.reports.length, 0);
    assert.equal(game.fieldEvents.journal.length, 1);
    assert.equal(chooseFieldEncounter(game, 'broadcast'), false, 'the consumed encounter cannot repeat its choice');
    game = roundTrip(game);
    assert.equal(move(game, 1, 0), true, 'withdrawing returns control to field exploration');
  }
});

test('the first real radio remains discoverable across seeds without choosing an ending path', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const game = createGame('story', seed);
    startShift(game); game.incident = true; enterField(game);
    for (let step = 0; !game.fieldEvents.pending && step < 5; step++) assert.equal(move(game, 1, 0), true);
    assert.equal(currentEncounter(game)?.id, 'first-call');
    assert.ok(currentEncounter(game).choices.some(option => option.id === 'broadcast'));
    assert.equal(chooseFieldEncounter(game, 'broadcast'), true);
    assert.equal(chooseRogue(game, 'begin'), true);
    assert.equal(game.rogue.stage, 'play');
    roundTrip(game);
  }
});

test('surrender is a high-exposure choice at the roots and figures, including every presentation', () => {
  for (const id of ['lamp-keeper', 'root-knot', 'your-outline']) for (const variant of [0, 1, 2]) {
    const locked = atEncounter(id, 69.9, variant), snapshot = serialize(locked);
    assert.equal(currentEncounter(locked).choices.some(option => option.id === 'surrender'), false);
    assert.equal(chooseFieldEncounter(locked, 'surrender'), false);
    assert.equal(serialize(locked), snapshot);
    const game = atEncounter(id, 70, variant);
    assert.ok(currentEncounter(game).choices.some(option => option.id === 'surrender'));
    assert.equal(chooseFieldEncounter(game, 'surrender'), true);
    assert.equal(game.phase, 'rogue');
    assert.equal(game.rogue.route, 'corn');
    assert.equal(game.exposure, 100);
    assert.deepEqual(game.fieldEvents.journal, [{ id, choice: 'surrender', delta: 0, x: 4, y: 4 }]);
    assert.equal(game.fieldEvents.pending, null);
    roundTrip(game);
    assert.equal(chooseRogue(game, 'back'), false, 'the transformation cannot be withdrawn');
    assert.equal(chooseRogue(game, 'root'), true);
    assert.equal(game.ending, 'assimilation');
    roundTrip(game);
  }
});

test('contextual routes reject unrelated encounters, idle field calls, and already answered cards', () => {
  for (const value of ['broadcast', 'surrender']) {
    const idle = createGame('story', 42); startShift(idle); idle.incident = true; enterField(idle);
    const before = serialize(idle);
    assert.equal(chooseFieldEncounter(idle, value), false);
    assert.equal(serialize(idle), before);
    const unrelated = atEncounter('paired-tracks', 80), original = serialize(unrelated);
    assert.equal(chooseFieldEncounter(unrelated, value), false);
    assert.equal(serialize(unrelated), original);
  }
  const answered = atEncounter('first-call');
  assert.equal(chooseFieldEncounter(answered, 'leave'), true);
  const before = serialize(answered);
  assert.equal(chooseFieldEncounter(answered, 'broadcast'), false);
  assert.equal(serialize(answered), before);
  assert.equal(continueFieldEncounter(answered), true);
});

test('replacement scenes do not inherit choices about absent radios or figures', () => {
  for (const id of ['second-call', 'future-call', 'your-outline']) {
    for (let index = 0; index < ENCOUNTER_DETOURS[id].length; index++) {
      const game = atEncounter(id, 80);
      game.fieldEvents.director = 1;
      game.fieldEvents.plan.find(entry => entry.id === id).detour = index + 1;
      const before = serialize(game);
      assert.equal(currentEncounter(game).choices.some(option => option.route), false);
      assert.equal(chooseFieldEncounter(game, id === 'your-outline' ? 'surrender' : 'broadcast'), false);
      assert.equal(serialize(game), before);
      roundTrip(game);
    }
  }
});
