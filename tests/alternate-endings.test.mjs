import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, restore, serialize } from '../docs/engine.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';
import { ENCOUNTERS } from '../docs/encounters.js';
import { witnessRequirements } from '../docs/ending-requirements.js';
import { ALTERNATE_ENDINGS, resolutionRequirements, availableResolutions, canResolve, startResolution, getResolution, chooseResolution, validResolution, resolutionEnding } from '../docs/alternate-endings.js';

const requirements = {
  relief: [['lamp-keeper', 'ask'], ['your-outline', 'name']],
  witness_present: [['first-call', 'record'], ['future-call', 'record'], ['last-follower', 'reply']],
  rescue: [['first-call', 'record'], ['second-call', 'compare'], ['lamp-keeper', 'hand']],
  vacancy: [],
  transmission: [['first-call', 'record'], ['two-towers', 'other'], ['future-call', 'compare']]
};
const paths = {
  relief: ['relief-approach', 'relief-orders', 'relief-handoff'],
  witness_present: ['witness-chair', 'witness-tapes', 'witness-name'],
  rescue: ['rescue-radio', 'rescue-carry', 'rescue-leave'],
  vacancy: ['vacancy-accept', 'vacancy-sign', 'vacancy-approve'],
  transmission: ['transmission-tower', 'transmission-listen', 'transmission-broadcast']
};
function ready(route) {
  const s = createGame('story', 42);
  Object.assign(s, { phase: 'debrief', shift: 2, question: 2 });
  for (const [id, choice] of requirements[route] || []) {
    const selected = ENCOUNTERS.find(event => event.id === id).choices.find(option => option.id === choice);
    s.fieldEvents.seen.push(id);
    s.fieldEvents.journal.push({ id, choice, delta: selected.delta, x: 4, y: 4 });
    if (selected.flag && !s.fieldEvents.flags.includes(selected.flag)) s.fieldEvents.flags.push(selected.flag);
  }
  if (route === 'vacancy') s.reports = [0, 1].flatMap(shift => ['comply', 'redact', 'sign'].map(choice => ({ shift, choice, question: 'Routine?', answer: 'Routine.' })));
  return s;
}
const reload = s => JSON.parse(JSON.stringify(s));
function enter(route, s = ready(route)) {
  assert.equal(startResolution(s), true);
  assert.equal(chooseResolution(s, route), true);
  return s;
}
function finish(route, s = ready(route), path = paths[route]) {
  enter(route, s);
  for (const id of path) { solveResolutionGame(s); assert.equal(chooseResolution(s, id), true); }
  return s;
}

test('five exact public titles, sequential codes, and unique art are attached to the new endings', () => {
  assert.deepEqual(Object.keys(ALTERNATE_ENDINGS), Object.keys(paths));
  assert.deepEqual(Object.values(ALTERNATE_ENDINGS).map(ending => ending.code), ['11', '12', '13', '14', '15']);
  assert.deepEqual(Object.values(ALTERNATE_ENDINGS).map(ending => ending.title), ['I trained my replacement. He’s me.', 'I brought a plus-one.', 'I chose people over paperwork.', 'I became the problem.', 'I took my own advice.']);
  assert.equal(new Set(Object.values(ALTERNATE_ENDINGS).map(ending => ending.art)).size, 5);
  for (const ending of Object.values(ALTERNATE_ENDINGS)) for (const key of ['stamp', 'text', 'last']) assert.ok(ending[key].length > 0);
});

test('only the final debrief opens the lead menu, which can be inspected with every route locked', () => {
  for (const patch of [{ phase: 'field' }, { shift: 0 }, { shift: 1 }, { question: 0 }, { question: 1 }, { question: 3 }]) {
    const s = Object.assign(ready(), patch), before = JSON.stringify(s);
    assert.equal(startResolution(s), false);
    assert.equal(JSON.stringify(s), before);
  }
  const s = ready(), reports = structuredClone(s.reports);
  assert.equal(canResolve(s), false);
  assert.equal(startResolution(s), true);
  assert.equal(validResolution(s), true);
  assert.equal(getResolution(s).options.filter(option => option.disabled).length, 5);
  assert.equal(startResolution(s), false);
  assert.equal(chooseResolution(s, 'relief'), false);
  assert.equal(chooseResolution(s, 'back'), true);
  assert.equal(s.phase, 'debrief');
  assert.equal(s.resolution, undefined);
  assert.deepEqual(s.reports, reports, 'opening and closing the menu is not testimony');
});

test('routes require distinct journal decisions; loose flags and repeated signed reports do not unlock them', () => {
  const empty = ready();
  empty.fieldEvents.flags = ENCOUNTERS.flatMap(event => event.choices.map(option => option.flag).filter(Boolean));
  assert.equal(canResolve(empty), false);
  for (const route of ['relief', 'witness_present', 'rescue', 'transmission']) {
    const s = ready(route);
    assert.equal(availableResolutions(s).find(option => option.id === route).disabled, false);
    for (const required of resolutionRequirements(s, route)) {
      assert.equal(required.met, true);
      assert.ok(required.label);
    }
    for (const [id] of requirements[route].filter(([id]) => route !== 'transmission' || id !== 'first-call')) {
      const missing = structuredClone(s);
      missing.fieldEvents.journal = missing.fieldEvents.journal.filter(entry => entry.id !== id);
      assert.equal(availableResolutions(missing).find(option => option.id === route).disabled, true, `${route} must have ${id}`);
    }
  }
  const promotion = ready('vacancy');
  promotion.reports = Array.from({ length: 6 }, () => ({ ...promotion.reports[2] }));
  assert.equal(availableResolutions(promotion).find(option => option.id === 'vacancy').disabled, true);
  assert.equal(resolutionRequirements(promotion, 'vacancy')[0].current, 1);
  assert.equal(resolutionRequirements(promotion, 'vacancy')[1].current, 1);
});

test('each route requires all three scenes, preserves its exact state on reload, and rejects queued or forged answers', () => {
  for (const [route, path] of Object.entries(paths)) {
    let s = enter(route);
    for (let step = 0; step < path.length; step++) {
      solveResolutionGame(s);
      const current = getResolution(s), before = JSON.stringify(s);
      assert.equal(current.step, step + 1);
      assert.equal(current.total, 3);
      assert.equal(current.art, ALTERNATE_ENDINGS[route].art);
      assert.ok(current.options.some(option => option.id === 'back'));
      assert.equal(JSON.stringify(s), before, 'reading a scene does not change the game');
      for (const bad of ['unknown', route, path[(step + 1) % 3]]) assert.equal(chooseResolution(s, bad), false);
      assert.equal(JSON.stringify(s), before);
      s = reload(s);
      assert.equal(validResolution(s), true);
      assert.deepEqual(getResolution(s), current);
      assert.equal(chooseResolution(s, path[step]), true);
      assert.equal(validResolution(s), true);
      assert.equal(chooseResolution(s, path[step]), false, 'queued click cannot answer the next scene');
    }
    assert.equal(s.phase, 'ending');
    assert.equal(s.ending, route);
    assert.equal(s.resolution.answers.length, 4);
    assert.equal(s.reports.filter(report => report.kind === 'resolution').length, 4);
    assert.deepEqual(s.targets, []);
    assert.equal(s.compulsionNotice, false);
    assert.equal(s.fieldEvents.pending, null);
    assert.equal(s.fieldEvents.journey, null);
    assert.equal(validResolution(reload(s)), true);
    assert.equal(getResolution(s), null);
  }
});

test('every scene can be left before commitment and the conditional promotion can be rejected', () => {
  for (const [route, path] of Object.entries(paths)) for (let step = 0; step < 3; step++) {
    const s = enter(route);
    for (const id of path.slice(0, step)) chooseResolution(s, id);
    assert.equal(chooseResolution(s, 'back'), true);
    assert.equal(s.phase, 'debrief');
    assert.equal(s.question, 2);
    assert.equal(s.ending, null);
    assert.equal(s.resolution, undefined);
    assert.equal(validResolution(s), true);
    assert.equal(startResolution(s), true, 'a withdrawn lead can be reconsidered');
    assert.equal(chooseResolution(s, route), true);
    assert.equal(validResolution(s), true, 'old abandoned scenes cannot invalidate the new transcript tail');
  }
  const s = enter('vacancy');
  chooseResolution(s, 'vacancy-accept');
  assert.match(getResolution(s).context, /he stays until you also approve/);
  chooseResolution(s, 'vacancy-sign');
  assert.match(getResolution(s).options.find(option => option.id === 'vacancy-question').detail, /Tear up his release/);
  assert.equal(chooseResolution(s, 'vacancy-question'), true);
  assert.equal(s.phase, 'debrief');
  assert.equal(s.resolution, undefined);
});

test('completed rescue relinquishes the recordings permanently without erasing the encounter history', () => {
  const s = ready('rescue');
  s.fieldEvents.seen.push('future-call', 'last-follower');
  s.fieldEvents.journal.push({ id: 'future-call', choice: 'record', delta: 4, x: 4, y: 4 }, { id: 'last-follower', choice: 'reply', delta: 6, x: 4, y: 4 });
  s.fieldEvents.flags.push('future-recording', 'invited');
  const original = structuredClone(s.fieldEvents.journal);
  assert.equal(availableResolutions(s).find(option => option.id === 'witness_present').disabled, false);
  finish('rescue', s);
  assert.equal(s.resolution.recordingsRelinquished, true);
  assert.deepEqual(s.fieldEvents.journal, original);
  assert.equal(availableResolutions(s).find(option => option.id === 'witness_present').disabled, true);
  assert.equal(witnessRequirements(s).find(requirement => requirement.id === 'recordings').current, 0);
  assert.equal(validResolution(reload(s)), true);
  assert.equal(chooseResolution(s, 'back'), false);
  assert.match(ALTERNATE_ENDINGS.rescue.text, /ambulance/);
});

test('warning the replacement changes the account and both witness approaches remain valid', () => {
  const s = finish('relief', ready('relief'), ['relief-approach', 'relief-warning', 'relief-handoff']);
  assert.match(resolutionEnding(s).text, /vanished teams/);
  assert.equal(resolutionEnding(s).last, ALTERNATE_ENDINGS.relief.last);
  const witness = finish('witness_present', ready('witness_present'), ['witness-chair', 'witness-live', 'witness-name']);
  assert.equal(validResolution(witness), true);
  assert.equal(witness.ending, 'witness_present');
});

test('the replacement remembers actual contact and an honest handover has its own completed account', () => {
  const questioned = enter('relief');
  assert.match(getResolution(questioned).context, /knew your name/);
  assert.doesNotMatch(getResolution(questioned).context, /gripped yours/);
  const touched = ready('relief');
  touched.fieldEvents.journal.find(entry => entry.id === 'lamp-keeper').choice = 'hand';
  enter('relief', touched);
  assert.match(getResolution(touched).context, /hand that gripped yours/);
  for (const id of ['relief-approach', 'relief-warning', 'relief-handoff-honest']) assert.equal(chooseResolution(touched, id), true);
  assert.equal(validResolution(touched), true);
  assert.match(resolutionEnding(touched).text, /tell it the truth/);
  assert.match(resolutionEnding(touched).text, /gate unlatched/);
  assert.doesNotMatch(resolutionEnding(touched).text, /At the end of the night/);
});

test('reconsidering leads repeatedly preserves ordinary testimony and keeps every save within the report limit', () => {
  const s = ready('vacancy'), testimony = structuredClone(s.reports);
  for (let attempt = 0; attempt < 60; attempt++) {
    enter('vacancy', s);
    for (const id of ['vacancy-accept', 'vacancy-sign', 'back']) {
      assert.equal(chooseResolution(s, id), true);
      assert.ok(s.reports.length <= 197);
      assert.equal(validResolution(reload(s)), true);
    }
  }
  assert.deepEqual(s.reports.filter(report => report.kind !== 'resolution'), testimony);
  const before = structuredClone(s.reports);
  startResolution(s);
  chooseResolution(s, 'back');
  assert.deepEqual(s.reports, before, 'opening and closing the menu does not trim testimony');
  finish('vacancy', s);
  assert.equal(validResolution(reload(s)), true);
  assert.ok(s.reports.length <= 197);
});

test('the time-loop payoff uses the actual first-night response, including the normal recording route', () => {
  for (const [choice, scenePattern, endingPattern] of [['record', /You did not answer that night/, /Only your breathing gets through/], ['answer', /Your first question, on your first night/, /Where am I/], ['leave', /without answering/, /empty path/]]) {
    const s = ready('transmission');
    s.fieldEvents.journal.find(entry => entry.id === 'first-call').choice = choice;
    enter('transmission', s);
    chooseResolution(s, 'transmission-tower');
    chooseResolution(s, 'transmission-listen');
    assert.match(getResolution(s).context, scenePattern);
    chooseResolution(s, 'transmission-broadcast');
    assert.match(resolutionEnding(s).text, endingPattern);
    assert.equal(validResolution(s), true);
  }
});

test('saved choices keep their original prose and remain playable after dialogue is edited', () => {
  let s = enter('relief');
  chooseResolution(s, 'relief-approach');
  s.reports.forEach((report, index) => {
    report.question = `Question shown in an earlier release ${index}.`;
    report.answer = `Answer chosen in an earlier release ${index}.`;
  });
  const earlierTranscript = structuredClone(s.reports);
  assert.equal(validResolution(s), true);
  s = restore(serialize(s));
  assert.ok(s, 'an update must preserve a pending ending');
  assert.deepEqual(s.reports, earlierTranscript);
  for (const id of ['relief-warning', 'relief-handoff-honest']) assert.equal(chooseResolution(s, id), true);
  assert.equal(s.ending, 'relief');
  assert.deepEqual(s.reports.slice(0, earlierTranscript.length), earlierTranscript);
  assert.equal(validResolution(s), true);
  assert.deepEqual(restore(serialize(s)), s, 'completed endings also retain earlier wording');
});

test('restore validation rejects partial, reordered, mismatched, or replayable resolution saves', () => {
  const s = enter('relief');
  chooseResolution(s, 'relief-approach');
  const mutations = [
    copy => { copy.resolution.route = 'unknown'; },
    copy => { copy.resolution.step = 2; },
    copy => { copy.resolution.step = Infinity; },
    copy => { copy.resolution.answers.reverse(); },
    copy => { copy.resolution.answers[1].id = 'relief-handoff'; },
    copy => { copy.resolution.answers[1].extra = true; },
    copy => { copy.resolution.recordingsRelinquished = false; },
    copy => { copy.resolution.extra = true; },
    copy => { copy.reports.at(-1).choice = 'relief-handoff'; },
    copy => { copy.reports.at(-1).answer = 42; },
    copy => { copy.reports.at(-1).question = null; },
    copy => { copy.reports.at(-1).resolutionStep = 2; },
    copy => { copy.phase = 'ending'; copy.ending = 'relief'; },
    copy => { copy.phase = 'debrief'; },
    copy => { copy.shift = 1; },
    copy => { copy.question = 1; },
    copy => { copy.fieldEvents.journal = []; },
    copy => { delete copy.resolution; }
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(s);
    mutate(copy);
    assert.equal(validResolution(copy), false);
    const before = structuredClone(copy);
    assert.equal(chooseResolution(copy, 'relief-orders'), false);
    assert.deepEqual(copy, before);
  }
  for (const route of Object.keys(paths)) {
    const ended = finish(route);
    delete ended.resolution;
    assert.equal(validResolution(ended), false, 'a new ending requires its completed sequence');
  }
  const old = ready();
  assert.equal(validResolution(old), true);
  Object.assign(old, { phase: 'ending', ending: 'compliance' });
  assert.equal(validResolution(old), true, 'original endings and old saves do not need new state');
});
