import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  createGame, startShift, advance, shoot, reload, move, inspect, FIELD_SITES,
  chooseFieldEncounter, continueFieldEncounter, beginDebrief, answer,
  getQuestion, restore, serialize
} from '../docs/engine.js';
import { ENCOUNTERS, currentEncounter, encounterAfterStep, encounterAudioCue } from '../docs/encounters.js';
import { ENCOUNTER_DETOURS } from '../docs/encounter-detours.js';
import { planFieldRoute } from '../docs/field.js';
import { availableResolutions } from '../docs/alternate-endings.js';
import { encounterMarkup, notebookMarkup, FIELD_ART } from '../docs/art.js';
import { decisionQuestion } from '../docs/decision-copy.js';
import { SoundEvents } from '../docs/audio-events.js';
import { progressSnapshot, encodeProgress, decodeProgress } from '../docs/progress.js';

// These branches use real choices and completed walks, without injected clues,
// journal entries or flags. Keeping the same seed isolates player decisions.
function play(picks, seed = 704) {
  const game = createGame('story', seed), scenes = new Map(), arrivals = new Map();
  for (let night = 0; night < 3; night++) {
    assert.equal(startShift(game), true);
    let ticks = 0;
    while (game.phase === 'tower') {
      assert.ok(ticks++ < 300);
      advance(game, .25);
      for (const target of [...game.targets]) if (target.kind === 'corn') shoot(game, target.x, target.y - 34);
      if (game.rounds < 2) reload(game);
    }
    assert.equal(game.phase, 'field');
    for (const destination of ['pump', 'corner', 'drain', 'tower']) {
      const site = FIELD_SITES.find(candidate => candidate.id === destination);
      for (const step of planFieldRoute(game, site).steps) {
        assert.equal(move(game, step.x - game.player.x, step.y - game.player.y), true);
        if (game.fieldEvents.pending) {
          const event = currentEncounter(game);
          assert.equal(scenes.has(event.id), false, 'each story slot appears only once');
          scenes.set(event.id, event);
          arrivals.set(event.id, structuredClone(game));
          assert.equal(chooseFieldEncounter(game, picks[event.id] || event.choices[0].id), true, event.id);
          assert.equal(continueFieldEncounter(game), true);
        }
      }
      if (destination !== 'tower') assert.ok(inspect(game));
    }
    assert.equal(beginDebrief(game), true);
    assert.equal(answer(game, 'truth'), true);
    assert.equal(answer(game, 'evidence'), true);
    if (night < 2) assert.equal(answer(game, 'sign'), true);
  }
  assert.equal(scenes.size, 12);
  assert.equal(game.fieldEvents.journal.length, 12);
  assert.ok(restore(serialize(game)));
  return { game, scenes, arrivals };
}

let branches;
function branchGames() {
  return branches ??= {
    leave: play({ 'first-call': 'leave' }),
    record: play({ 'first-call': 'record', 'second-call': 'compare', 'lamp-keeper': 'hand', 'two-towers': 'other', 'future-call': 'record', 'your-outline': 'name', 'last-follower': 'reply' }),
    compare: play({ 'first-call': 'record', 'second-call': 'compare', 'lamp-keeper': 'hand', 'two-towers': 'other', 'future-call': 'compare', 'your-outline': 'name' })
  };
}

test('player decisions replace closed leads with different incidents under the same random seed', () => {
  const { leave, record } = branchGames();
  assert.deepEqual(leave.game.fieldEvents.plan.map(({ detour, ...plan }) => plan), record.game.fieldEvents.plan.map(({ detour, ...plan }) => plan));
  for (const id of ['second-call', 'two-towers', 'future-call', 'your-outline', 'last-follower']) {
    assert.ok(leave.scenes.get(id).detour, `${id} must change after its lead closes`);
    assert.equal(record.scenes.get(id).detour, undefined, `${id} must stay while its route is possible`);
    assert.notEqual(leave.scenes.get(id).title, record.scenes.get(id).title);
    assert.deepEqual(leave.scenes.get(id).choices.map(option => option.id), ['pass', 'observe', 'probe']);
  }
  for (const id of ['first-call', 'paired-tracks', 'unattended-lamp', 'extra-step', 'lamp-keeper']) {
    assert.equal(leave.scenes.get(id).detour, undefined, `${id} keeps an unspent opportunity`);
  }
});

test('the late follower stays available for recorded testimony and changes after the incompatible comparison', () => {
  const { record, compare } = branchGames();
  assert.equal(record.scenes.get('last-follower').detour, undefined);
  assert.ok(compare.scenes.get('last-follower').detour);
  assert.equal(compare.scenes.get('future-call').detour, undefined, 'a still-open transmission receives its comparison');
  const recordRoutes = availableResolutions(record.game);
  assert.equal(recordRoutes.find(route => route.id === 'witness_present').disabled, false);
  assert.equal(recordRoutes.find(route => route.id === 'rescue').disabled, false);
  assert.equal(recordRoutes.find(route => route.id === 'relief').disabled, false);
  const compareRoutes = availableResolutions(compare.game);
  assert.equal(compareRoutes.find(route => route.id === 'transmission').disabled, false);
  assert.equal(compareRoutes.find(route => route.id === 'witness_present').disabled, true);
  assert.equal(compareRoutes.find(route => route.id === 'rescue').disabled, false, 'an unrelated detour cannot revoke an earned route');
});

test('a chosen detour stays fixed through resolution, notebook, debrief, reload and progress transfer', async () => {
  let game = structuredClone(branchGames().leave.arrivals.get('second-call'));
  const event = currentEncounter(game), before = encounterMarkup(game), plan = structuredClone(game.fieldEvents.plan);
  game = restore(serialize(game));
  assert.ok(game);
  assert.equal(encounterMarkup(game), before);
  assert.deepEqual(game.fieldEvents.plan, plan);
  const flags = [...game.fieldEvents.flags], option = event.choices.find(choice => choice.id === 'observe');
  assert.equal(chooseFieldEncounter(game, 'observe'), true);
  assert.deepEqual(game.fieldEvents.flags, flags);
  assert.equal(currentEncounter(game).title, event.title);
  assert.equal(currentEncounter(game).detour, event.detour);
  assert.ok(encounterMarkup(game).includes(option.result));
  assert.equal(chooseFieldEncounter(game, 'probe'), false, 'a resolved detour cannot be played twice');
  const savedOutcome = encounterMarkup(game);
  game = restore(serialize(game));
  assert.equal(encounterMarkup(game), savedOutcome);
  assert.equal(continueFieldEncounter(game), true);
  assert.equal(encounterAfterStep(game), false, 'dismissal does not deal a second scene at the same step');
  assert.ok(notebookMarkup(game, game.evidence.length).includes(event.title));
  assert.ok(notebookMarkup(game, game.evidence.length).includes(event.report));
  game.phase = 'debrief'; game.question = 1;
  assert.equal(getQuestion(game).options.find(choice => choice.id === 'field-notes').label, event.report);
  assert.equal(decisionQuestion(game).options.find(choice => choice.id === 'field-notes').label, event.shortReport);
  assert.equal(answer(game, 'field-notes'), true);
  assert.equal(game.reports.at(-1).answer, event.report);
  const snapshot = progressSnapshot(game, { collected: [], runs: [] });
  const imported = await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(imported, snapshot);
  assert.deepEqual(imported.save.fieldEvents.plan, plan);
  assert.ok(notebookMarkup(imported.save, imported.save.evidence.length).includes(event.title));
});

test('every replacement uses a cached illustration, distinct choices and at least the original calming benefit', () => {
  const worker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  assert.ok(worker.includes("'./encounter-detours.js'"));
  assert.ok(worker.includes("'./ending-paths.js'"));
  for (const [slot, alternatives] of Object.entries(ENCOUNTER_DETOURS)) {
    const canonical = ENCOUNTERS.find(event => event.id === slot);
    for (const [index, detour] of alternatives.entries()) {
      const game = createGame('story', 704);
      Object.assign(game, { phase: 'field', shift: canonical.night, exposure: 20 });
      game.fieldEvents.seen.push(slot);
      game.fieldEvents.plan.find(entry => entry.id === slot).detour = index + 1;
      game.fieldEvents.pending = { id: slot, choice: null, ...game.player };
      const event = currentEncounter(game);
      assert.equal(event.id, slot);
      assert.equal(event.title, detour.title);
      assert.ok(event.shortReport.length <= 85);
      assert.equal(event.choices[0].delta, 0);
      assert.ok(Math.min(...event.choices.map(choice => choice.delta)) <= Math.min(...canonical.choices.map(choice => choice.delta)));
      for (const option of event.choices) {
        assert.equal(canonical.choices.some(choice => choice.id === option.id), false);
        assert.ok(!option.flag && !option.requires);
      }
      const file = event.art.startsWith('field:') ? FIELD_ART[event.art.slice(6)].file : `encounter-${event.art}`;
      assert.ok(existsSync(new URL(`../docs/assets/${file}.webp`, import.meta.url)));
      assert.ok(worker.includes(`'./assets/${file}.webp'`));
      assert.ok(encounterMarkup(game).includes(`./assets/${file}.webp`));
      assert.equal(chooseFieldEncounter(game, 'observe'), true);
      assert.deepEqual(game.fieldEvents.flags, []);
      assert.ok(availableResolutions(game).every(route => route.disabled));
      assert.ok(restore(serialize(game)));
    }
  }
});

test('detour audio uses its own scene identity and never replays a canonical radio cue', () => {
  const game = structuredClone(branchGames().leave.arrivals.get('second-call'));
  const pending = game.fieldEvents.pending;
  game.fieldEvents.pending = null;
  const events = new SoundEvents(); events.reset(game);
  game.fieldEvents.pending = pending;
  const calls = [], sound = { step() {}, cueEncounter(event) { calls.push(event); } };
  const expectedId = ENCOUNTER_DETOURS['second-call'][currentEncounter(game).detour - 1].id;
  assert.deepEqual(encounterAudioCue(game), { id: expectedId, choice: null });
  events.update(game, sound, true);
  events.update(game, sound, true);
  assert.deepEqual(calls, [{ id: expectedId, choice: null }]);
  assert.equal(chooseFieldEncounter(game, 'pass'), true);
  events.update(game, sound, true);
  assert.deepEqual(calls.at(-1), { id: expectedId, choice: 'pass' });
  events.reset(restore(serialize(game)));
  events.update(game, sound, true);
  assert.equal(calls.length, 2, 'resuming a detour does not replay its arrival cue');
});

test('saved detours reject invalid selections and incompatible canonical answers', () => {
  const pending = branchGames().leave.arrivals.get('second-call');
  const bad = change => {
    const game = structuredClone(pending);
    change(game, game.fieldEvents.plan.find(entry => entry.id === 'second-call'));
    assert.equal(restore(serialize(game)), null);
  };
  for (const detour of [0, -1, 3, 1.5, '1', null]) bad((game, entry) => { entry.detour = detour; });
  bad(game => { delete game.fieldEvents.director; });
  bad(game => { game.fieldEvents.director = 2; });
  bad(game => { game.fieldEvents.plan.find(entry => entry.id === 'future-call').detour = 1; });
  bad(game => { game.fieldEvents.plan.find(entry => entry.id === 'first-call').detour = 1; });
  bad(game => { game.fieldEvents.pending.choice = 'disconnect'; });
  const resolved = structuredClone(pending);
  assert.equal(chooseFieldEncounter(resolved, 'pass'), true);
  delete resolved.fieldEvents.plan.find(entry => entry.id === 'second-call').detour;
  assert.equal(restore(serialize(resolved)), null, 'a replacement answer cannot become a canonical encounter answer');
});
