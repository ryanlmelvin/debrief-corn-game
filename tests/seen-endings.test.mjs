import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, answer, advance, ENDINGS, FIELD_SITES, inspect, move, chooseFieldEncounter, continueFieldEncounter, eatCrop, endingId } from '../docs/engine.js';
import { ENCOUNTERS, freshFieldEvents, encounterAfterStep, currentEncounter } from '../docs/encounters.js';
import { startResolution, chooseResolution, getResolution } from '../docs/alternate-endings.js';
import { guideTravel, guideRouteStatus, inspectGuide, focusGuide, fireGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';
import { startRogue, chooseRogue, moveRogue, getRogueScene, validRogue, broadcastCursor, broadcastWindow, floodConnections } from '../docs/rogue.js';
import { createMiniGame } from '../docs/mini-games.js';
import { possibleChoiceEndings, hasSeenChoiceEndings, markSeenEndingChoices } from '../docs/seen-endings.js';
import { REVIEWED_ENDING_HINTS } from '../scripts/check-ending-hints.mjs';
import { resolutionGameAction, resolutionGameActive } from '../docs/resolution-games.js';
import { rescueStatus } from '../docs/rescue.js';
import { transmissionStatus, transmissionHorror, TRANSMISSION_DELAY } from '../docs/transmission.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';

const guideEndings = ['guide', 'guide_arrested', 'guide_interrupted', 'guide_shot'];
const transmissionExposureEndings = ['assimilation', 'corn_contained', 'roadkill', 'corn_escape', 'corn_uprising'];
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

function finishAfterResolutionWithdrawal(game, ending) {
  if (game.phase === 'resolution') assert.equal(chooseResolution(game, 'back'), true);
  assert.equal(game.phase, 'debrief');
  if (ending === 'dissent' || ending === 'witness') {
    assert.equal(answer(game, ending === 'witness' ? 'expose' : 'sign'), true);
  } else if (Object.hasOwn(paths, ending)) {
    enter(ending, game);
    for (const choice of paths[ending]) {
      solveResolutionGame(game);
      assert.equal(chooseResolution(game, choice), true);
    }
  } else if (transmissionExposureEndings.includes(ending)) {
    enter('transmission', game);
    assert.equal(chooseResolution(game, 'transmission-tower'), true);
    assert.equal(chooseResolution(game, 'transmission-listen'), true);
    reachTransmissionExposureLimit(game);
    finishExposedCorn(game, ending);
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
      finishAfterResolutionWithdrawal(actual, ending);
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

function transmissionAtRadio(firstCall = 'record', version = 2) {
  const game = ready('transmission', 'rescue', 'relief', 'vacancy');
  if (firstCall !== 'record') {
    // Preserve support for older saved first-call variants. The normal current
    // route records the first call; its later comparison is already in this
    // historical journal, and every action below still uses the real gate.
    const entry = game.fieldEvents.journal.find(item => item.id === 'first-call');
    const selected = ENCOUNTERS.find(event => event.id === 'first-call').choices.find(option => option.id === firstCall);
    Object.assign(entry, { choice: firstCall, delta: selected.delta });
  }
  enter('transmission', game);
  assert.equal(chooseResolution(game, 'transmission-tower'), true);
  assert.equal(chooseResolution(game, 'transmission-listen'), true);
  // Version 1 fixtures represent saved activities from before the guided first
  // crossing. All movement and results below still use actual player inputs.
  if (version === 1) game.resolution.activity.state.version = 1;
  assert.equal(resolutionGameActive(game), true);
  return game;
}

function waitForTransmission(game, condition) {
  for (let frame = 0; !condition(); frame++) {
    assert.ok(frame < 1000, 'the real transmission clock must reach the requested state');
    advance(game, .05);
  }
}

function waitForSafeTransmissionTurn(game) {
  const t = game.resolution.activity.state;
  waitForTransmission(game, () => transmissionStatus(t).canTurn && !transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present);
}

function reachTransmissionExposureLimit(game, inspect = () => {}) {
  for (let frame = 0; resolutionGameActive(game); frame++) {
    assert.ok(frame < 10000, 'real row collisions must eventually exhaust exposure');
    const status = transmissionStatus(game.resolution.activity.state);
    if (status.canTurn) assert.equal(resolutionGameAction(game, 'turn'), true);
    else if (status.canAdvance && (status.tutorial || !status.arrivalSafe)) assert.equal(resolutionGameAction(game, 'advance'), true);
    inspect(game);
    advance(game, .05);
  }
  assert.equal(game.exposure, 100);
  if (game.practice === 'transmission') {
    assert.equal(game.phase, 'resolution');
    assert.equal(game.ending, null);
    assert.equal(game.rogue, undefined);
    return game;
  }
  assert.equal(game.phase, 'rogue');
  assert.equal(game.rogue.route, 'corn');
  assert.equal(game.rogue.stage, 'intro');
  assert.equal(game.resolution, undefined);
  return game;
}

// Search public actions, then replay them. No coordinates, hits, immunity or
// timing are assigned to manufacture a Corn outcome after the transmission.
const cornReplayPaths = new Map();
function crossCornSafely(game) {
  const { crossing, hits, time } = game.rogue, cacheKey = `${game.mode}:${crossing}:${hits}:${time}`;
  let path = cornReplayPaths.get(cacheKey);
  if (!path) {
    const queue = [{ game, path: [] }], seen = new Set();
    for (let at = 0; at < queue.length && !path; at++) {
      const current = queue[at];
      if (current.path.length > 100) break;
      const advanced = { ...current.game, rogue: { ...current.game.rogue } };
      advance(advanced, .21);
      if (advanced.rogue.hits !== hits) continue;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 0], [0, 1]]) {
        const next = { ...advanced, rogue: { ...advanced.rogue } };
        if ((dx || dy) && !moveRogue(next, dx, dy)) continue;
        if (next.rogue.hits !== hits) continue;
        const candidate = [...current.path, [dx, dy]];
        if (next.rogue.stage === 'choice' || next.rogue.crossing > crossing) { path = candidate; break; }
        const key = `${candidate.length}:${next.rogue.x}:${next.rogue.y}:${next.rogue.refuge}`;
        if (!seen.has(key)) { seen.add(key); queue.push({ game: next, path: candidate }); }
      }
    }
    assert.ok(path, 'the actual Corn simulation must offer a safe crossing');
    cornReplayPaths.set(cacheKey, path);
  }
  for (const [dx, dy] of path) {
    advance(game, .21);
    if (dx || dy) assert.equal(moveRogue(game, dx, dy), true);
  }
  assert.equal(game.rogue.hits, hits);
}

function finishExposedCorn(game, ending) {
  if (ending === 'assimilation') {
    assertTerminalHint(game, 'rogue-choice', 'root', ending);
    assert.equal(chooseRogue(game, 'root'), true);
    return;
  }
  assert.equal(chooseRogue(game, 'begin'), true);
  if (ending !== 'corn_contained') {
    crossCornSafely(game);crossCornSafely(game);
  }
  if (ending === 'corn_escape' || ending === 'corn_uprising') {
    crossCornSafely(game);
    const choice = ending === 'corn_escape' ? 'escape' : 'gate';
    assertTerminalHint(game, 'rogue-choice', choice, ending);
    assert.equal(chooseRogue(game, choice), true);
  } else {
    for (let frame = 0; game.phase !== 'ending'; frame++) {
      assert.ok(frame < 2000, 'waiting in a firing or traffic lane must produce real collisions');
      if (game.rogue.y === 8) moveRogue(game, 0, -1);
      advance(game, .25);
    }
    assert.equal(game.rogue.lastHit, ending === 'roadkill' ? 'car' : 'bullet');
    conservativeFixtures.add(ending);
  }
  assert.equal(game.ending, ending);
}

function transmissionChoices(version = 2) {
  const game = ready('transmission', 'rescue', 'relief', 'vacancy'), choices = [];
  const record = (action, value) => choices.push({ game: structuredClone(game), action, value });
  record('answer', 'follow-lead');
  assert.equal(answer(game, 'follow-lead'), true);
  record('resolution-answer', 'transmission');
  assert.equal(chooseResolution(game, 'transmission'), true);
  record('resolution-answer', 'transmission-tower');
  assert.equal(chooseResolution(game, 'transmission-tower'), true);
  record('resolution-answer', 'transmission-listen');
  assert.equal(chooseResolution(game, 'transmission-listen'), true);
  const t = game.resolution.activity.state;
  if (version === 1) t.version = 1;
  record('resolution-answer', 'back');
  if (version === 2) {
    assert.equal(t.version, 2);
    advance(game, 12);
    assert.equal(transmissionStatus(t).arrivalSafe, true, 'reading the tutorial cannot miss its safe first move');
    assert.equal(resolutionGameAction(game, 'advance'), true);
    record('resolution-answer', 'back');
    waitForTransmission(game, () => t.crossing === 1);
    assert.equal(t.setbacks, 0);
    record('resolution-answer', 'back');
    waitForSafeTransmissionTurn(game);
    assert.equal(resolutionGameAction(game, 'turn'), true);
    waitForTransmission(game, () => transmissionStatus(t).canAdvance);
  }
  waitForTransmission(game, () => transmissionStatus(t).canAdvance && !transmissionStatus(t).arrivalSafe);
  assert.equal(resolutionGameAction(game, 'advance'), true);
  assert.ok(t.pending);
  record('resolution-answer', 'back');
  waitForTransmission(game, () => t.setbacks > 0);
  assert.equal(game.phase, 'resolution', 'a closed row resets the crossing without deciding an ending');
  record('resolution-answer', 'back');
  solveResolutionGame(game);
  assert.equal(game.phase, 'resolution', 'reaching the radio leaves the final warning undecided');
  record('resolution-answer', 'back');
  return choices;
}

test('transmission entry, tutorial, delayed commands and setbacks preserve every demonstrated withdrawal destination', () => {
  const all = Object.keys(ENDINGS);
  const reachable = ['transmission', 'rescue', 'relief', 'vacancy', 'dissent', ...guideEndings, ...transmissionExposureEndings];
  for (const version of [1, 2]) for (const { game, action, value } of transmissionChoices(version)) {
    const before = structuredClone(game);
    assert.deepEqual(possibleChoiceEndings(game, action, value), sorted(all));
    for (const ending of reachable) {
      const actual = structuredClone(game);
      assert.equal(action === 'answer' ? answer(actual, value) : chooseResolution(actual, value), true);
      finishAfterResolutionWithdrawal(actual, ending);
      assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(ending)), false,
        `${action}/${value} must retain its real ${ending} continuation`);
    }
    for (const ending of all) assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(ending)), false);
    assert.equal(hasSeenChoiceEndings(game, action, value, all), true);
    assert.deepEqual(game, before);
  }
});

test('real Transmission exposure reaches every Corn outcome without narrowing entry or live-control hints', () => {
  const all = Object.keys(ENDINGS);
  for (const version of [1, 2]) {
    const game = transmissionAtRadio('record', version);
    let lastCommand;
    reachTransmissionExposureLimit(game, state => {
      if (!lastCommand && state.exposure >= 90 && state.resolution.activity.state.pending) lastCommand = structuredClone(state);
    });
    assert.ok(lastCommand, 'the final exposure increase must come from a real delayed command');
    const before = structuredClone(lastCommand);
    for (const value of ['wait', 'advance', 'turn']) {
      assert.equal(possibleChoiceEndings(lastCommand, 'resolution-game', value), null);
      assert.equal(hasSeenChoiceEndings(lastCommand, 'resolution-game', value, all), false);
    }
    for (const ending of transmissionExposureEndings) {
      const actual = structuredClone(game);
      finishExposedCorn(actual, ending);
      assert.equal(endingId(actual), ending);
      assert.equal(hasSeenChoiceEndings(lastCommand, 'resolution-answer', 'back', historyExcept(ending)), false);
      if (ending !== 'assimilation') assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'begin', historyExcept(ending)), false);
    }
    assert.equal(hasSeenChoiceEndings(lastCommand, 'resolution-answer', 'back', all), true);
    assert.equal(hasSeenChoiceEndings(game, 'rogue-choice', 'begin', all), true);
    assertTerminalHint(game, 'rogue-choice', 'root', 'assimilation');
    assert.equal(possibleChoiceEndings(game, 'resolution-answer', 'transmission-broadcast'), null);
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'transmission-broadcast', all), false);
    assert.deepEqual(lastCommand, before, 'exposure, queued command and testimony stay unchanged during previews');
  }
});

test('a delayed Turn into the horror retains every actual exposure ending and keeps its live hint suppressed', () => {
  const game = transmissionAtRadio(), t = game.resolution.activity.state, all = Object.keys(ENDINGS);
  assert.equal(resolutionGameAction(game, 'advance'), true);
  waitForTransmission(game, () => t.crossing === 1);
  let lastTurn;
  for (let attempts = 0; game.phase === 'resolution'; attempts++) {
    assert.ok(attempts < 10, 'each failed Turn must add exposure');
    waitForTransmission(game, () => transmissionStatus(t).canTurn && transmissionHorror(t, t.crossing, t.time + TRANSMISSION_DELAY).present);
    assert.equal(resolutionGameAction(game, 'turn'), true);
    const priorExposure = game.exposure, before = structuredClone(game);
    assert.equal(possibleChoiceEndings(game, 'resolution-game', 'turn'), null);
    assert.equal(hasSeenChoiceEndings(game, 'resolution-game', 'turn', all), false);
    for (const ending of transmissionExposureEndings) assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'back', historyExcept(ending)), false);
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'back', all), true);
    assert.deepEqual(game, before, 'preview cannot deliver the pending Turn or charge its exposure');
    lastTurn = before;
    waitForTransmission(game, () => game.phase !== 'resolution' || !t.pending);
    assert.equal(game.exposure, Math.min(100, priorExposure + 10));
    assert.equal(t.heading, 0, 'the horror prevents the turn');
  }
  assert.equal(game.phase, 'rogue');
  assert.equal(game.rogue.route, 'corn');
  assert.equal(game.resolution, undefined);
  for (const ending of transmissionExposureEndings) {
    const actual = structuredClone(game);
    finishExposedCorn(actual, ending);
    assert.equal(endingId(actual), ending);
    assert.equal(hasSeenChoiceEndings(lastTurn, 'resolution-game', 'turn', historyExcept(ending)), false);
  }
});

test('practice exposure failure never gains a story-ending hint or a Corn continuation', () => {
  const practice = createMiniGame('transmission', 'story', 42), all = Object.keys(ENDINGS);
  reachTransmissionExposureLimit(practice);
  const before = structuredClone(practice);
  for (const [action, value] of [['resolution-answer', 'back'], ['resolution-answer', 'transmission-broadcast'], ['resolution-game', 'advance'], ['resolution-game', 'wait'], ['resolution-game', 'turn'], ['rogue-choice', 'root'], ['rogue-choice', 'begin']]) {
    assert.equal(possibleChoiceEndings(practice, action, value), null);
    assert.equal(hasSeenChoiceEndings(practice, action, value, all), false);
  }
  assert.deepEqual(practice, before);
});

test('every supported first-call memory reaches the same stable warning through real transmission play', () => {
  const all = Object.keys(ENDINGS);
  for (const version of [1, 2]) for (const firstCall of ['record', 'answer', 'leave']) {
    const game = transmissionAtRadio(firstCall, version);
    const journal = structuredClone(game.fieldEvents.journal);
    const t = game.resolution.activity.state;
    assert.equal(t.firstCall, firstCall);
    assert.equal(getResolution(game).options.find(option => option.id === 'transmission-broadcast').disabled, true);
    assert.equal(chooseResolution(game, 'transmission-broadcast'), false);
    assert.equal(possibleChoiceEndings(game, 'resolution-answer', 'transmission-broadcast'), null);
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'transmission-broadcast', all), false);
    solveResolutionGame(game);
    assert.equal(t.stage, 'complete');
    assert.equal(game.ending, null);
    assert.deepEqual(game.fieldEvents.journal, journal, 'guiding the light cannot rewrite the earlier watch');
    assertTerminalHint(game, 'resolution-answer', 'transmission-broadcast', 'transmission');
    assert.equal(hasSeenChoiceEndings(game, 'resolution-answer', 'back', ['transmission']), false);
    for (const value of ['wait', 'advance', 'turn']) {
      assert.equal(resolutionGameAction(game, value), false);
      assert.equal(hasSeenChoiceEndings(game, 'resolution-game', value, all), false);
    }
  }
});

test('transmission tutorial controls remain unmarked before delivery, while moving, at bends and after later setbacks', () => {
  const game = transmissionAtRadio(), t = game.resolution.activity.state, all = Object.keys(ENDINGS);
  function assertLiveInputs() {
    const before = structuredClone(game);
    for (const value of ['wait', 'advance', 'turn', 'complete', 'unknown']) {
      assert.equal(possibleChoiceEndings(game, 'resolution-game', value), null);
      assert.equal(hasSeenChoiceEndings(game, 'resolution-game', value, all), false);
    }
    assert.equal(possibleChoiceEndings(game, 'resolution-answer', 'transmission-broadcast'), null);
    assert.equal(resolutionGameAction(game, 'complete'), false);
    assert.deepEqual(game, before);
  }
  assertLiveInputs();
  advance(game, 12);
  assert.equal(transmissionStatus(t).arrivalSafe, true);
  assertLiveInputs();
  assert.equal(resolutionGameAction(game, 'advance'), true);
  assert.ok(t.pending);
  assertLiveInputs();
  const queued = structuredClone(game);
  for (const value of ['wait', 'advance', 'turn']) assert.equal(resolutionGameAction(game, value), false);
  assert.deepEqual(game, queued, 'a queued radio call cannot be overwritten by another control');
  waitForTransmission(game, () => t.moving);
  assertLiveInputs();
  waitForTransmission(game, () => transmissionStatus(t).canTurn);
  assert.equal(t.crossing, 1);
  assert.equal(t.setbacks, 0);
  assertLiveInputs();
  waitForSafeTransmissionTurn(game);
  assert.equal(resolutionGameAction(game, 'turn'), true);
  assertLiveInputs();
  waitForTransmission(game, () => transmissionStatus(t).canAdvance && !transmissionStatus(t).arrivalSafe);
  assert.equal(resolutionGameAction(game, 'advance'), true);
  assertLiveInputs();
  waitForTransmission(game, () => t.setbacks > 0);
  assert.equal(t.crossing, 1, 'later timed failure keeps the tutorial crossing cleared');
  assertLiveInputs();
  waitForTransmission(game, () => transmissionStatus(t).arrivalSafe);
  assert.equal(resolutionGameAction(game, 'advance'), true);
  waitForTransmission(game, () => transmissionStatus(t).canTurn);
  assertLiveInputs();
  waitForSafeTransmissionTurn(game);
  assert.equal(resolutionGameAction(game, 'turn'), true);
  assertLiveInputs();
  solveResolutionGame(game);
  assertTerminalHint(game, 'resolution-answer', 'transmission-broadcast', 'transmission');
});

test('transmission previews leave tutorial and legacy pending commands, saved history and randomness untouched', () => {
  for (const version of [1, 2]) {
    const game = transmissionAtRadio('record', version);
    const t = game.resolution.activity.state;
    assert.equal(resolutionGameAction(game, 'advance'), true);
    const history = { collected: Object.keys(ENDINGS), runs: [{ id: 'previous', reports: [] }] };
    const priorHistory = JSON.stringify(history), journal = structuredClone(game.fieldEvents.journal), random = Math.random;
    let randomCalls = 0;
    try {
      Math.random = () => { randomCalls++; return .5; };
      const inspect = () => {
        const save = JSON.stringify(game);
        for (const [action, value] of [['resolution-answer', 'back'], ['resolution-answer', 'transmission-broadcast'], ['resolution-game', 'wait'], ['resolution-game', 'advance'], ['resolution-game', 'turn']]) {
          possibleChoiceEndings(game, action, value);
          hasSeenChoiceEndings(game, action, value, history.collected);
          assert.equal(JSON.stringify(game), save);
          assert.equal(JSON.stringify(history), priorHistory);
        }
      };
      for (let frame = 0; frame < 12; frame++) {
        inspect();advance(game, .6);
      }
      if (version === 2) {
        assert.equal(t.crossing, 1);
        assert.equal(t.setbacks, 0);
        waitForSafeTransmissionTurn(game);
        assert.equal(resolutionGameAction(game, 'turn'), true);
        inspect();
        waitForTransmission(game, () => transmissionStatus(t).canAdvance && !transmissionStatus(t).arrivalSafe);
        assert.equal(resolutionGameAction(game, 'advance'), true);
        for (let frame = 0; frame < 12; frame++) {
          inspect();advance(game, .6);
        }
      }
    } finally {
      Math.random = random;
    }
    assert.ok(t.setbacks > 0, 'the clock exercised both queued delivery and the real closed-row setback');
    assert.equal(randomCalls, 0);
    assert.deepEqual(game.fieldEvents.journal, journal);
  }
});

test('locked transmission leads and practice never acquire collection hints', () => {
  const locked = ready(), all = Object.keys(ENDINGS);
  startResolution(locked);
  const before = structuredClone(locked);
  assert.equal(getResolution(locked).options.find(option => option.id === 'transmission').disabled, true);
  assert.equal(chooseResolution(locked, 'transmission'), false);
  assert.equal(possibleChoiceEndings(locked, 'resolution-answer', 'transmission'), null);
  assert.equal(hasSeenChoiceEndings(locked, 'resolution-answer', 'transmission', all), false);
  assert.equal(resolutionGameAction(locked, 'advance'), false);
  assert.deepEqual(locked, before);
  const practice = createMiniGame('transmission', 'story', 42);
  assert.ok(practice);
  const untouched = structuredClone(practice);
  for (const [action, value] of [['resolution-answer', 'back'], ['resolution-answer', 'transmission-broadcast'], ['resolution-game', 'advance']]) {
    assert.equal(possibleChoiceEndings(practice, action, value), null);
    assert.equal(hasSeenChoiceEndings(practice, action, value, all), false);
  }
  assert.deepEqual(practice, untouched);
  solveResolutionGame(practice);
  assert.equal(hasSeenChoiceEndings(practice, 'resolution-answer', 'transmission-broadcast', all), false);
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

function lanternEncounter(seed = 42) {
  const game = createGame('story', seed);
  Object.assign(game, { phase: 'field', entered: true, departure: 'chosen', player: { x: 4, y: 4 }, fieldSteps: 24 });
  // Reach the real first-night encounter in order; never manufacture the lantern
  // flag or a journal receipt for the prerequisite under test.
  while (encounterAfterStep(game)) {
    if (game.fieldEvents.pending.id === 'unattended-lamp') return game;
    assert.equal(chooseFieldEncounter(game, currentEncounter(game).choices[0].id), true);
    assert.equal(continueFieldEncounter(game), true);
  }
  assert.fail('The first-night lantern encounter must be reachable.');
}

test('acquiring the lantern keeps every open continuation and leaves preview state untouched', () => {
  const all = Object.keys(ENDINGS);
  for (const seed of [42, 101, 202, 303]) {
    const game = lanternEncounter(seed), saved = JSON.stringify(game);
    const history = { collected: all, runs: [{ reports: [{ answer: 'Prior testimony.' }] }] };
    const priorHistory = JSON.stringify(history), random = Math.random;
    let randomCalls = 0;
    try {
      Math.random = () => { randomCalls++; return .5; };
      assert.deepEqual(possibleChoiceEndings(game, 'encounter-choice', 'take'), sorted(all));
      for (const ending of all) {
        assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'take', historyExcept(ending)), false);
      }
      assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', 'take', history.collected), true);
      assert.equal(JSON.stringify(game), saved, 'preview preserves saves, flags, journal, testimony and RNG state');
      assert.equal(JSON.stringify(history), priorHistory);
    } finally {
      Math.random = random;
    }
    assert.equal(randomCalls, 0);
    assert.equal(chooseFieldEncounter(game, 'take'), true);
    assert.ok(game.fieldEvents.flags.includes('lantern'));
    assert.equal(possibleChoiceEndings(game, 'encounter-choice', 'take'), null, 'a resolved encounter cannot offer another acquisition');
    assert.equal(continueFieldEncounter(game), true);
    game.player = { x: 7, y: 5 };
    assert.ok(inspect(game));
    assert.equal(startRogue(game, 'dungeon'), true);
    assert.equal(chooseRogue(game, 'back'), true);
    assert.ok(game.fieldEvents.flags.includes('lantern'), 'withdrawal keeps the acquired lantern');
    assert.equal(startRogue(game, 'dungeon'), true);
  }
});

test('other lantern encounter choices do not unlock the drain or invent entry hints', () => {
  for (const choice of ['pass', 'search', 'wait']) {
    const game = lanternEncounter();
    assert.equal(chooseFieldEncounter(game, choice), true);
    assert.equal(continueFieldEncounter(game), true);
    game.player = { x: 7, y: 5 };
    assert.ok(inspect(game));
    assert.equal(game.fieldEvents.flags.includes('lantern'), false);
    const before = structuredClone(game);
    assert.equal(startRogue(game, 'dungeon'), false);
    assert.equal(possibleChoiceEndings(game, 'rogue-start', 'dungeon'), null);
    assert.equal(hasSeenChoiceEndings(game, 'rogue-start', 'dungeon', Object.keys(ENDINGS)), false);
    assert.equal(possibleChoiceEndings(game, 'dungeon-enter'), null, 'the unsupported UI action remains unmarked');
    assert.deepEqual(game, before);
  }
});

function rogueField(route) {
  const game = route === 'dungeon' ? lanternEncounter() : createGame('story', 42);
  if (route === 'dungeon') {
    assert.equal(chooseFieldEncounter(game, 'take'), true);
    assert.equal(continueFieldEncounter(game), true);
  }
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

function contextualEncounter(id, exposure = 0, seed = 202) {
  const game = createGame('story', seed), encounter = ENCOUNTERS.find(event => event.id === id);
  Object.assign(game, { phase: 'field', entered: true, departure: 'chosen', shift: encounter.night,
    exposure, player: { x: 4, y: 4 }, fieldSteps: encounter.step, fieldEvents: freshFieldEvents() });
  // Earlier encounters are past. The target card is opened by the actual
  // scheduler, then every tested route and outcome uses public game actions.
  game.fieldEvents.seen = ENCOUNTERS.filter(event => event.night < encounter.night ||
    event.night === encounter.night && event.step < encounter.step).map(event => event.id);
  assert.equal(encounterAfterStep(game), true);
  assert.equal(currentEncounter(game).id, id);
  return game;
}

function assertOpenEntryHint(game, action, value) {
  const all = Object.keys(ENDINGS), before = structuredClone(game);
  assert.deepEqual(possibleChoiceEndings(game, action, value), sorted(all));
  for (const ending of all) assert.equal(hasSeenChoiceEndings(game, action, value, historyExcept(ending)), false);
  assert.equal(hasSeenChoiceEndings(game, action, value, all), true);
  assert.deepEqual(game, before, 'contextual entry previews cannot change the live card, journal or testimony');
}

function finishBroadcast(game, ending) {
  assert.equal(chooseRogue(game, 'begin'), true);
  for (let lock = 0; lock < 3; lock++) {
    let frames = 0;
    do {
      advance(game, .01);
      assert.ok(frames++ < 1000);
    } while (game.rogue.time < game.rogue.lockReadyAt || (ending === 'assimilation'
      ? broadcastCursor(game) >= broadcastWindow(game).min - .01 && broadcastCursor(game) <= broadcastWindow(game).max + .01
      : broadcastCursor(game) < broadcastWindow(game).min + .01 || broadcastCursor(game) > broadcastWindow(game).max - .01));
    assert.equal(chooseRogue(game, 'lock'), true);
  }
  if (ending !== 'assimilation') assert.equal(chooseRogue(game, ending === 'radio_ghost' ? 'warn' : 'command'), true);
  assert.equal(endingId(game), ending);
}

test('radio encounter choices retain real signal failures, both messages and withdrawal outcomes', () => {
  for (const id of ['first-call', 'second-call', 'future-call']) {
    const entry = contextualEncounter(id);
    assert.ok(currentEncounter(entry).choices.some(choice => choice.id === 'broadcast'));
    assertOpenEntryHint(entry, 'encounter-choice', 'broadcast');
    for (const ending of ['radio_ghost', 'field_voice', 'assimilation']) {
      const game = structuredClone(entry);
      assert.equal(chooseFieldEncounter(game, 'broadcast'), true);
      assert.equal(game.rogue.route, 'broadcast');
      assertOpenEntryHint(game, 'rogue-choice', 'begin');
      finishBroadcast(game, ending);
      assert.equal(hasSeenChoiceEndings(entry, 'encounter-choice', 'broadcast', historyExcept(ending)), false);
    }
    const withdrew = structuredClone(entry);
    assert.equal(chooseFieldEncounter(withdrew, 'broadcast'), true);
    assertOpenEntryHint(withdrew, 'rogue-choice', 'back');
    assert.equal(chooseRogue(withdrew, 'back'), true);
    assert.equal(withdrew.phase, 'field');
    assert.equal(withdrew.fieldEvents.journal.at(-1).choice, 'broadcast');
    assert.equal(possibleChoiceEndings(withdrew, 'encounter-choice', 'broadcast'), null);
    if (id === 'first-call') {
      assert.equal(move(withdrew, 0, -1), true);
      assert.equal(move(withdrew, -1, 0), true);
      assert.ok(inspect(withdrew));
      assert.equal(eatCrop(withdrew), true);
      assert.equal(endingId(withdrew), 'consumption', 'release of the radio really returns to open field outcomes');
      assert.equal(hasSeenChoiceEndings(entry, 'encounter-choice', 'broadcast', historyExcept('consumption')), false);
    }
  }
});

test('high-exposure encounter surrender retains all five Corn outcomes reached by actual inputs', () => {
  for (const id of ['lamp-keeper', 'root-knot', 'your-outline']) {
    const entry = contextualEncounter(id, 70);
    assertOpenEntryHint(entry, 'encounter-choice', 'surrender');
    const entered = structuredClone(entry);
    assert.equal(chooseFieldEncounter(entered, 'surrender'), true);
    assert.equal(entered.exposure, 100);
    assert.equal(entered.rogue.route, 'corn');
    assert.equal(possibleChoiceEndings(entered, 'rogue-choice', 'back'), null);
    assertTerminalHint(entered, 'rogue-choice', 'root', 'assimilation');
    for (const ending of transmissionExposureEndings) {
      const game = structuredClone(entered);
      finishExposedCorn(game, ending);
      assert.equal(endingId(game), ending);
      assert.equal(hasSeenChoiceEndings(entry, 'encounter-choice', 'surrender', historyExcept(ending)), false);
    }
  }
});

test('unavailable contextual encounter choices fail closed without changing saves or collection history', () => {
  const locked = [
    [contextualEncounter('lamp-keeper', 69.99), 'surrender'],
    [contextualEncounter('root-knot', 69.99), 'surrender'],
    [contextualEncounter('your-outline', 69.99), 'surrender'],
    [contextualEncounter('paired-tracks', 90), 'surrender'],
    [contextualEncounter('root-knot', 90), 'broadcast'],
    [contextualEncounter('first-call'), 'unknown']
  ];
  const detour = contextualEncounter('second-call');
  detour.fieldEvents.director = 1;
  detour.fieldEvents.plan = freshFieldEvents(202).plan;
  detour.fieldEvents.plan.find(event => event.id === 'second-call').detour = 1;
  locked.push([detour, 'broadcast']);
  for (const [game, value] of locked) {
    const before = structuredClone(game);
    assert.equal(possibleChoiceEndings(game, 'encounter-choice', value), null);
    assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', value, Object.keys(ENDINGS)), false);
    assert.equal(chooseFieldEncounter(game, value), false);
    assert.deepEqual(game, before);
  }
  const history = { collected: Object.keys(ENDINGS), runs: [{ reports: [{ answer: 'Earlier statement.' }] }] };
  const priorHistory = structuredClone(history), random = Math.random;
  let randomCalls = 0;
  try {
    Math.random = () => { randomCalls++; return .5; };
    for (const [game, value] of [[contextualEncounter('first-call'), 'broadcast'], [contextualEncounter('root-knot', 70), 'surrender']]) {
      const saved = JSON.stringify(game);
      for (let preview = 0; preview < 3; preview++) {
        assert.equal(hasSeenChoiceEndings(game, 'encounter-choice', value, history.collected), true);
        assert.equal(JSON.stringify(game), saved);
        assert.deepEqual(history, priorHistory);
      }
    }
  } finally {
    Math.random = random;
  }
  assert.equal(randomCalls, 0);
});

test('pump card entry retains real release failures, successful flooding and withdrawal to the location', () => {
  const entry = createGame('story', 202);
  Object.assign(entry, { phase: 'field', entered: true, departure: 'chosen', player: { x: 3, y: 3 } });
  assert.ok(inspect(entry));
  assertOpenEntryHint(entry, 'rogue-start', 'flood');
  for (const ending of ['flood', 'breach', 'consumption']) {
    const game = structuredClone(entry);
    assert.equal(startRogue(game, 'flood'), true);
    assertOpenEntryHint(game, 'rogue-choice', 'back');
    if (ending === 'consumption') {
      assert.equal(chooseRogue(game, 'back'), true);
      assert.equal(eatCrop(game), true);
    } else {
      assert.equal(chooseRogue(game, 'begin'), true);
      if (ending === 'flood') {
        for (const [index, rotation] of [[3, 3], [0, 1], [1, 1], [2, 2], [5, 0]]) {
          while (game.rogue.tiles[index] !== rotation) assert.equal(chooseRogue(game, `tile-${index}`), true);
        }
      }
      assert.equal(floodConnections(game).connected, ending === 'flood');
      for (let release = 0; release < (ending === 'flood' ? 1 : 3); release++) {
        assert.equal(possibleChoiceEndings(game, 'rogue-choice', 'release'), null, 'a live puzzle control remains unmarked');
        assert.equal(chooseRogue(game, 'release'), true);
      }
    }
    assert.equal(endingId(game), ending);
    assert.equal(hasSeenChoiceEndings(entry, 'rogue-start', 'flood', historyExcept(ending)), false);
  }
  for (const change of [game => game.player.x++, game => { game.inspected = []; }, game => { game.fieldEvents.pending = { id: 'first-call' }; }]) {
    const game = structuredClone(entry);
    change(game);
    const before = structuredClone(game);
    assert.equal(possibleChoiceEndings(game, 'rogue-start', 'flood'), null);
    assert.equal(startRogue(game, 'flood'), false);
    assert.deepEqual(game, before);
  }
});

test('the drain requires a lantern, inspection and an idle arrival; locked choices never receive a hint', () => {
  const all = Object.keys(ENDINGS), unlocked = rogueField('dungeon');
  for (const change of [
    game => { game.fieldEvents.flags = game.fieldEvents.flags.filter(flag => flag !== 'lantern'); },
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
  for (const ending of ['dungeon_escape', 'assimilation']) {
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
        assert.equal(chooseRogue(game, game.rogue.route === 'corn' ? 'root' : 'wait'), true);
        assert.equal(validRogue(game), true);
      }
    }
    assert.equal(game.phase, 'ending');
    assert.equal(endingId(game), ending);
    if (ending === 'dungeon_escape') assert.deepEqual([game.rounds, game.reserve], [5, 18], 'the human guard used the carried rifle and reloaded along the way');
    for (const [state, action, value] of [
      [lanternEncounter(), 'encounter-choice', 'take'],
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
    // Give the acquired lantern, location and inspection prerequisites every advantage. The actual
    // recovery phase must still reject dungeon entry; guide actions never return
    // to the field, and the existing recovery fixtures exercise all four endings.
    game.fieldEvents = structuredClone(rogueField('dungeon').fieldEvents);
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

test('archived dungeon loss remains conservatively bounded', () => {
 const game = rogueField('dungeon');
 assert.equal(hasSeenChoiceEndings(game, 'rogue-start', 'dungeon', historyExcept('dungeon_lost')), false);
 conservativeFixtures.add('dungeon_lost');
});

test('dungeon exposure thresholds preserve incoming exposure and previews', () => {
 for (const exposure of [0, 70, 95]) {
  const game = rogueField('dungeon'); game.exposure = exposure;
  assert.equal(startRogue(game, 'dungeon'), true);
  assert.equal(game.exposure, exposure);
  assert.equal(chooseRogue(game, 'begin'), true);
  const before = structuredClone(game);
  assert.equal(possibleChoiceEndings(game, 'rogue-choice', 'wait'), null);
  assert.deepEqual(game, before);
  let hits = 0, previous = exposure;
  for (let turn = 0; game.rogue.route === 'dungeon' && turn < 100; turn++) {
   assert.equal(chooseRogue(game, 'wait'), true);
   if (game.exposure !== previous) {
    hits++; assert.equal(game.exposure, Math.min(100, previous + 10)); previous = game.exposure;
   }
  }
  assert.equal(hits, Math.ceil((100 - exposure) / 10));
  assert.equal(game.exposure, 100);
  assert.equal(game.rogue.route, 'corn');
  assert.equal(validRogue(game), true);
 }
});
