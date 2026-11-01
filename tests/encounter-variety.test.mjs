import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createGame, startShift, advance, shoot, reload, move, inspect, FIELD_SITES,
  chooseFieldEncounter, continueFieldEncounter, beginDebrief, answer, getQuestion,
  restore, serialize
} from '../docs/engine.js';
import {
  ENCOUNTERS, freshFieldEvents, encounterAfterStep, encounterForState,
  encounterSchedule, currentEncounter
} from '../docs/encounters.js';
import { planFieldRoute } from '../docs/field.js';
import { availableResolutions, chooseResolution } from '../docs/alternate-endings.js';
import { canTakeEvidenceOutside } from '../docs/ending-requirements.js';
import { encounterMarkup, notebookMarkup } from '../docs/art.js';
import { decisionQuestion } from '../docs/decision-copy.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';

const seeds = [1, 42, 847, 12345];
const timings = [[2, 4], [8, 10], [15, 17], [22, 24]];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = (seed = 42) => {
  const game = { ...createGame('story', seed), phase: 'field', entered: true, departure: 'chosen' };
  // Presentation fixtures select a canonical beat directly. Real campaigns below
  // retain the director and test its route protection through ordinary play.
  delete game.fieldEvents.director;
  return game;
};
const mechanics = event => ({ id: event.id, night: event.night, choices: event.choices.map(({ id, delta, flag, requires }) => ({ id, delta, flag, requires })) });

function resume(game) {
  const restored = restore(serialize(game));
  assert.ok(restored, `${game.phase}, seed ${game.runId}, night ${game.shift + 1} must remain resumable`);
  assert.deepEqual(restored, game);
  return restored;
}

function trigger(game, id) {
  const event = encounterSchedule(game).find(item => item.id === id);
  Object.assign(game, { shift: event.night, fieldSteps: event.step, player: { x: 4, y: 4 } });
  game.fieldEvents.seen = ENCOUNTERS.slice(0, ENCOUNTERS.findIndex(item => item.id === id)).map(item => item.id);
  assert.equal(encounterAfterStep(game), true);
  assert.equal(currentEncounter(game).id, id);
}

test('new runs vary their scenes and timing while keeping every ending opportunity and the gameplay seed', () => {
  const plans = new Set();
  const variants = ENCOUNTERS.map(() => new Set());
  const steps = ENCOUNTERS.map(() => new Set());
  for (let seed = 1; seed <= 96; seed++) {
    const game = createGame('story', seed), plan = game.fieldEvents.plan;
    assert.equal(game.rng, seed);
    assert.deepEqual(plan, createGame('hard', seed).fieldEvents.plan);
    assert.deepEqual(plan, freshFieldEvents(seed).plan);
    assert.deepEqual(plan.map(item => item.id), ENCOUNTERS.map(event => event.id));
    plan.forEach((item, i) => {
      const [min, max] = timings[i % 4];
      assert.ok(Number.isInteger(item.step) && item.step >= min && item.step <= max);
      assert.ok([0, 1, 2].includes(item.variant));
      variants[i].add(item.variant); steps[i].add(item.step);
    });
    plans.add(JSON.stringify(plan));
    assert.deepEqual(encounterSchedule(game).map(event => ({ id: event.id, step: event.step })), plan.map(({ id, step }) => ({ id, step })));
    const before = serialize(game);
    for (const event of ENCOUNTERS) encounterForState(game, event.id);
    encounterSchedule(game);
    assert.equal(serialize(game), before, 'viewing scenes must not reroll the run or consume gameplay randomness');
  }
  assert.ok(plans.size > 80, 'fresh seeds should produce materially different combinations');
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    assert.equal(variants[i].size, 3, `${ENCOUNTERS[i].id} should offer every authored presentation`);
    assert.equal(steps[i].size, 3, `${ENCOUNTERS[i].id} should vary its timing`);
  }
});

test('every presentation keeps all canonical choices, costs, prerequisites and ending flags', () => {
  let illustratedAlternatives = 0;
  for (const event of ENCOUNTERS) {
    const titles = new Set(), illustrations = new Set();
    for (const variant of [0, 1, 2]) {
      const game = field();
      game.fieldEvents.plan.find(item => item.id === event.id).variant = variant;
      const presentation = encounterForState(game, event.id);
      assert.deepEqual(mechanics(presentation), mechanics(event));
      assert.ok(presentation.title && presentation.text && presentation.report && presentation.art);
      titles.add(presentation.title); illustrations.add(presentation.art);
      for (const option of event.choices) {
        const copy = structuredClone(game);
        copy.exposure = 20;
        trigger(copy, event.id);
        if (option.requires) {
          assert.equal(currentEncounter(copy).choices.some(choice => choice.id === option.id), false);
          assert.equal(chooseFieldEncounter(copy, option.id), false);
          copy.fieldEvents.flags.push(option.requires);
        }
        assert.ok(currentEncounter(copy).choices.some(choice => choice.id === option.id));
        assert.equal(chooseFieldEncounter(copy, option.id), true);
        assert.equal(copy.exposure, 20 + option.delta);
        assert.deepEqual(copy.fieldEvents.journal.map(entry => [entry.id, entry.choice]), [[event.id, option.id]]);
        if (option.flag) assert.ok(copy.fieldEvents.flags.includes(option.flag));
        resume(copy);
        assert.equal(chooseFieldEncounter(copy, option.id), false, 'reopening cannot apply the choice twice');
      }
    }
    assert.equal(titles.size, 3, `${event.id} needs three distinct scenes`);
    if (illustrations.size > 1) illustratedAlternatives++;
  }
  assert.ok(illustratedAlternatives >= 6, 'new runs should vary illustrations where the available art matches the scene');
});

test('the selected scene, illustration, result and report survive reloads and progress transfer', async () => {
  for (const variant of [1, 2]) {
    let game = field();
    game.fieldEvents.plan[0].variant = variant;
    trigger(game, 'first-call');
    const scene = currentEncounter(game), markup = encounterMarkup(game);
    assert.ok(markup.includes(escape(scene.title)));
    game = resume(game);
    assert.deepEqual(currentEncounter(game), scene);
    assert.equal(encounterMarkup(game), markup);
    const snapshot = progressSnapshot(game, { collected: [], runs: [] });
    game = (await decodeProgress(await encodeProgress(snapshot))).save;
    assert.deepEqual(currentEncounter(game), scene);
    assert.equal(encounterMarkup(game), markup);
    assert.equal(chooseFieldEncounter(game, 'record'), true);
    const result = scene.choices.find(choice => choice.id === 'record');
    assert.ok(encounterMarkup(game).includes(escape(result.result)));
    const resolvedMarkup = encounterMarkup(game);
    game = resume(game);
    assert.equal(encounterMarkup(game), resolvedMarkup);
    assert.equal(continueFieldEncounter(game), true);
    const notebook = notebookMarkup(game);
    for (const text of [scene.title, scene.report, result.label, result.result]) assert.ok(notebook.includes(escape(text)), text);
    game = resume(game);
    assert.equal(notebookMarkup(game), notebook);
    Object.assign(game, { phase: 'debrief', question: 1 });
    assert.equal(getQuestion(game).options.find(option => option.id === 'field-notes').label, scene.report);
    assert.equal(answer(game, 'field-notes'), true);
    assert.equal(game.reports.at(-1).answer, scene.report);
  }
});

test('alternate scenes fit the decision copy budgets and their illustrations work offline', () => {
  const worker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  assert.ok(worker.includes("'./encounter-flavors.js'"));
  for (const event of ENCOUNTERS) for (const variant of [1, 2]) for (const carryFlags of [false, true]) {
    const game = field();
    game.fieldEvents.plan.find(item => item.id === event.id).variant = variant;
    if (carryFlags) game.fieldEvents.flags = [...new Set(ENCOUNTERS.flatMap(item => item.choices.map(option => option.flag).filter(Boolean)))];
    trigger(game, event.id);
    const scene = currentEncounter(game);
    assert.ok(scene.title.length <= 50, scene.title);
    assert.ok(scene.text.length <= 430, `${event.id}: ${scene.text}`);
    assert.ok(scene.shortReport && scene.shortReport.length <= 85, `${event.id}: ${scene.shortReport}`);
    for (const option of scene.choices) {
      assert.ok((option.shortLabel || option.label).length <= 60, `${event.id}: ${option.label}`);
      assert.ok(option.result.length <= 400, `${event.id}: ${option.result}`);
    }
    const image = `./assets/encounter-${scene.art}.webp`;
    assert.ok(existsSync(new URL(`../docs/${image}`, import.meta.url)), image);
    assert.ok(worker.includes(`'${image}'`), `${image} must be cached offline`);
    const markup = encounterMarkup(game);
    assert.ok(markup.includes(`src="${image}"`));
    assert.doesNotMatch(markup, /undefined|alt=""/);
    assert.equal(chooseFieldEncounter(game, scene.choices[0].id), true);
    assert.equal(continueFieldEncounter(game), true);
    Object.assign(game, { phase: 'debrief', question: 1 });
    assert.equal(decisionQuestion(game).options.find(option => option.id === 'field-notes').label, scene.shortReport);
    assert.equal(getQuestion(game).options.find(option => option.id === 'field-notes').label, scene.report);
  }
});

test('pre-variety saves keep original scenes, timing and notebook history', () => {
  let game = field();
  game.fieldEvents = freshFieldEvents();
  assert.equal(game.fieldEvents.plan, undefined);
  trigger(game, 'first-call');
  assert.equal(game.fieldSteps, 3);
  assert.equal(currentEncounter(game).title, ENCOUNTERS[0].title);
  const pendingMarkup = encounterMarkup(game);
  game = resume(game);
  assert.equal(game.fieldEvents.plan, undefined);
  assert.equal(encounterMarkup(game), pendingMarkup);
  assert.equal(chooseFieldEncounter(game, 'record'), true);
  assert.equal(continueFieldEncounter(game), true);
  const notebook = notebookMarkup(game);
  assert.ok(notebook.includes(escape(ENCOUNTERS[0].choices.find(option => option.id === 'record').result)));
  game = resume(game);
  assert.equal(game.fieldEvents.plan, undefined);
  assert.equal(notebookMarkup(game), notebook);
  assert.deepEqual(encounterSchedule(game).map(event => event.step), ENCOUNTERS.map(event => event.step));
});

test('incomplete, reordered, out-of-range or unknown encounter plans are rejected', () => {
  const mutations = [
    game => { game.fieldEvents.plan = null; },
    game => { game.fieldEvents.plan = {}; },
    game => { game.fieldEvents.plan.pop(); },
    game => { game.fieldEvents.plan.push({ ...game.fieldEvents.plan[0] }); },
    game => { game.fieldEvents.plan[1] = { ...game.fieldEvents.plan[0] }; },
    game => { [game.fieldEvents.plan[0], game.fieldEvents.plan[1]] = [game.fieldEvents.plan[1], game.fieldEvents.plan[0]]; },
    game => { game.fieldEvents.plan[0].id = 'unknown'; },
    game => { game.fieldEvents.plan[0].step = 1; },
    game => { game.fieldEvents.plan[0].step = 5; },
    game => { game.fieldEvents.plan[0].step = 3.5; },
    game => { game.fieldEvents.plan[11].step = 100; },
    game => { game.fieldEvents.plan[0].variant = -1; },
    game => { game.fieldEvents.plan[0].variant = 3; },
    game => { game.fieldEvents.plan[0].variant = '1'; },
    game => { delete game.fieldEvents.plan[0].variant; }
  ];
  for (const mutate of mutations) {
    const game = createGame('story', 42);
    mutate(game);
    assert.equal(restore(serialize(game)), null, mutate.toString());
  }
});

test('fractional walking exposure cannot make a valid encounter result impossible to resume', () => {
  const game = field();
  trigger(game, 'lamp-keeper');
  game.exposure = 30.2;
  assert.equal(chooseFieldEncounter(game, 'hand'), true);
  assert.equal(game.fieldEvents.journal.at(-1).delta, 7);
  resume(game);
  const legacy = structuredClone(game);
  legacy.fieldEvents.journal.at(-1).delta = (30.2 + 7) - 30.2;
  assert.ok(legacy.fieldEvents.journal.at(-1).delta > 7, 'fixture reproduces old floating-point roundoff');
  resume(legacy);
  for (const invalid of [7.01, -4.01]) {
    const bad = structuredClone(game);
    bad.fieldEvents.journal.at(-1).delta = invalid;
    assert.equal(restore(serialize(bad)), null, 'roundoff tolerance must not permit genuinely out-of-range results');
  }
});

const permutations = items => items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map(rest => [item, ...rest])) : [[]];

function walk(game, order, style, picks = {}) {
  for (const id of [...order, 'tower']) {
    const destination = FIELD_SITES.find(site => site.id === id);
    for (const step of planFieldRoute(game, destination, style).steps) {
      assert.equal(move(game, step.x - game.player.x, step.y - game.player.y), true);
      if (game.fieldEvents.pending) {
        const encounter = currentEncounter(game);
        assert.equal(chooseFieldEncounter(game, picks[encounter.id] || encounter.choices[0].id), true);
        assert.equal(continueFieldEncounter(game), true);
      }
    }
    if (id !== 'tower') assert.ok(inspect(game));
  }
}

test('even the latest encounter timings fit every landmark order and both walking styles', () => {
  for (const mode of ['story', 'hard']) for (const style of ['quiet', 'direct']) for (const order of permutations(['pump', 'corner', 'drain'])) {
    for (let night = 0; night < 3; night++) {
      const game = { ...field(), mode, shift: night };
      game.fieldEvents.plan.forEach((item, i) => { item.step = timings[i % 4][1]; });
      walk(game, order, style);
      assert.deepEqual(game.fieldEvents.journal.map(entry => entry.id), ENCOUNTERS.filter(event => event.night === night).map(event => event.id));
      assert.equal(beginDebrief(game), true);
      resume(game);
    }
  }
});

const routes = {
  relief: { picks: { 'lamp-keeper': 'ask', 'your-outline': 'name' }, actions: ['relief-approach', 'relief-orders', 'relief-handoff'] },
  witness_present: { picks: { 'first-call': 'record', 'future-call': 'record', 'last-follower': 'reply' }, actions: ['witness-chair', 'witness-tapes', 'witness-name'] },
  rescue: { picks: { 'first-call': 'record', 'second-call': 'compare', 'lamp-keeper': 'hand' }, actions: ['rescue-radio', 'rescue-carry', 'rescue-leave'] },
  vacancy: { picks: {}, actions: ['vacancy-accept', 'vacancy-sign', 'vacancy-approve'] },
  transmission: { picks: { 'first-call': 'record', 'two-towers': 'other', 'future-call': 'compare' }, actions: ['transmission-tower', 'transmission-listen', 'transmission-broadcast'] },
  witness: { picks: { 'first-call': 'record', 'future-call': 'record' } }
};

function campaign(name, mode, seed) {
  let game = createGame(mode, seed);
  const originalPlan = structuredClone(game.fieldEvents.plan);
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
    walk(game, ['pump', 'corner', 'drain'], 'quiet', routes[name].picks);
    game = resume(game);
    assert.equal(beginDebrief(game), true);
    assert.equal(answer(game, name === 'vacancy' ? 'comply' : 'truth'), true);
    assert.equal(answer(game, name === 'vacancy' ? 'redact' : 'evidence'), true);
    if (night < 2) {
      assert.equal(answer(game, name === 'witness' ? 'question' : 'sign'), true);
      if (game.phase === 'debrief' && game.question === 3) assert.equal(answer(game, 'return'), true);
    }
  }
  assert.deepEqual(game.fieldEvents.plan.map(({ detour, ...entry }) => entry), originalPlan, 'the original timing and flavor draws stay fixed as optional detours are committed');
  assert.deepEqual(game.fieldEvents.journal.map(entry => entry.id), ENCOUNTERS.map(event => event.id));
  assert.equal(game.evidence.length, 9);
  assert.equal(game.breaches, 0);
  assert.ok(game.exposure < 100);
  return game;
}

for (const mode of ['story', 'hard']) for (const [name, route] of Object.entries(routes)) {
  test(`randomized ${mode} campaigns keep ${name} reachable across seeds`, () => {
    for (const seed of seeds) {
      const game = campaign(name, mode, seed);
      if (name === 'witness') {
        assert.equal(canTakeEvidenceOutside(game), true);
        assert.equal(answer(game, 'expose'), true);
      } else {
        assert.equal(availableResolutions(game).find(option => option.id === name).disabled, false);
        assert.equal(answer(game, 'follow-lead'), true);
        assert.equal(chooseResolution(game, name), true);
        for (const action of route.actions) {
          solveResolutionGame(game);
          assert.equal(chooseResolution(game, action), true);
        }
      }
      assert.equal(game.phase, 'ending');
      assert.equal(game.ending, name);
      resume(game);
    }
  });
}
