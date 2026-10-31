import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createGame, startShift, move, inspect, currentSiteScene, canEatCrop, eatCrop,
  FIELD_SITES, chooseFieldEncounter, continueFieldEncounter, beginDebrief,
  answer, restore, serialize
} from '../docs/engine.js';
import { currentEncounter, encounterAfterStep, encounterSchedule } from '../docs/encounters.js';
import { planFieldRoute } from '../docs/field.js';
import { SITE_SCENES, SITE_POOLS, freshSiteStories, siteScene, migrateSiteStories, validSiteStories } from '../docs/site-encounters.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';
import { FIELD_ART, scenePlate } from '../docs/art.js';

const pump = FIELD_SITES.find(site => site.id === 'pump');
const atPump = (seed = 42, shift = 0) => ({ ...createGame('story', seed), phase: 'field', shift, entered: true, departure: 'chosen', player: { x: pump.x, y: pump.y } });
const cookingNight = game => game.siteStories.pump.indexOf('cooking');
function resume(game) {
  const saved = restore(serialize(game));
  assert.ok(saved, `${game.phase}, night ${game.shift + 1}, seed ${game.runId} must resume`);
  assert.deepEqual(saved, game);
  return saved;
}

function walk(game, destination) {
  for (const step of planFieldRoute(game, destination).steps) {
    assert.equal(move(game, step.x - game.player.x, step.y - game.player.y), true);
    if (game.fieldEvents.pending) {
      assert.equal(chooseFieldEncounter(game, currentEncounter(game).choices[0].id), true);
      assert.equal(continueFieldEncounter(game), true);
    }
  }
}

function campaign(seed, mode, consume = false) {
  let game = createGame(mode, seed);
  const plan = structuredClone(game.siteStories), scenes = [];
  for (let night = 0; night < 3; night++) {
    assert.equal(startShift(game), true);
    // These tests focus on landmark opportunities; tower gameplay has separate
    // coverage. All movement, discovery and debrief actions here are real.
    Object.assign(game, { phase: 'field', entered: true, departure: 'chosen' });
    for (const id of ['pump', 'corner', 'drain', 'tower']) {
      const destination = FIELD_SITES.find(site => site.id === id);
      walk(game, destination);
      if (id !== 'tower') assert.ok(inspect(game));
      if (id === 'pump') {
        const scene = currentSiteScene(game);
        assert.ok(scene);
        scenes.push(scene.id);
        assert.equal(scene.id, plan.pump[night]);
        assert.equal(canEatCrop(game), scene.id === 'cooking');
        assert.equal(inspect(game), null, 'revisiting a searched pump cannot trigger a new discovery');
        game = resume(game);
        assert.equal(currentSiteScene(game).id, scene.id);
        if (consume && canEatCrop(game)) {
          assert.equal(eatCrop(game), true);
          return { game: resume(game), scenes, plan };
        }
      } else {
        assert.equal(currentSiteScene(game), null);
        assert.equal(canEatCrop(game), false);
      }
    }
    assert.equal(beginDebrief(game), true);
    assert.equal(answer(game, 'truth'), true);
    assert.equal(answer(game, 'evidence'), true);
    assert.equal(answer(game, 'sign'), true);
    assert.deepEqual(game.siteStories, plan);
  }
  return { game: resume(game), scenes, plan };
}

test('each seeded pump plan contains one meal and two distinct alternatives without changing gameplay randomness', () => {
  assert.ok(SITE_SCENES.cooking);
  assert.equal(SITE_POOLS.pump.nights, 3);
  assert.deepEqual(SITE_POOLS.pump.required, ['cooking']);
  assert.ok(SITE_POOLS.pump.alternatives.length >= 6, 'the pump should draw from at least six non-meal scenes');
  const nights = new Set(), plans = new Set(), selectedAlternatives = new Set();
  for (let seed = 1; seed <= 96; seed++) {
    const game = createGame('story', seed), plan = game.siteStories.pump;
    assert.equal(game.rng, seed);
    assert.deepEqual(game.siteStories, freshSiteStories(seed));
    assert.deepEqual(game.siteStories, createGame('hard', seed).siteStories);
    assert.equal(plan.length, 3);
    assert.equal(new Set(plan).size, 3);
    assert.equal(plan.filter(id => id === 'cooking').length, 1);
    for (const id of plan) assert.ok(SITE_SCENES[id]);
    const alternatives = plan.filter(id => id !== 'cooking');
    assert.equal(alternatives.length, 2);
    assert.equal(new Set(alternatives).size, 2);
    for (const id of alternatives) {
      assert.ok(SITE_POOLS.pump.alternatives.includes(id));
      selectedAlternatives.add(id);
    }
    assert.equal(validSiteStories(game), true);
    nights.add(cookingNight(game)); plans.add(JSON.stringify(plan));
    const before = serialize(game);
    for (const site of FIELD_SITES) siteScene(game, site.id);
    currentSiteScene(game);
    assert.equal(serialize(game), before, 'reading a scene must not reroll or mutate state');
  }
  assert.deepEqual([...nights].sort(), [0, 1, 2]);
  assert.deepEqual([...selectedAlternatives].sort(), [...SITE_POOLS.pump.alternatives].sort(), 'every registered alternative must be reachable in seeded runs');
  assert.ok(plans.size >= 6, 'new runs should vary meal timing and atmospheric scenes');
});

test('extending a site pool automatically selects the new scene while preserving its guarantee and existing saves', () => {
  const saved = createGame('story', 42), originalPlan = structuredClone(saved.siteStories);
  const id = 'test-pump-extension', pool = SITE_POOLS.pump, originalAlternatives = pool.alternatives;
  SITE_SCENES[id] = { ...SITE_SCENES[originalAlternatives[0]], id };
  pool.alternatives = [...originalAlternatives, id];
  try {
    let selected = false;
    for (let seed = 1; seed <= 96; seed++) {
      const game = createGame('story', seed), plan = game.siteStories.pump;
      assert.equal(validSiteStories(game), true);
      assert.equal(plan.length, pool.nights);
      assert.equal(new Set(plan).size, pool.nights);
      for (const required of pool.required) assert.equal(plan.filter(scene => scene === required).length, 1);
      assert.equal(plan.filter(scene => !pool.required.includes(scene)).length, pool.nights - pool.required.length);
      if (plan.includes(id)) {
        selected = true;
        game.shift = plan.indexOf(id);
        assert.equal(siteScene(game, 'pump').id, id);
      }
    }
    assert.equal(selected, true, 'adding a registry entry must make it selectable without editing the selector');
    migrateSiteStories(saved);
    assert.deepEqual(saved.siteStories, originalPlan, 'expanding a pool must not reroll an in-progress run');
    assert.deepEqual(resume(saved).siteStories, originalPlan);
  } finally {
    pool.alternatives = originalAlternatives;
    delete SITE_SCENES[id];
  }
});

test('ignoring the cooking smell does not repeat it on later pump inspections', () => {
  for (const mode of ['story', 'hard']) for (const seed of [1, 2, 3, 7, 42, 847, 12345, 99123]) {
    const { game, scenes, plan } = campaign(seed, mode);
    assert.deepEqual(scenes, plan.pump);
    assert.equal(scenes.filter(id => id === 'cooking').length, 1);
    assert.equal(new Set(scenes).size, 3);
    assert.equal(game.ending, 'dissent');
    assert.equal(game.evidence.length, 9);
    assert.equal(canEatCrop(game), false);
  }
});

test('the consumption ending remains reachable when the meal is scheduled on any of the three nights', () => {
  const seedForNight = new Map();
  for (let seed = 1; seed <= 96 && seedForNight.size < 3; seed++) {
    const night = cookingNight(createGame('story', seed));
    if (!seedForNight.has(night)) seedForNight.set(night, seed);
  }
  assert.equal(seedForNight.size, 3);
  for (const mode of ['story', 'hard']) for (const [night, seed] of seedForNight) {
    const { game, scenes } = campaign(seed, mode, true);
    assert.equal(game.shift, night);
    assert.equal(game.phase, 'ending');
    assert.equal(game.ending, 'consumption');
    assert.equal(scenes.at(-1), 'cooking');
    assert.equal(eatCrop(game), false, 'a finished meal cannot trigger the ending twice');
  }
});

test('only an inspected pump on its assigned night offers food, including after walking away and back', () => {
  let game = atPump();
  game.shift = cookingNight(game);
  assert.equal(currentSiteScene(game), null);
  assert.equal(canEatCrop(game), false);
  assert.equal(eatCrop(game), false);
  assert.ok(inspect(game));
  assert.equal(currentSiteScene(game).id, 'cooking');
  assert.equal(canEatCrop(game), true);
  assert.equal(move(game, 1, 0), true);
  assert.equal(currentSiteScene(game), null);
  assert.equal(eatCrop(game), false);
  game = resume(game);
  assert.equal(move(game, -1, 0), true);
  assert.equal(canEatCrop(game), true);
  const event = encounterSchedule(game).find(event => event.night === game.shift);
  game.fieldSteps = event.step;
  assert.equal(encounterAfterStep(game), true);
  assert.equal(currentSiteScene(game), null);
  assert.equal(eatCrop(game), false, 'a pending field decision must be resolved first');
  assert.equal(chooseFieldEncounter(game, currentEncounter(game).choices[0].id), true);
  assert.equal(continueFieldEncounter(game), true);
  assert.equal(canEatCrop(game), true);
  for (const phase of ['briefing', 'tower', 'debrief', 'ending']) {
    const other = { ...game, phase };
    assert.equal(currentSiteScene(other), null);
    assert.equal(eatCrop(other), false);
  }
  const otherNight = atPump();
  otherNight.shift = (cookingNight(otherNight) + 1) % 3;
  assert.ok(inspect(otherNight));
  assert.notEqual(currentSiteScene(otherNight).id, 'cooking');
  assert.equal(eatCrop(otherNight), false);
});

test('an active meal and its original plan survive progress transfer without a reroll', async () => {
  const game = atPump(847);
  game.shift = cookingNight(game);
  inspect(game);
  const snapshot = progressSnapshot(game, { collected: [], runs: [] });
  const imported = await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(imported, snapshot);
  assert.equal(currentSiteScene(imported.save).id, 'cooking');
  assert.equal(eatCrop(imported.save), true);
  assert.equal(imported.save.ending, 'consumption');
});

function legacy(patch = {}) {
  const game = Object.assign(atPump(), patch);
  delete game.siteStories;
  return game;
}

test('legacy saves retain a current cooking offer even away from the pump, with no later repeat', () => {
  for (const shift of [0, 1, 2]) {
    const original = legacy({ shift, inspected: ['pump'], evidence: ['ledger', 'sample', 'glove'].slice(0, shift + 1), player: { x: 4, y: 3 } });
    const game = restore(serialize(original));
    assert.ok(game);
    assert.equal(cookingNight(game), shift, 'the current field offer takes precedence over earlier evidence');
    assert.equal(canEatCrop(game), false);
    assert.equal(move(game, -1, 0), true);
    assert.equal(canEatCrop(game), true);
    assert.equal(game.siteStories.pump.filter(id => id === 'cooking').length, 1);
    const plan = structuredClone(game.siteStories);
    migrateSiteStories(game);
    assert.deepEqual(game.siteStories, plan, 'migration must run only once');
    resume(game);
  }
});

test('legacy prior inspections consume the old opportunity, including stale inspected markers between shifts', () => {
  for (const [patch, expected] of [
    [{ shift: 1, phase: 'briefing', inspected: ['pump', 'corner', 'drain'], evidence: ['ledger'] }, 0],
    [{ shift: 2, phase: 'tower', inspected: [], evidence: ['ledger', 'sample'] }, 0],
    [{ shift: 2, phase: 'field', inspected: [], evidence: ['sample'] }, 1],
    [{ shift: 2, phase: 'debrief', inspected: ['pump'], evidence: ['ledger', 'sample', 'glove'] }, 0]
  ]) {
    const game = restore(serialize(legacy(patch)));
    assert.ok(game);
    assert.equal(cookingNight(game), expected);
    assert.equal(canEatCrop(game), false);
    resume(game);
  }
});

test('legacy games with no old offer schedule food only on a remaining night, and completed consumption keeps its night', () => {
  for (const shift of [0, 1, 2]) for (const seed of [1, 42, 847, 12345]) {
    const old = legacy({ shift, runId: String(seed), evidence: [], inspected: [] });
    const first = restore(serialize(old)), second = restore(serialize(old));
    assert.ok(first);
    assert.deepEqual(first.siteStories, second.siteStories, 'migration must be deterministic');
    assert.ok(cookingNight(first) >= shift);
    assert.equal(first.siteStories.pump.filter(id => id === 'cooking').length, 1);
    const ended = legacy({ shift, phase: 'ending', ending: 'consumption', inspected: ['pump'], evidence: ['ledger', 'sample', 'glove'].slice(0, shift + 1) });
    const restored = restore(serialize(ended));
    assert.ok(restored);
    assert.equal(cookingNight(restored), shift);
    assert.equal(restored.ending, 'consumption');
    assert.equal(canEatCrop(restored), false);
  }
  const unnamed = legacy({ shift: 2 });
  delete unnamed.runId;
  const a = restore(serialize(unnamed)), b = restore(serialize(unnamed));
  assert.ok(a);
  assert.deepEqual(a.siteStories, b.siteStories, 'old saves without run IDs must have a stable fallback');
});

test('malformed site plans are rejected instead of silently replacing a saved meal', () => {
  const mutations = [
    game => { game.siteStories = null; },
    game => { game.siteStories = []; },
    game => { game.siteStories = {}; },
    game => { game.siteStories.pump = 'cooking'; },
    game => { game.siteStories.pump.pop(); },
    game => { game.siteStories.pump.push('cooking'); },
    game => { game.siteStories.pump[0] = 'unknown-scene'; },
    game => { game.siteStories.pump[1] = game.siteStories.pump[0]; },
    game => { game.siteStories.pump[cookingNight(game)] = SITE_POOLS.pump.alternatives[0]; }
  ];
  for (const mutate of mutations) {
    const game = createGame('story', 42);
    mutate(game);
    assert.equal(validSiteStories(game), false, mutate.toString());
    assert.equal(restore(serialize(game)), null, mutate.toString());
  }
});

test('site-story modules are shipped in the offline cache', () => {
  const worker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  for (const file of ['site-encounters.js', 'story-random.js']) assert.ok(worker.includes(`'./${file}'`), file);
});

test('every registered site scene points to available illustrated art in the offline cache', () => {
  const worker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  for (const [site, pool] of Object.entries(SITE_POOLS)) for (const id of [...pool.required, ...pool.alternatives]) {
    const scene = SITE_SCENES[id];
    assert.equal(scene.id, id);
    assert.equal(scene.site, site);
    assert.ok(Object.hasOwn(FIELD_ART, scene.art), `${id} needs a registered art key`);
    const art = FIELD_ART[scene.art], asset = `./assets/${art.file}.webp`;
    assert.ok(art.alt?.trim(), `${id} needs descriptive alternative text`);
    assert.ok(existsSync(new URL(`../docs/${asset}`, import.meta.url)), `${id}: ${asset}`);
    assert.ok(worker.includes(`'${asset}'`), `${id} art must work offline`);
    assert.ok(scenePlate(scene.art).includes(`src="${asset}"`));
  }
});
