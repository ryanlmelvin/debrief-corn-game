import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  createGame, inspect, nearbySite, currentSiteScene, FIELD_SITES, EVIDENCE, evidenceForState,
  getQuestion, answer, getEnding, restore, serialize
} from '../docs/engine.js';
import { evidenceAtSite, freshEvidenceScenes, validEvidenceScenes } from '../docs/evidence-scenes.js';
import { rogueOptions } from '../docs/rogue.js';
import { drainEntryMarkup } from '../docs/drain-entry.js';
import { witnessRequirements } from '../docs/ending-requirements.js';
import { availableResolutions } from '../docs/alternate-endings.js';
import { FIELD_ART, evidenceMount, notebookMarkup } from '../docs/art.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';

const ids = Object.keys(EVIDENCE);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const originalPlan = () => Object.fromEntries(ids.map(id => [id, 0]));
const field = (seed = 42) => ({ ...createGame('story', seed), phase: 'field', entered: true, departure: 'chosen' });
function resume(game) {
  const saved = restore(serialize(game));
  assert.ok(saved, 'evidence presentation must remain resumable');
  assert.deepEqual(saved, game);
  return saved;
}

test('seeded evidence scenes vary all nine discoveries without consuming gameplay randomness', () => {
  const versions = Object.fromEntries(ids.map(id => [id, new Set()])), plans = new Set();
  assert.equal(ids.length, 9);
  for (let seed = 1; seed <= 96; seed++) {
    const game = createGame('story', seed), plan = game.evidenceScenes;
    assert.equal(game.rng, seed);
    assert.deepEqual(plan, freshEvidenceScenes(seed));
    assert.deepEqual(plan, createGame('hard', seed).evidenceScenes);
    assert.deepEqual(Object.keys(plan).sort(), [...ids].sort());
    assert.equal(validEvidenceScenes(game), true);
    plans.add(JSON.stringify(plan));
    const before = serialize(game);
    for (const id of ids) {
      assert.ok([0, 1, 2].includes(plan[id]));
      versions[id].add(plan[id]);
      const scene = evidenceForState(game, id);
      assert.ok(scene.title && scene.text);
      assert.equal(scene.code, EVIDENCE[id].code);
      assert.equal(scene.where, EVIDENCE[id].where);
    }
    assert.equal(serialize(game), before, 'viewing a discovery must not reroll its scene');
  }
  assert.ok(plans.size > 80, 'fresh runs should draw different discovery combinations');
  for (const id of ids) assert.deepEqual([...versions[id]].sort(), [0, 1, 2], `${id} must offer every authored version`);
});

test('cosmetic variations retain each exhibit at its original site and night with identical effects', () => {
  const expected = { corner: ['dress', 'badge', 'teeth'], pump: ['ledger', 'sample', 'glove'], drain: ['roots', 'water', 'map'] };
  const originals = structuredClone(EVIDENCE);
  for (const mode of ['story', 'hard']) for (const variant of [0, 1, 2]) {
    for (const site of FIELD_SITES.filter(site => site.id !== 'tower')) for (let shift = 0; shift < 3; shift++) {
      const game = { ...field(), mode, shift, player: { x: site.x, y: site.y } }, id = expected[site.id][shift];
      game.evidenceScenes[id] = variant;
      const plan = structuredClone(game.evidenceScenes), beforeExposure = game.exposure, beforeRng = game.rng;
      assert.equal(inspect(game), id);
      assert.deepEqual(game.evidence, [id]);
      assert.deepEqual(game.inspected, [site.id]);
      assert.equal(game.exposure, beforeExposure);
      assert.equal(game.rng, beforeRng);
      assert.equal(inspect(game), null);
      assert.deepEqual(game.evidenceScenes, plan);
      const needed = witnessRequirements(game).find(requirement => requirement.id === id);
      if (needed) assert.equal(needed.met, true, `${id}'s canonical evidence gate must still be met`);
      resume(game);
    }
  }
  assert.deepEqual(EVIDENCE, originals, 'resolving cosmetic copies must not overwrite the canonical exhibits');
});

test('discovery cards and private notebook entries use the selected wording and plate while retaining the canonical sketch', () => {
  for (const id of ids) {
    const titles = new Set(), stories = new Set();
    for (const variant of [0, 1, 2]) {
      const game = field();
      game.evidenceScenes[id] = variant;
      const scene = evidenceForState(game, id);
      titles.add(scene.title); stories.add(scene.text);
      assert.doesNotMatch(notebookMarkup(game), new RegExp(escape(scene.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      game.evidence = [id];
      const notebook = notebookMarkup(game), mount = evidenceMount(id, game);
      assert.ok(notebook.includes(escape(scene.title)), `${id} title`);
      assert.ok(notebook.includes(escape(scene.text)), `${id} story`);
      assert.ok(notebook.includes(mount), `${id} notebook must show the same illustration as discovery`);
      assert.ok(mount.includes(`Field sketch: ${escape(EVIDENCE[id].title)}`));
      if (scene.art) assert.ok(mount.includes(`./assets/${FIELD_ART[scene.art].file}.webp`));
      else assert.equal(mount, evidenceMount(id));
      const saved = resume(game);
      assert.equal(notebookMarkup(saved), notebook);
      assert.equal(evidenceMount(id, saved), mount);
    }
    assert.equal(titles.size, 3, `${id} should have three distinct discovery titles`);
    assert.equal(stories.size, 3, `${id} should have three distinct discovery scenes`);
  }
});

test('the first card shown by the inspect action uses the saved scene rather than the fixed exhibit description', () => {
  const source = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
  const start = source.indexOf("if(action==='inspect'){"), end = source.indexOf("\n  if(action==='debrief')", start);
  assert.ok(start >= 0 && end > start);
  const locations = { corner: ['dress', 'badge', 'teeth'], pump: ['ledger', 'sample', 'glove'], drain: ['roots', 'water', 'map'] };
  for (const [siteId, discoveries] of Object.entries(locations)) for (const [shift, id] of discoveries.entries()) for (const variant of [1, 2]) for (const lantern of [false, true]) {
    const site = FIELD_SITES.find(site => site.id === siteId);
    const game = { ...field(), shift, player: { x: site.x, y: site.y } };
    game.evidenceScenes[id] = variant;
    if(lantern)game.fieldEvents.flags.push('lantern');
    const scene = evidenceForState(game, id);
    let card;
    const context = {
      action: 'inspect', game, inspect, nearbySite, evidenceAtSite, rogueOptions, drainEntryMarkup, currentSiteScene, EVIDENCE, evidenceForState, evidenceMount, esc: escape,
      paper: (title, body, tag) => ({ title, body, tag }),
      showModal: (kind, content) => { card = { kind, ...content }; }
    };
    vm.runInNewContext(source.slice(start, end), context);
    assert.equal(card.kind, 'evidence');
    assert.equal(card.body.includes('data-action="rogue-start" data-value="flood"'), siteId === 'pump');
    assert.equal(card.body.includes('data-action="dungeon-enter"'), siteId === 'drain');
    if(siteId==='drain') {
      const entry=drainEntryMarkup(game);
      assert.equal(/<button[^>]*\bdisabled\b/.test(entry),!lantern,'missing lantern leaves the visible tunnel choice locked');
      assert.match(entry,/Acquired lantern/);
      assert.ok(entry.includes(lantern?'requirement-met':'requirement-unmet'));
      assert.ok(entry.includes(lantern?'✓':'✗'));
      assert.ok(entry.includes(lantern?'Met:':'Unmet:'));
      assert.equal(entry.includes('Too dark without a lantern.'),!lantern);
      assert.doesNotMatch(entry,/unattended|off the path|find and take/i,'the card names the requirement without giving its location away');
    }
    assert.equal(card.title, escape(scene.title));
    assert.ok(card.body.includes(escape(scene.text)), `${id} must vary on the initial discovery card`);
    assert.ok(card.body.includes(evidenceMount(id, game)), `${id} must use its saved discovery illustration`);
    assert.ok(card.body.includes(escape(EVIDENCE[id].title)), `${id} should still identify the canonical exhibit`);
    assert.deepEqual(game.evidence, [id]);
    const before=serialize(game);card=null;
    vm.runInNewContext(source.slice(start,end),context);
    assert.equal(Boolean(card),siteId==='drain'&&lantern,'only an unlocked tunnel reopens its inspected discovery');
    assert.equal(serialize(game),before,'reopening the card cannot grant evidence, change RNG, or rewrite the journal');
  }
});

test('debrief context matches the discovered scene without changing responses, reports or ending gates', () => {
  for (const [shift, id] of ['dress', 'badge', 'teeth'].entries()) {
    const base = { ...createGame('story', 42), phase: 'debrief', shift, question: 1, entered: true, evidence: ids };
    base.evidenceScenes = originalPlan();
    const canonical = getQuestion(base);
    for (const variant of [1, 2]) {
      const game = structuredClone(base);
      game.evidenceScenes[id] = variant;
      const question = getQuestion(game);
      assert.equal(question.context, `From your notebook: ${evidenceForState(game, id).text}`);
      assert.deepEqual(question.options, canonical.options);
      assert.equal(question.prompt, canonical.prompt);
      assert.deepEqual(witnessRequirements(game), witnessRequirements(base));
      assert.deepEqual(availableResolutions(game), availableResolutions(base));
      assert.equal(answer(game, 'evidence'), true);
      const old = structuredClone(base);
      assert.equal(answer(old, 'evidence'), true);
      assert.deepEqual(game.reports, old.reports);
      assert.equal(game.honesty, old.honesty);
      assert.equal(game.trust, old.trust);
    }
  }
});

test('saved and transferred discoveries keep their wording and illustrations', async () => {
  const game = field(847);
  game.evidence = ids;
  const scenes = Object.fromEntries(ids.map(id => [id, evidenceForState(game, id)]));
  const snapshot = progressSnapshot(game, { collected: [], runs: [] });
  const imported = await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(imported, snapshot);
  for (const id of ids) assert.deepEqual(evidenceForState(imported.save, id), scenes[id]);
  for (let page = 0; page < ids.length; page++) assert.equal(notebookMarkup(imported.save, page), notebookMarkup(game, page));
});

test('old saves keep original evidence descriptions instead of acquiring new discoveries during an update', () => {
  const game = field();
  game.evidence = ['ledger', 'sample', 'map'];
  delete game.evidenceScenes;
  for (const id of ids) {
    const scene = evidenceForState(game, id);
    assert.equal(scene.title, EVIDENCE[id].title);
    assert.equal(scene.text, EVIDENCE[id].text);
  }
  const beforeNotebook = notebookMarkup(game);
  const saved = restore(serialize(game));
  assert.ok(saved);
  assert.deepEqual(saved.evidenceScenes, originalPlan());
  assert.deepEqual(saved.evidence, game.evidence);
  assert.equal(notebookMarkup(saved), beforeNotebook);
  resume(saved);
});

test('incomplete or malformed discovery plans are rejected instead of rerolling an existing notebook', () => {
  for (const mutate of [
    game => { game.evidenceScenes = null; },
    game => { game.evidenceScenes = []; },
    game => { game.evidenceScenes = {}; },
    game => { delete game.evidenceScenes.sample; },
    game => { game.evidenceScenes.unknown = 0; },
    game => { game.evidenceScenes.sample = -1; },
    game => { game.evidenceScenes.sample = 3; },
    game => { game.evidenceScenes.sample = 1.5; },
    game => { game.evidenceScenes.sample = '1'; },
    game => { game.evidenceScenes.sample = true; }
  ]) {
    const game = createGame('story', 42);
    mutate(game);
    assert.equal(validEvidenceScenes(game), false, mutate.toString());
    assert.equal(restore(serialize(game)), null, mutate.toString());
  }
});

test('the downloaded private transcript contains the same discoveries as the notebook', async () => {
  const game = { ...createGame('story', 42), phase: 'ending', ending: 'dissent', evidence: ids };
  for (const id of ids) game.evidenceScenes[id] = 2;
  const source = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function exportRecord()'), end = source.indexOf('async function initAudio()', start);
  assert.ok(start >= 0 && end > start);
  let download, clicked = false;
  const anchor = { click() { clicked = true; } };
  vm.runInNewContext(`${source.slice(start, end)}\nexportRecord();`, {
    game, EVIDENCE, evidenceForState, getEnding, Blob,
    document: { createElement: () => anchor },
    URL: { createObjectURL(blob) { download = blob; return 'blob:private-transcript'; }, revokeObjectURL() {} },
    setTimeout() {}
  });
  assert.equal(clicked, true);
  assert.equal(anchor.download, 'debrief-private-transcript.txt');
  const text = await download.text();
  for (const id of ids) {
    const scene = evidenceForState(game, id);
    assert.ok(text.includes(`${scene.title}\n${scene.text}`), `${id} transcript must retain its actual scene`);
  }
});

test('all alternate discovery illustrations and their modules are available offline', () => {
  const worker = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  for (const file of ['evidence-scenes.js', 'evidence-flavors.js']) assert.ok(worker.includes(`'./${file}'`), file);
  for (const id of ids) for (const variant of [1, 2]) {
    const game = createGame('story', 42);
    game.evidenceScenes[id] = variant;
    const scene = evidenceForState(game, id), art = FIELD_ART[scene.art];
    assert.ok(art, `${id} needs a registered discovery illustration`);
    assert.ok(art.alt?.trim());
    const asset = `./assets/${art.file}.webp`;
    assert.ok(existsSync(new URL(`../docs/${asset}`, import.meta.url)), asset);
    assert.ok(worker.includes(`'${asset}'`), `${asset} must work offline`);
  }
});
