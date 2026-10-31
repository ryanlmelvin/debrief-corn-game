import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, answer, advance, ENDINGS, FIELD_SITES, inspect, chooseFieldEncounter, eatCrop, endingId } from '../docs/engine.js';
import { ENCOUNTERS, freshFieldEvents, encounterAfterStep } from '../docs/encounters.js';
import { startResolution, chooseResolution, getResolution } from '../docs/alternate-endings.js';
import { guideTravel, guideRouteStatus, inspectGuide, focusGuide, fireGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';
import { startRogue, chooseRogue, validRogue, broadcastCursor, broadcastWindow, floodConnections } from '../docs/rogue.js';
import { possibleChoiceEndings, hasSeenChoiceEndings } from '../docs/seen-endings.js';
import { REVIEWED_ENDING_HINTS } from '../scripts/check-ending-hints.mjs';

const guideEndings = ['guide', 'guide_arrested', 'guide_interrupted', 'guide_shot'];
const requirements = {
  relief: [['lamp-keeper', 'ask'], ['your-outline', 'name']],
  witness_present: [['first-call', 'record'], ['future-call', 'record'], ['last-follower', 'reply']],
  rescue: [['first-call', 'record'], ['second-call', 'compare'], ['lamp-keeper', 'hand']],
  transmission: [['first-call', 'record'], ['two-towers', 'other'], ['future-call', 'compare']],
  witness: [['first-call', 'record'], ['future-call', 'record']],
  vacancy: []
};
const paths = {
  relief: ['relief-approach', 'relief-orders', 'relief-handoff'],
  witness_present: ['witness-chair', 'witness-tapes', 'witness-name'],
  rescue: ['rescue-radio', 'rescue-carry', 'rescue-leave'],
  vacancy: ['vacancy-accept', 'vacancy-sign', 'vacancy-approve'],
  transmission: ['transmission-tower', 'transmission-listen', 'transmission-broadcast']
};
const sorted = values => [...values].sort();
const historyExcept = id => Object.keys(ENDINGS).filter(candidate => candidate !== id);
const terminalFixtures = new Set(), conservativeFixtures = new Set();

// Independently run the actual player action before testing its hint. An audit
// entry alone cannot count as coverage: every direct/recovery ending needs a
// fixture that really reaches it, a positive marker, and an unseen-ending veto.
function assertTerminalHint(game, action, value, expectedEnding) {
  const transition = new Map([
    ['answer', answer], ['resolution-answer', chooseResolution],
    ['guide-answer', answerGuideDebrief], ['eat-crop', eatCrop],
    ['encounter-choice', chooseFieldEncounter], ['rogue-choice', chooseRogue]
  ]).get(action);
  assert.ok(transition, `No independent transition fixture for ${action}`);
  const before = structuredClone(game), completed = structuredClone(game);
  assert.equal(transition(completed, value), true);
  assert.equal(completed.phase, 'ending');
  assert.equal(endingId(completed), expectedEnding, 'the real game must award the expected collection identity');
  assert.deepEqual(possibleChoiceEndings(game, action, value), [expectedEnding]);
  assert.equal(hasSeenChoiceEndings(game, action, value, [expectedEnding]), true);
  assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(expectedEnding)), false);
  assert.deepEqual(game, before, 'preview must preserve the live game');
  terminalFixtures.add(expectedEnding);
}

after(() => {
  const terminalIds = Object.entries(REVIEWED_ENDING_HINTS).filter(([, entry]) => ['direct', 'recovery'].includes(entry.coverage)).map(([id]) => id);
  const conservativeIds = Object.entries(REVIEWED_ENDING_HINTS).filter(([, entry]) => entry.coverage === 'conservative').map(([id]) => id);
  assert.deepEqual(sorted(terminalFixtures), sorted(terminalIds), 'Every audited direct/recovery ending needs an assertTerminalHint fixture that executes a real final action; audit metadata alone is insufficient.');
  assert.deepEqual(sorted(conservativeFixtures), sorted(conservativeIds), 'Every conservatively bounded ending needs an all-other-endings-seen regression that prevents a misleading marker.');
});

function ready(...routes) {
  const game = createGame('story', 42);
  Object.assign(game, { phase: 'debrief', shift: 2, question: 0 });
  for (const route of routes) {
    for (const [id, choice] of requirements[route] || []) {
      if (game.fieldEvents.journal.some(entry => entry.id === id)) continue;
      const selected = ENCOUNTERS.find(event => event.id === id).choices.find(option => option.id === choice);
      game.fieldEvents.seen.push(id);
      game.fieldEvents.journal.push({ id, choice, delta: selected.delta, x: 4, y: 4 });
      if (selected.flag) game.fieldEvents.flags.push(selected.flag);
    }
    if (route === 'vacancy') game.reports.push(...[0, 1].flatMap(shift => ['comply', 'redact', 'sign'].map(choice => ({ shift, choice, question: 'Routine?', answer: 'Routine.', redacted: true }))));
    if (route === 'witness') {
      game.evidence.push('ledger', 'sample', 'map');
      game.reports.push(...[0, 1].map(shift => ({ shift, choice: 'question', question: 'Sign?', answer: 'No.', redacted: false })));
    }
  }
  assert.equal(answer(game, 'truth'), true);
  assert.equal(answer(game, 'evidence'), true);
  return game;
}

function enter(route, game = ready(route)) {
  assert.equal(startResolution(game), true);
  assert.equal(chooseResolution(game, route), true);
  return game;
}

function escapeScene() {
  const game = ready();
  assert.equal(answer(game, 'guide'), true);
  for (const id of ['boot', 'radio', 'corner']) {
    assert.equal(guideTravel(game), true);
    for (let frame = 0; frame < 300 && !guideRouteStatus(game).ready; frame++) advance(game, .1);
    assert.equal(guideRouteStatus(game).ready, true);
    assert.equal(inspectGuide(game).id, id);
  }
  advance(game, .7);
  return game;
}

function interview(outcome, empty = false) {
  const game = escapeScene();
  if (outcome === 'spared') assert.equal(spareGuide(game), true);
  else if (outcome === 'secured') {
    if (empty) for (let i = 0; i < 3; i++) assert.equal(fireGuide(game, 0, 0), 'miss');
    for (let i = 0; i < 3; i++) {
      const aim = focusGuide(game);
      assert.equal(fireGuide(game, aim.x, aim.y), 'person');
    }
  } else {
    for (let i = 0; i < (empty ? 6 : 1); i++) assert.equal(fireGuide(game, 0, 0), 'miss');
    for (let tick = 0; tick < 90 && game.guide.stage === 'escape'; tick++) advance(game, 1);
  }
  assert.equal(game.guide.outcome, outcome);
  assert.equal(game.guide.stage, 'debrief');
  return game;
}

test('terminal signatures follow current honesty, and outside evidence requires the actual gate', () => {
  for (const [honesty, ending] of [[-5, 'compliance'], [1, 'compliance'], [2, 'dissent'], [6, 'dissent']]) {
    const game = ready();
    game.honesty = honesty;
    assertTerminalHint(game, 'answer', 'sign', ending);
  }
  assertTerminalHint(ready('witness'), 'answer', 'expose', 'witness');
  assert.equal(possibleChoiceEndings(ready(), 'answer', 'expose'), null);
  assert.equal(hasSeenChoiceEndings(ready(), 'answer', 'expose', Object.keys(ENDINGS)), false);
});

test('a seen lead is never marked while withdrawal still allows an unseen ending', () => {
  const game = ready('relief', 'witness', 'witness_present');
  assert.equal(startResolution(game), true);
  const possibilities = possibleChoiceEndings(game, 'resolution-answer', 'relief');
  assert.ok(possibilities.includes('relief'));
  assert.ok(possibilities.includes('witness'));
  assert.ok(possibilities.includes('witness_present'));
  assert.ok(possibilities.includes('dissent'));
  for (const id of guideEndings) assert.ok(possibilities.includes(id));
  assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'relief', ['relief']), false);
  for (const id of possibilities) {
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'relief', historyExcept(id)), false, `unseen ${id} must prevent the marker`);
  }
  assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'relief', possibilities), true);
});

test('the final interview explores remaining testimony before evaluating the signature', () => {
  const game = createGame('story', 42);
  Object.assign(game, { phase: 'debrief', shift: 2, question: 0, honesty: 0 });
  assert.deepEqual(sorted(possibleChoiceEndings(game, 'answer', 'truth')), sorted([...guideEndings, 'dissent', 'compliance']));
  assert.deepEqual(sorted(possibleChoiceEndings(game, 'answer', 'comply')), sorted([...guideEndings, 'compliance']));
  assert.equal(hasSeenChoiceEndings(game, 'answer', 'truth', historyExcept('compliance')), false);
  assert.equal(hasSeenChoiceEndings(game, 'answer', 'truth', historyExcept('dissent')), false);
  assert.equal(answer(game, 'truth'), true);
  assert.deepEqual(sorted(possibleChoiceEndings(game, 'answer', 'evidence')), sorted([...guideEndings, 'dissent']));
  assert.deepEqual(sorted(possibleChoiceEndings(game, 'answer', 'redact')), sorted([...guideEndings, 'compliance']));
});

test('repeated withdrawals and transcript trimming cannot hide an available ending', () => {
  const game = ready('relief', 'witness', 'witness_present');
  const original = possibleChoiceEndings(game, 'answer', 'follow-lead');
  for (let visit = 0; visit < 75; visit++) {
    enter('relief', game);
    assert.equal(chooseResolution(game, 'relief-approach'), true);
    assert.equal(chooseResolution(game, 'back'), true);
  }
  assert.ok(game.reports.length > 180);
  const before = structuredClone(game);
  assert.deepEqual(possibleChoiceEndings(game, 'answer', 'follow-lead'), original);
  assert.equal(hasSeenChoiceEndings(game, 'answer', 'follow-lead', historyExcept('witness')), false);
  assert.deepEqual(game, before);
  enter('relief', game);
  assert.deepEqual(possibleChoiceEndings(game, 'resolution-answer', 'relief-approach'), original);
});

test('each route remains reversible until its final commitment, including the promotion refusal', () => {
  for (const [route, path] of Object.entries(paths)) {
    const game = enter(route);
    for (const id of path.slice(0, -1)) {
      const possibilities = possibleChoiceEndings(game, 'resolution-answer', id);
      assert.ok(possibilities.includes(route));
      for (const guide of guideEndings) assert.ok(possibilities.includes(guide));
      assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', id, [route]), false);
      assert.equal(chooseResolution(game, id), true);
    }
    assertTerminalHint(game, 'resolution-answer', path.at(-1), route);
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'back', [route]), false);
    if (route === 'vacancy') {
      const possibilities = possibleChoiceEndings(game, 'resolution-answer', 'vacancy-question');
      for (const guide of guideEndings) assert.ok(possibilities.includes(guide));
      assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'vacancy-question', ['vacancy']), false);
    }
  }
  const honest = enter('relief');
  chooseResolution(honest, 'relief-approach');
  chooseResolution(honest, 'relief-warning');
  assertTerminalHint(honest, 'resolution-answer', 'relief-handoff-honest', 'relief');
});

test('committing to the recovery team includes all four separately collected outcomes', () => {
  const game = ready();
  assert.deepEqual(sorted(possibleChoiceEndings(game, 'answer', 'guide')), guideEndings);
  for (const ending of guideEndings) assert.equal(hasSeenChoiceEndings(game, 'answer', 'guide', historyExcept(ending)), false);
  assert.equal(hasSeenChoiceEndings(game, 'answer', 'guide', guideEndings), true);
  const escape = escapeScene();
  assert.deepEqual(sorted(possibleChoiceEndings(escape, 'guide-spare')), ['guide', 'guide_interrupted']);
  assert.equal(hasSeenChoiceEndings(escape, 'guide-spare', undefined, ['guide']), false);
  assert.equal(hasSeenChoiceEndings(escape, 'guide-spare', undefined, ['guide', 'guide_interrupted']), true);
});

test('recovery interview answers retain the interruption possibility only while it is reachable', () => {
  for (const [outcome, ending] of [['spared', 'guide'], ['secured', 'guide_shot'], ['arrested', 'guide_arrested']]) {
    for (const empty of outcome === 'spared' ? [false] : [false, true]) {
      const game = interview(outcome, empty);
      const first = guideDebrief(game).options[0];
      assert.deepEqual(sorted(possibleChoiceEndings(game, 'guide-answer', first.id)), sorted(empty ? [ending] : [ending, 'guide_interrupted']));
      assert.equal(hasSeenChoiceEndings(game, 'guide-answer', first.id, [ending]), empty);
      if (!empty) {
        const rifle = guideDebrief(game).options.find(option => option.action === 'rifle');
        assertTerminalHint(game, 'guide-answer', rifle.id, 'guide_interrupted');
      }
      assert.equal(answerGuideDebrief(game, first.id), true);
      const last = guideDebrief(game).options[0];
      assertTerminalHint(game, 'guide-answer', last.id, ending);
    }
  }
});

test('field previews recognize immediate endings without treating ordinary exploration as a closed path', () => {
  const meal = createGame('story', 42), pump = FIELD_SITES.find(site => site.id === 'pump');
  Object.assign(meal, { phase: 'field', shift: meal.siteStories.pump.indexOf('cooking'), player: { x: pump.x, y: pump.y } });
  assert.ok(inspect(meal));
  assertTerminalHint(meal, 'eat-crop', undefined, 'consumption');
  const game = createGame('story', 42);
  Object.assign(game, { phase: 'field', entered: true, departure: 'chosen', fieldEvents: freshFieldEvents(), player: { x: 4, y: 4 }, fieldSteps: 3, exposure: 96 });
  assert.equal(encounterAfterStep(game), true);
  assert.equal(game.fieldEvents.pending.id, 'first-call');
  assert.deepEqual(possibleChoiceEndings(game, 'encounter-choice', 'record'), sorted(Object.keys(ENDINGS)));
  assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'record', ['assimilation']), false, '100 exposure now opens a playable corn route');
  for (const ending of ['corn_escape', 'corn_uprising', 'corn_contained', 'roadkill']) {
    assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'record', historyExcept(ending)), false);
  }
  const overwhelmed = structuredClone(game);
  assert.equal(chooseFieldEncounter(overwhelmed, 'record'), true);
  assert.equal(overwhelmed.phase, 'rogue');
  assert.equal(overwhelmed.rogue.route, 'corn');
  assert.equal(overwhelmed.rogue.stage, 'intro');
  assertTerminalHint(overwhelmed, 'rogue-choice', 'root', 'assimilation');
  assert.equal(hasSeenChoiceEndings(overwhelmed, 'rogue-choice', 'begin', ['assimilation']), false);
  game.exposure = 20;
  assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'record', ['assimilation']), false);
  assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'record', historyExcept('witness')), false);
  const next = structuredClone(game);
  assert.equal(chooseFieldEncounter(next, 'record'), true);
  assert.equal(hasSeenChoiceEndings(next, 'encounter-choice', 'record', Object.keys(ENDINGS)), false, 'a repeated, no-longer-available choice is never marked');
});

function rogueField() {
  const game = createGame('story', 42);
  Object.assign(game, { phase: 'field', entered: true, departure: 'chosen', exposure: 75, player: { x: 3, y: 3 } });
  game.inspected.push('pump');
  return game;
}

test('rogue entry and reversible introductions retain every unknown field outcome', () => {
  for (const route of ['corn', 'broadcast', 'flood']) {
    const game = rogueField(), before = structuredClone(game), all = sorted(Object.keys(ENDINGS));
    assert.deepEqual(possibleChoiceEndings(game, 'rogue-start', route), all);
    for (const ending of all) {
      assert.equal(hasSeenChoiceEndings(game, 'rogue-start', route, historyExcept(ending)), false);
      if (REVIEWED_ENDING_HINTS[ending]?.coverage === 'conservative') conservativeFixtures.add(ending);
    }
    assert.deepEqual(game, before);
    assert.equal(startRogue(game, route), true);
    assert.deepEqual(possibleChoiceEndings(game, 'rogue-choice', 'begin'), all);
    if (route !== 'corn') {
      assert.deepEqual(possibleChoiceEndings(game, 'rogue-choice', 'back'), all);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'back', historyExcept('witness')), false);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'back', historyExcept('corn_escape')), false);
    } else {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', 'back'), null);
      assertTerminalHint(game, 'rogue-choice', 'root', 'assimilation');
    }
  }
});

test('stable corn and broadcast finales identify their own ending without hiding an unseen alternative', () => {
  const corn = rogueField();
  assert.equal(startRogue(corn, 'corn'), true);
  assert.equal(chooseRogue(corn, 'begin'), true);
  // A valid saved finale after all three crossings; minigame collision paths are
  // tested separately. The preview below still applies the actual final action.
  Object.assign(corn.rogue, { stage: 'choice', x: 5, y: 0, crossing: 2, refuge: 4 });
  assert.equal(validRogue(corn), true);
  const broadcast = rogueField();
  assert.equal(startRogue(broadcast, 'broadcast'), true);
  assert.equal(chooseRogue(broadcast, 'begin'), true);
  for (let lock = 0; lock < 3; lock++) {
    let ticks = 0;
    do {
      advance(broadcast, .01);
      assert.ok(ticks++ < 1000);
    } while (broadcast.rogue.time < broadcast.rogue.lockReadyAt || broadcastCursor(broadcast) < broadcastWindow(broadcast).min + .01 || broadcastCursor(broadcast) > broadcastWindow(broadcast).max - .01);
    assert.equal(chooseRogue(broadcast, 'lock'), true);
  }
  assert.equal(validRogue(broadcast), true);
  for (const [game, choices] of [[corn, [['escape', 'corn_escape'], ['gate', 'corn_uprising']]], [broadcast, [['warn', 'radio_ghost'], ['command', 'field_voice']]]]) {
    const before = structuredClone(game);
    for (const [choice, ending] of choices) {
      assertTerminalHint(game, 'rogue-choice', choice, ending);
    }
    assert.deepEqual(game, before);
  }
});

test('live rogue controls stay unmarked even when every ending has been collected', () => {
  const all = Object.keys(ENDINGS);
  for (const [route, choices] of [['broadcast', ['lock']], ['flood', ['tile-0', 'tile-8', 'release']]]) {
    const game = rogueField();
    assert.equal(startRogue(game, route), true);
    assert.equal(chooseRogue(game, 'begin'), true);
    if (route === 'flood') {
      for (const [index, rotation] of [[3, 3], [0, 1], [1, 1], [2, 2], [5, 0]]) {
        while (game.rogue.tiles[index] !== rotation) assert.equal(chooseRogue(game, `tile-${index}`), true);
      }
      assert.equal(floodConnections(game).connected, true, 'even a currently winning live release is excluded from hints');
    }
    const before = structuredClone(game);
    for (const choice of choices) {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', choice), null);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, all), false);
    }
    assert.deepEqual(game, before);
  }
  const lowExposure = rogueField();
  lowExposure.exposure = 20;
  assert.equal(possibleChoiceEndings(lowExposure, 'rogue-start', 'corn'), null);
  assert.equal(hasSeenChoiceEndings(lowExposure, 'rogue-start', 'corn', all), false);
});

test('invalid, unsupported, disabled and damaged choices fail closed', () => {
  const all = Object.keys(ENDINGS), game = ready();
  for (const [action, value] of [['answer', 'unknown'], ['resolution-answer', 'relief'], ['guide-answer', 'spared-0-people'], ['eat-crop'], ['encounter-choice', 'record'], ['guide-spare'], ['new-action', 'sign']]) {
    assert.equal(possibleChoiceEndings(game, action, value), null);
    assert.equal(hasSeenChoiceEndings(game, action, value, all), false);
  }
  for (const damaged of [null, undefined, {}, { phase: 'debrief' }, { ...game, reports: null }]) {
    assert.equal(hasSeenChoiceEndings(damaged, 'answer', 'sign', all), false);
  }
  assert.equal(startResolution(game), true);
  assert.ok(getResolution(game).options.find(option => option.id === 'relief').disabled);
  assert.equal(possibleChoiceEndings(game, 'resolution-answer', 'relief'), null);
});

test('collection membership uses identities, and analysis preserves the game and history exactly', () => {
  const game = ready('relief', 'witness'), before = structuredClone(game);
  const collection = ['dissent', 'dissent', 'unrecognized-ending'], copy = structuredClone(collection);
  assert.equal(hasSeenChoiceEndings(game, 'answer', 'sign', collection), true);
  for (const history of [[], ['compliance'], ['dissent '.trimEnd() + ' '], Array(20).fill('compliance'), null, undefined, {}, 'dissent']) {
    assert.equal(hasSeenChoiceEndings(game, 'answer', 'sign', history), false);
  }
  possibleChoiceEndings(game, 'answer', 'follow-lead');
  hasSeenChoiceEndings(game, 'answer', 'follow-lead', Object.keys(ENDINGS));
  assert.deepEqual(game, before);
  assert.deepEqual(collection, copy);
});

test('a future ending cannot be silently dropped from conservative nonterminal bounds', () => {
  ENDINGS.future_ending = { code: '99', title: 'Future ending' };
  try {
    const game = ready(), previous = historyExcept('future_ending');
    assert.ok(possibleChoiceEndings(game, 'answer', 'guide').includes('future_ending'));
    assert.equal(hasSeenChoiceEndings(game, 'answer', 'guide', previous), false);
    assert.equal(hasSeenChoiceEndings(game, 'answer', 'follow-lead', previous), false);
    assert.equal(hasSeenChoiceEndings(game, 'answer', 'sign', ['dissent']), true, 'an actual terminal result still has one known identity');
  } finally {
    delete ENDINGS.future_ending;
  }
});
