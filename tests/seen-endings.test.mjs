import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, answer, advance, ENDINGS, FIELD_SITES, inspect, chooseFieldEncounter, eatCrop, endingId } from '../docs/engine.js';
import { ENCOUNTERS, freshFieldEvents, encounterAfterStep } from '../docs/encounters.js';
import { startResolution, chooseResolution, getResolution } from '../docs/alternate-endings.js';
import { guideTravel, guideRouteStatus, inspectGuide, focusGuide, fireGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';
import { startRogue, chooseRogue, moveRogue, getRogueScene, validRogue, broadcastCursor, broadcastWindow, floodConnections } from '../docs/rogue.js';
import { createMiniGame } from '../docs/mini-games.js';
import { possibleChoiceEndings, hasSeenChoiceEndings, markSeenEndingChoices } from '../docs/seen-endings.js';
import { REVIEWED_ENDING_HINTS } from '../scripts/check-ending-hints.mjs';
import { resolutionGameAction, resolutionGameActive } from '../docs/resolution-games.js';
import { rescueStatus } from '../docs/rescue.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';

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

function escapeScene(game = ready()) {
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

function interview(outcome, empty = false, from = ready()) {
  const game = escapeScene(from);
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
    solveResolutionGame(game);
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

function rescueChoices() {
  const game = ready('rescue', 'relief', 'witness'), choices = [];
  const record = (action, value) => choices.push({ game: structuredClone(game), action, value });
  record('answer', 'follow-lead');
  assert.equal(answer(game, 'follow-lead'), true);
  record('resolution-answer', 'rescue');
  assert.equal(chooseResolution(game, 'rescue'), true);
  record('resolution-answer', 'rescue-radio');
  assert.equal(chooseResolution(game, 'rescue-radio'), true);
  record('resolution-answer', 'rescue-carry');
  assert.equal(chooseResolution(game, 'rescue-carry'), true);
  assert.equal(resolutionGameActive(game), true);
  record('resolution-answer', 'back');
  solveResolutionGame(game);
  assert.equal(game.phase, 'resolution', 'freeing the boots leaves the final sacrifice undecided');
  record('resolution-answer', 'back');
  return choices;
}

function alignRescue(game) {
  for (let steps = 0; !rescueStatus(game.resolution.activity.state).aligned; steps++) {
    assert.ok(steps < 24, 'the tape alignment must remain reachable');
    assert.equal(resolutionGameAction(game, 'later'), true);
  }
  assert.equal(resolutionGameAction(game, 'align'), true);
}

function finishAfterRescueWithdrawal(game, ending) {
  if (game.phase === 'resolution') assert.equal(chooseResolution(game, 'back'), true);
  assert.equal(game.phase, 'debrief');
  if (ending === 'dissent' || ending === 'witness') {
    assert.equal(answer(game, ending === 'witness' ? 'expose' : 'sign'), true);
  } else if (ending === 'rescue' || ending === 'relief') {
    enter(ending, game);
    for (const choice of paths[ending]) {
      solveResolutionGame(game);
      assert.equal(chooseResolution(game, choice), true);
    }
  } else {
    const outcome = ending === 'guide_shot' ? 'secured' : ending === 'guide_arrested' ? 'arrested' : 'spared';
    interview(outcome, ending === 'guide_arrested', game);
    if (ending === 'guide_interrupted') {
      assert.equal(answerGuideDebrief(game, guideDebrief(game).options.find(option => option.action === 'rifle').id), true);
    } else {
      while (game.phase === 'guide') assert.equal(answerGuideDebrief(game, guideDebrief(game).options[0].id), true);
    }
  }
  assert.equal(game.phase, 'ending');
  assert.equal(endingId(game), ending);
}

test('rescue entry and withdrawals retain every ending demonstrated by real continuation paths', () => {
  const all = Object.keys(ENDINGS);
  const reachable = ['rescue', 'relief', 'witness', 'dissent', ...guideEndings];
  for (const { game, action, value } of rescueChoices()) {
    const before = structuredClone(game);
    // A live rescue is intentionally an open bound, including future registry
    // additions. Proven paths below do not justify pruning that conservative set.
    assert.deepEqual(possibleChoiceEndings(game, action, value), sorted(all));
    for (const ending of reachable) {
      const actual = structuredClone(game);
      assert.equal(action === 'answer' ? answer(actual, value) : chooseResolution(actual, value), true);
      finishAfterRescueWithdrawal(actual, ending);
      assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(ending)), false,
        `${action}/${value} must retain its real ${ending} continuation`);
    }
    for (const ending of all) assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(ending)), false);
    assert.equal(hasSeenChoiceEndings(game, action, value, all), true);
    assert.deepEqual(game, before);
  }
});

test('rescue timing controls stay unmarked and the final sacrifice unlocks only after real play', () => {
  const game = enter('rescue');
  chooseResolution(game, 'rescue-radio');
  chooseResolution(game, 'rescue-carry');
  const all = Object.keys(ENDINGS);
  for (let frame = 0; frame < 3; frame++) {
    const before = structuredClone(game);
    assert.equal(getResolution(game).options.find(option => option.id === 'rescue-leave').disabled, true);
    assert.equal(chooseResolution(game, 'rescue-leave'), false);
    assert.equal(possibleChoiceEndings(game, 'resolution-answer', 'rescue-leave'), null);
    for (const value of ['earlier', 'later', 'align', 'pull', 'release', 'complete', 'unknown']) {
      assert.equal(possibleChoiceEndings(game, 'resolution-game', value), null);
      assert.equal(hasSeenChoiceEndings(game, 'resolution-game', value, all), false);
    }
    assert.equal(resolutionGameAction(game, 'complete'), false, 'a forged shortcut is not a player action');
    assert.deepEqual(game, before);
    advance(game, .1);
  }
  alignRescue(game);
  let frame = 0;
  while (!rescueStatus(game.resolution.activity.state).canPull) {
    advance(game, .05);
    assert.ok(frame++ < 1000);
  }
  assert.equal(resolutionGameAction(game, 'pull'), true);
  advance(game, .1);
  const pulling = structuredClone(game);
  assert.equal(rescueStatus(game.resolution.activity.state).holding, true);
  assert.equal(hasSeenChoiceEndings(game, 'resolution-game', 'release', all), false);
  assert.equal(hasSeenChoiceEndings(game, 'resolution-game', 'pull', all), false);
  assert.deepEqual(game, pulling);
  assert.equal(resolutionGameAction(game, 'release'), true);
  while (rescueStatus(game.resolution.activity.state).safe) {
    advance(game, .05);
    assert.ok(frame++ < 1000);
  }
  assert.equal(hasSeenChoiceEndings(game, 'resolution-game', 'pull', all), false,
    'the same rendered control remains unmarked when the roots tighten');
  solveResolutionGame(game);
  assert.equal(resolutionGameActive(game), false);
  assertTerminalHint(game, 'resolution-answer', 'rescue-leave', 'rescue');
  assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'back', ['rescue']), false);
  for (const value of ['earlier', 'later', 'align', 'pull', 'release']) {
    assert.equal(hasSeenChoiceEndings(game, 'resolution-game', value, all), false);
    assert.equal(resolutionGameAction(game, value), false);
  }
});

test('rescue previews preserve saves, transcripts, history and random state across timing snapshots', () => {
  const game = enter('rescue');
  chooseResolution(game, 'rescue-radio');
  chooseResolution(game, 'rescue-carry');
  alignRescue(game);
  const history = { collected: Object.keys(ENDINGS), runs: [{ id: 'previous', reports: [] }] };
  const priorHistory = JSON.stringify(history), random = Math.random;
  let randomCalls = 0;
  try {
    Math.random = () => { randomCalls++; return .5; };
    for (let frame = 0; frame < 5; frame++) {
      advance(game, .37);
      const save = JSON.stringify(game);
      for (const [action, value] of [['resolution-answer', 'back'], ['resolution-answer', 'rescue-leave'], ['resolution-game', 'pull'], ['resolution-game', 'align']]) {
        possibleChoiceEndings(game, action, value);
        hasSeenChoiceEndings(game, action, value, history.collected);
        assert.equal(JSON.stringify(game), save);
        assert.equal(JSON.stringify(history), priorHistory);
      }
    }
  } finally {
    Math.random = random;
  }
  assert.equal(randomCalls, 0);
});

test('locked rescue leads and practice rescue controls cannot receive collection hints', () => {
  const locked = ready(), all = Object.keys(ENDINGS);
  assert.equal(startResolution(locked), true);
  const before = structuredClone(locked);
  assert.equal(getResolution(locked).options.find(option => option.id === 'rescue').disabled, true);
  assert.equal(possibleChoiceEndings(locked, 'resolution-answer', 'rescue'), null);
  assert.equal(hasSeenChoiceEndings(locked, 'resolution-answer', 'rescue', all), false);
  assert.equal(resolutionGameAction(locked, 'pull'), false);
  assert.deepEqual(locked, before);
  const practice = createMiniGame('rescue', 'story', 42);
  assert.ok(practice);
  assert.equal(resolutionGameActive(practice), true);
  for (const [action, value] of [['resolution-answer', 'back'], ['resolution-answer', 'rescue-leave'], ['resolution-game', 'pull']]) {
    assert.equal(possibleChoiceEndings(practice, action, value), null);
    assert.equal(hasSeenChoiceEndings(practice, action, value, all), false);
  }
  solveResolutionGame(practice);
  assert.equal(hasSeenChoiceEndings(practice, 'resolution-answer', 'rescue-leave', all), false);
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
  assert.equal(overwhelmed.exposure, 100, 'conversation choices may cross the exposure threshold');
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

function rogueField(route) {
  const game = createGame('story', 42);
  Object.assign(game, { phase: 'field', entered: true, departure: 'chosen', exposure: 75, player: { x: 3, y: 3 } });
  game.inspected.push('pump');
  if (route === 'dungeon') {
    game.player = { x: 7, y: 5 };
    assert.ok(inspect(game));
  }
  return game;
}

test('rogue entry and reversible introductions retain every unknown field outcome', () => {
  for (const route of ['corn', 'broadcast', 'flood', 'dungeon']) {
    const game = rogueField(route), before = structuredClone(game), all = sorted(Object.keys(ENDINGS));
    assert.deepEqual(possibleChoiceEndings(game, 'rogue-start', route), all);
    for (const ending of all) {
      assert.equal(hasSeenChoiceEndings(game, 'rogue-start', route, historyExcept(ending)), false);
      if (REVIEWED_ENDING_HINTS[ending]?.coverage === 'conservative') conservativeFixtures.add(ending);
    }
    assert.equal(hasSeenChoiceEndings(game, 'rogue-start', route, all), true);
    assert.deepEqual(game, before);
    assert.equal(startRogue(game, route), true);
    assert.deepEqual(possibleChoiceEndings(game, 'rogue-choice', 'begin'), all);
    for (const ending of all) assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'begin', historyExcept(ending)), false);
    assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'begin', all), true);
    if (route !== 'corn') {
      assert.deepEqual(possibleChoiceEndings(game, 'rogue-choice', 'back'), all);
      for (const ending of all) assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'back', historyExcept(ending)), false);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'back', all), true);
    } else {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', 'back'), null);
      assertTerminalHint(game, 'rogue-choice', 'root', 'assimilation');
    }
  }
});

test('the drain requires inspection and an idle arrival; locked choices never receive a hint', () => {
  const all = Object.keys(ENDINGS), unlocked = rogueField('dungeon');
  for (const change of [
    game => { game.inspected = game.inspected.filter(id => id !== 'drain'); },
    game => { game.player.x--; },
    game => { game.player.y--; },
    game => { game.fieldEvents.pending = { id: 'first-call' }; },
    game => { game.expedition = { active: true }; }
  ]) {
    const game = structuredClone(unlocked);
    change(game);
    const before = structuredClone(game);
    assert.equal(possibleChoiceEndings(game, 'rogue-start', 'dungeon'), null);
    assert.equal(hasSeenChoiceEndings(game, 'rogue-start', 'dungeon', all), false);
    assert.equal(startRogue(game, 'dungeon'), false);
    assert.deepEqual(game, before);
  }
});

test('drain previews and repeated withdrawals preserve saves, transcripts, history and randomness', () => {
  const game = rogueField('dungeon'), original = structuredClone(game);
  const history = { collected: Object.keys(ENDINGS), runs: [{ id: 'prior-run', reports: [] }] };
  const saved = JSON.stringify(game), priorHistory = JSON.stringify(history), random = Math.random;
  let randomCalls = 0;
  try {
    Math.random = () => { randomCalls++; return .5; };
    for (let visit = 0; visit < 8; visit++) {
      assert.equal(hasSeenChoiceEndings(game, 'rogue-start', 'dungeon', history.collected), true);
      assert.equal(JSON.stringify(game), saved);
      assert.equal(startRogue(game, 'dungeon'), true);
      const introduction = JSON.stringify(game);
      for (const choice of ['begin', 'back']) {
        possibleChoiceEndings(game, 'rogue-choice', choice);
        for (const id of ['dungeon_escape', 'dungeon_lost', 'witness']) {
          assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, historyExcept(id)), false);
        }
        assert.equal(JSON.stringify(game), introduction);
      }
      assert.equal(chooseRogue(game, 'back'), true);
      assert.deepEqual(game, original);
      assert.equal(JSON.stringify(history), priorHistory);
    }
  } finally {
    Math.random = random;
  }
  assert.equal(randomCalls, 0, 'neither preview nor reversible dungeon entry consumes ambient randomness');
});

function reachDungeonDebrief(game) {
  // A player input replay through all three floors: movement, rifle shots and a
  // reload, with no edited combat state, keys, health, ammunition or outcome.
  const escape = 'RRRFRDDRRUURRFRRDDDDDDDDRRFRRDDRRDDFFRRRRDDLLRRDDRRRFADDRRFUURRRRRDDDDDDDD';
  const directions = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
  const rifle = { F: 'fire', A: 'reload' };
  for (const input of escape) {
    assert.equal(game.phase, 'rogue');
    assert.equal(game.rogue.stage, 'play');
    const action = rifle[input] ? 'rogue-choice' : 'rogue-move';
    const value = rifle[input] || directions[input].join(',');
    assert.equal(hasSeenChoiceEndings(game, action, value, Object.keys(ENDINGS)), false);
    assert.equal(rifle[input] ? chooseRogue(game, rifle[input]) : moveRogue(game, ...directions[input]), true);
    assert.equal(validRogue(game), true);
  }
  assert.equal(game.phase, 'rogue');
  assert.equal(game.rogue.stage, 'debrief');
  assert.equal(game.ending, null);
  return game;
}

test('the drain conservatively retains both endings reached by actual dungeon turns', () => {
  for (const ending of ['dungeon_escape', 'dungeon_lost']) {
    const field = rogueField('dungeon'), game = structuredClone(field);
    assert.equal(startRogue(game, 'dungeon'), true);
    const introduction = structuredClone(game);
    assert.equal(chooseRogue(game, 'begin'), true);
    if (ending === 'dungeon_escape') {
      reachDungeonDebrief(game);
      for (let question = 0; question < 3; question++) {
        const option = getRogueScene(game).options[0];
        assert.equal(chooseRogue(game, option.id), true);
        assert.equal(validRogue(game), true);
      }
    } else {
      for (let turn = 0; game.phase === 'rogue' && turn < 100; turn++) {
        assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'wait', Object.keys(ENDINGS)), false);
        assert.equal(chooseRogue(game, 'wait'), true);
        assert.equal(validRogue(game), true);
      }
    }
    assert.equal(game.phase, 'ending');
    assert.equal(endingId(game), ending);
    if (ending === 'dungeon_escape') assert.deepEqual([game.rounds, game.reserve], [5, 18], 'the human guard used the carried rifle and reloaded along the way');
    for (const [state, action, value] of [
      [field, 'rogue-start', 'dungeon'],
      [introduction, 'rogue-choice', 'begin'],
      [introduction, 'rogue-choice', 'back']
    ]) {
      assert.ok(possibleChoiceEndings(state, action, value).includes(ending));
      assert.equal(hasSeenChoiceEndings(state, action, value, historyExcept(ending)), false);
      assert.equal(hasSeenChoiceEndings(state, action, value, Object.keys(ENDINGS)), true);
    }
    if (REVIEWED_ENDING_HINTS[ending]?.coverage === 'conservative') conservativeFixtures.add(ending);
  }
});

test('every dungeon debrief answer follows real remaining testimony to the existing escape ending', () => {
  const game = rogueField('dungeon');
  assert.equal(startRogue(game, 'dungeon'), true);
  assert.equal(chooseRogue(game, 'begin'), true);
  reachDungeonDebrief(game);
  const original = structuredClone(game), collected = Object.keys(ENDINGS), originalHistory = [...collected];
  const random = Math.random;
  let randomCalls = 0, completedPaths = 0, reviewedChoices = 0;
  function explore(state, question = 0) {
    assert.ok(question < 3);
    assert.equal(state.rogue.stage, 'debrief');
    const scene = getRogueScene(state);
    assert.equal(scene.options.length, 2);
    for (const option of scene.options) {
      const before = JSON.stringify(state);
      assert.deepEqual(possibleChoiceEndings(state, 'rogue-choice', option.id), ['dungeon_escape']);
      assert.equal(hasSeenChoiceEndings(state, 'rogue-choice', option.id, historyExcept('dungeon_escape')), false);
      assert.equal(hasSeenChoiceEndings(state, 'rogue-choice', option.id, ['dungeon_escape']), true);
      assert.equal(hasSeenChoiceEndings(state, 'rogue-choice', option.id, collected), true);
      assert.equal(JSON.stringify(state), before, 'preview preserves the save, transcript, ammunition and RNG');
      assert.deepEqual(collected, originalHistory);
      reviewedChoices++;
      const next = structuredClone(state);
      assert.equal(chooseRogue(next, option.id), true);
      assert.equal(validRogue(next), true);
      if (next.phase === 'ending') {
        assert.equal(question, 2, 'only the third answer completes the interview');
        assert.equal(endingId(next), 'dungeon_escape');
        assertTerminalHint(state, 'rogue-choice', option.id, 'dungeon_escape');
        completedPaths++;
      } else {
        assert.equal(next.phase, 'rogue');
        assert.equal(next.ending, null);
        explore(next, question + 1);
      }
    }
  }
  try {
    Math.random = () => { randomCalls++; return .5; };
    explore(game);
  } finally {
    Math.random = random;
  }
  assert.equal(completedPaths, 8, 'both answers at each of the three questions are independently explored');
  assert.equal(reviewedChoices, 14);
  assert.equal(randomCalls, 0);
  assert.deepEqual(game, original);
});

test('dungeon debrief rejects withdrawal and retired combat controls without a hint or state change', () => {
  const game = rogueField('dungeon');
  assert.equal(startRogue(game, 'dungeon'), true);
  assert.equal(chooseRogue(game, 'begin'), true);
  reachDungeonDebrief(game);
  const all = Object.keys(ENDINGS), answered = [];
  for (let question = 0; question < 3; question++) {
    const before = structuredClone(game);
    for (const choice of ['back', 'begin', 'fire', 'reload', 'wait', 'burst', 'escape', 'root', 'unknown', ...answered]) {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', choice), null);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, all), false);
      assert.equal(chooseRogue(game, choice), false);
    }
    assert.equal(possibleChoiceEndings(game, 'rogue-start', 'dungeon'), null);
    assert.equal(possibleChoiceEndings(game, 'rogue-move', '1,0'), null);
    assert.equal(moveRogue(game, 1, 0), false);
    advance(game, 60);
    assert.deepEqual(game, before);
    const choice = getRogueScene(game).options[0].id;
    answered.push(choice);
    assert.equal(chooseRogue(game, choice), true);
  }
  assert.equal(endingId(game), 'dungeon_escape');
});

test('practice dungeon interviews suppress every collection hint through the final answer', () => {
  const game = reachDungeonDebrief(createMiniGame('dungeon', 'story', 903));
  const all = Object.keys(ENDINGS);
  for (let question = 0; question < 3; question++) {
    const before = structuredClone(game), scene = getRogueScene(game);
    for (const option of scene.options) {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', option.id), null);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', option.id, all), false);
    }
    assert.deepEqual(game, before);
    assert.equal(chooseRogue(game, scene.options[question % 2].id), true);
    assert.equal(game.practice, 'dungeon');
  }
  assert.equal(endingId(game), 'dungeon_escape');
});

test('rifle supplies never narrow drain entry hints or let previews spend ammunition', () => {
  const all = Object.keys(ENDINGS);
  for (const [rounds, reserve] of [[0, 0], [0, 6], [1, 0], [6, 24]]) {
    const game = rogueField('dungeon');
    Object.assign(game, { rounds, reserve });
    const before = structuredClone(game);
    assert.deepEqual(possibleChoiceEndings(game, 'rogue-start', 'dungeon'), sorted(all));
    assert.deepEqual(game, before);
    assert.equal(startRogue(game, 'dungeon'), true);
    const introduction = structuredClone(game);
    for (const choice of ['begin', 'back']) {
      for (const ending of all) assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, historyExcept(ending)), false);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, all), true);
    }
    assert.deepEqual(game, introduction);
    assert.equal(chooseRogue(game, 'begin'), true);
    const active = structuredClone(game);
    for (const choice of ['fire', 'reload', 'wait', 'burst']) {
      assert.equal(possibleChoiceEndings(game, 'rogue-choice', choice), null);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, all), false);
    }
    assert.deepEqual(game, active, 'previews cannot reload, fire, spend ammunition, move roots or record testimony');
  }
});

test('committed recovery cannot reach the drain, including after interview choices with ammunition', () => {
  const search = ready();
  assert.equal(answer(search, 'guide'), true);
  const scenes = [search, escapeScene(), interview('spared'), interview('secured'), interview('arrested')];
  for (const game of scenes) {
    // Give the location and inspection prerequisites every advantage. The actual
    // recovery phase must still reject dungeon entry; guide actions never return
    // to the field, and the existing recovery fixtures exercise all four endings.
    game.player = { x: 7, y: 5 };
    if (!game.inspected.includes('drain')) game.inspected.push('drain');
    const before = structuredClone(game);
    assert.equal(startRogue(game, 'dungeon'), false);
    assert.equal(possibleChoiceEndings(game, 'rogue-start', 'dungeon'), null);
    assert.deepEqual(game, before);
    if (game.guide.stage === 'debrief') {
      const first = guideDebrief(game).options[0];
      assert.equal(answerGuideDebrief(game, first.id), true);
      assert.equal(startRogue(game, 'dungeon'), false);
      const remaining = possibleChoiceEndings(game, 'guide-answer', guideDebrief(game).options[0].id);
      assert.ok(remaining.every(id => !['dungeon_escape', 'dungeon_lost'].includes(id)));
    }
  }
  assert.deepEqual(sorted(possibleChoiceEndings(ready(), 'answer', 'guide')), guideEndings);
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
  for (const [route, choices] of [['broadcast', ['lock']], ['flood', ['tile-0', 'tile-8', 'release']], ['dungeon', ['wait', 'fire', 'reload', 'burst']]]) {
    const game = rogueField(route);
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
    if (route === 'dungeon') {
      assert.equal(possibleChoiceEndings(game, 'rogue-move', '1,0'), null);
      assert.equal(hasSeenChoiceEndings(game, 'rogue-move', '1,0', all), false);
      assert.equal(chooseRogue(game, 'burst'), false, 'the retired salt ability is unsupported');
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

test('practice finales carry no collection hints and preview preserves their provenance', () => {
  const game = createMiniGame('broadcast', 'story', 902);
  if (game.rogue.stage === 'intro') assert.equal(chooseRogue(game, 'begin'), true);
  for (let lock = 0; lock < 3; lock++) {
    let ticks = 0;
    do {
      advance(game, .01);
      assert.ok(ticks++ < 1000);
    } while (game.rogue.time < game.rogue.lockReadyAt || broadcastCursor(game) < broadcastWindow(game).min + .01 || broadcastCursor(game) > broadcastWindow(game).max - .01);
    assert.equal(chooseRogue(game, 'lock'), true);
  }
  assert.equal(game.rogue.stage, 'choice');
  assert.equal(game.practice, 'broadcast');
  const before = structuredClone(game), collection = Object.keys(ENDINGS), history = [...collection];
  for (const choice of ['warn', 'command']) {
    assert.equal(possibleChoiceEndings(game, 'rogue-choice', choice), null);
    assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', choice, collection), false);
  }
  let removed = 0;
  const previousNote = { remove() { removed++; } };
  const button = { disabled: false, dataset: { action: 'rogue-choice', value: 'warn' }, classList: { contains: () => false }, querySelector: () => previousNote };
  markSeenEndingChoices({ querySelectorAll: () => [button] }, game, collection);
  assert.equal(removed, 1, 'an existing assignment hint must disappear when rendering a practice choice');
  assert.deepEqual(game, before);
  assert.deepEqual(collection, history);
  assert.equal(chooseRogue(game, 'warn'), true);
  assert.equal(endingId(game), 'radio_ghost');
  assert.equal(game.practice, 'broadcast', 'the real ending transition retains practice provenance');
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
