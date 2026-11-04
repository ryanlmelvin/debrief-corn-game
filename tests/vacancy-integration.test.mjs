import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, serialize, restore, answer, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { startResolution, chooseResolution, getResolution } from '../docs/alternate-endings.js';
import { createMiniGame, miniGameComplete, miniGameResult, getMiniGameUnlocks } from '../docs/mini-games.js';
import { createVacancy, vacancyStartingDeck, vacancyStatus } from '../docs/vacancy.js';
import { resolutionGameAction } from '../docs/resolution-games.js';
import { solveResolutionGame, failVacancyGame } from './helpers/resolution-play.mjs';
import { ENCOUNTERS } from '../docs/encounters.js';

function ready() {
  const sample = createMiniGame('vacancy', 'story', 409);
  const s = createGame('story', 91);
  Object.assign(s, { phase: 'debrief', shift: 2, question: 2,
    evidence: [...sample.evidence], evidenceScenes: { ...sample.evidenceScenes },
    reports: sample.reports.filter(report => !report.kind).map(report => ({ ...report })) });
  assert.equal(startResolution(s), true);
  for (const id of ['vacancy', 'vacancy-accept', 'vacancy-sign']) assert.equal(chooseResolution(s, id), true);
  return s;
}

test('the real handover uses the run, gates its signature, and persists every earned stage', () => {
  const s = ready();
  assert.deepEqual(s.resolution.activity.state.cards, vacancyStartingDeck(s));
  assert.equal(getResolution(s).options.find(option => option.id === 'vacancy-approve').disabled, true);
  assert.equal(chooseResolution(s, 'vacancy-approve'), false);
  assert.deepEqual(restore(serialize(s)), s);
  assert.ok(getMiniGameUnlocks(s).includes('vacancy'));
  solveResolutionGame(s);
  assert.deepEqual(restore(serialize(s)), s);
  assert.equal(chooseResolution(s, 'vacancy-approve'), true);
  assert.equal(s.ending, 'vacancy');
  assert.deepEqual(restore(serialize(s)), s);
});

test('practice copies the current evidence and exact answers without changing the source run', () => {
  const source = ready(), before = serialize(source);
  const practice = createMiniGame('vacancy', 'hard', 510, source);
  assert.equal(practice.practiceDeckSource, 'current');
  assert.deepEqual(practice.resolution.activity.state.cards, vacancyStartingDeck(source));
  assert.notEqual(practice.evidence, source.evidence);
  assert.notEqual(practice.reports[0], source.reports[0]);
  assert.deepEqual(restore(serialize(practice)), practice);
  solveResolutionGame(practice);
  assert.equal(miniGameComplete(practice), true);
  assert.equal(miniGameResult(practice).success, true);
  assert.deepEqual(getMiniGameUnlocks(practice), []);
  assert.equal(chooseResolution(practice, 'vacancy-approve'), false);
  assert.equal(practice.ending, null);
  assert.equal(serialize(source), before);
});

function sourceWithTapes() {
  const source = ready();
  assert.equal(chooseResolution(source, 'back'), true);
  for (const [id, choice] of [['first-call', 'record'], ['second-call', 'compare'], ['lamp-keeper', 'hand'], ['future-call', 'record']]) {
    const event = ENCOUNTERS.find(candidate => candidate.id === id);
    Object.assign(source, { phase: 'field', shift: event.night });
    source.fieldEvents.seen.push(id);
    source.fieldEvents.pending = { id, choice: null, ...source.player };
    assert.equal(chooseFieldEncounter(source, choice), true);
    assert.equal(continueFieldEncounter(source), true);
  }
  Object.assign(source, { phase: 'debrief', shift: 2, question: 2 });
  assert.deepEqual(restore(serialize(source)), source);
  return source;
}

test('current-run practice and retries retain both field tapes and exact scene variants without sharing source state', () => {
  const source = sourceWithTapes(), before = serialize(source);
  const expected = vacancyStartingDeck(source);
  assert.equal(expected.filter(card => ['first-call', 'future-call'].includes(card.move)).length, 2);
  const first = createMiniGame('vacancy', 'story', 511, source);
  assert.deepEqual(first.resolution.activity.state.cards, expected);
  assert.notEqual(first.fieldEvents, source.fieldEvents);
  assert.notEqual(first.fieldEvents.journal[0], source.fieldEvents.journal[0]);
  assert.deepEqual(restore(serialize(first)), first);
  solveResolutionGame(first);
  const retry = createMiniGame('vacancy', 'story', 512, first);
  assert.equal(retry.practiceDeckSource, 'current');
  assert.deepEqual(retry.resolution.activity.state.cards, expected, 'procedure cards are earned anew in each practice');
  assert.deepEqual(restore(serialize(retry)), retry);
  assert.equal(serialize(source), before);
});

test('practice from a completed rescue keeps relinquished recordings out and still restores', () => {
  const source = sourceWithTapes();
  assert.equal(startResolution(source), true);
  for (const id of ['rescue', 'rescue-radio', 'rescue-carry']) assert.equal(chooseResolution(source, id), true);
  solveResolutionGame(source);
  assert.equal(chooseResolution(source, 'rescue-leave'), true);
  assert.equal(source.resolution.recordingsRelinquished, true);
  const before = serialize(source), expected = vacancyStartingDeck(source);
  const practice = createMiniGame('vacancy', 'story', 513, source);
  assert.equal(practice.practiceDeckSource, 'current');
  assert.deepEqual(practice.resolution.activity.state.cards, expected);
  assert.equal(practice.resolution.activity.state.cards.some(card => ['first-call', 'future-call'].includes(card.move)), false);
  assert.deepEqual(restore(serialize(practice)), practice);
  solveResolutionGame(practice);
  assert.equal(serialize(source), before);
});

test('a rejected practice interview saves as a failure and cannot award ending 14', () => {
  const practice = createMiniGame('vacancy', 'story', 62);
  let previous = vacancyStatus(practice.resolution.activity.state), carriedScrutiny = false;
  const play = id => {
    const action = `play:${id}`;
    assert.equal(resolutionGameAction(practice, action), true);
    const current = vacancyStatus(practice.resolution.activity.state);
    if (current.round !== previous.round) {
      const played = previous.hand.find(card => `play:${card.id}` === action);
      assert.equal(current.scrutiny, previous.scrutiny + played.scrutinyChange, 'closing a file does not clear scrutiny');
      carriedScrutiny ||= current.scrutiny > 0;
    }
    assert.deepEqual(restore(serialize(practice)), practice);
    previous = current;
  };
  const opening = previous.hand;
  const support = opening.find(card => ['comply', 'redact'].includes(card.move));
  for (const id of [support.id, ...opening.filter(card => card.move === 'sign').map(card => card.id)]) play(id);
  play(previous.hand.find(card => card.move === 'sign').id);
  assert.equal(previous.stage, 'failed');
  assert.equal(carriedScrutiny, true, 'the real failure path carries an objection into another file');
  assert.ok(previous.scrutiny >= previous.scrutinyLimit);
  assert.equal(miniGameComplete(practice), true);
  assert.equal(miniGameResult(practice).success, false);
  assert.deepEqual(restore(serialize(practice)), practice);
  assert.equal(practice.ending, null);
});

test('old pending handovers migrate into the duel while completed endings remain completed', () => {
  const pending = ready();
  pending.resolution.version = 2;
  delete pending.resolution.activity;
  delete pending.reports.at(-1).resolutionGame;
  const resumed = restore(serialize(pending));
  assert.ok(resumed);
  assert.equal(resumed.resolution.version, 3);
  assert.equal(resumed.resolution.activity.kind, 'vacancy');
  assert.equal(resumed.resolution.activity.state.stage, 'play');
  solveResolutionGame(resumed);
  assert.equal(chooseResolution(resumed, 'vacancy-approve'), true);
  resumed.resolution.version = 2;
  delete resumed.resolution.activity;
  const completed = restore(serialize(resumed));
  assert.ok(completed);
  assert.equal(completed.phase, 'ending');
  assert.equal(completed.ending, 'vacancy');
  assert.equal(completed.resolution.activity, undefined);
});

test('restore rejects an unearned card-game completion or a changed source record', () => {
  const forged = ready();
  forged.resolution.activity.state.stage = 'complete';
  assert.equal(restore(serialize(forged)), null);
  const changed = ready();
  changed.reports[0].answer = 'A different answer than the one that made this card.';
  assert.equal(restore(serialize(changed)), null);
});

function minimalEligibleSource(support = 'comply') {
  const source = createGame('story', 47);
  for (let shift = 0; shift < 3; shift++) {
    Object.assign(source, { phase: 'debrief', shift, question: 0 });
    for (const choice of shift < 2 ? ['comply', 'redact', 'sign'] : ['truth', 'evidence']) assert.equal(answer(source, choice), true);
  }
  // Historical gate-valid saves can contain fewer reports than a fresh campaign.
  // Keep only actual signed reports and two actual routine replies: no exhibits.
  source.reports = source.reports.filter(report => report.shift < 2 && [support, 'sign'].includes(report.choice));
  return source;
}

function playGuaranteedHandover(game) {
  const play = action => {
    const before = vacancyStatus(game.resolution.activity.state);
    assert.equal(resolutionGameAction(game, action), true);
    const after = vacancyStatus(game.resolution.activity.state);
    if (after.stage === 'play' && after.round === before.round) {
      assert.deepEqual(after.hand.map(card => card.id), before.hand.filter(card => `play:${card.id}` !== action).map(card => card.id), 'a file uses one hand without replacement draws');
    }
    const resumed = restore(serialize(game));
    assert.deepEqual(resumed, game, 'every card decision persists across reloads');
    game = resumed;
  };
  for (let round = 0; round < 3; round++) {
    const opening = vacancyStatus(game.resolution.activity.state);
    const signatures = opening.hand.filter(card => card.kind === 'testimony' && card.move === 'sign').slice(0, 2);
    const support = opening.hand.find(card => card.kind === 'testimony' && ['comply', 'redact'].includes(card.move));
    assert.ok(support, 'the deal includes a real routine or reclassification reply');
    const plan = round === 0
      ? [...signatures.map(card => card.id), support.id]
      : round === 1 ? ['procedure-scope', signatures[0].id, support.id, signatures[1].id]
        : ['procedure-scope', signatures[0].id, support.id, 'procedure-precedent', signatures[1].id];
    for (const id of plan) assert.ok(opening.hand.some(card => card.id === id), 'the complete winning argument is in this file’s single hand');
    for (const id of plan) play(`play:${id}`);
    assert.equal(game.resolution.activity.state.stage, round < 2 ? 'play' : 'complete');
    assert.equal(game.resolution.activity.state.round, Math.min(round + 1, 2));
    assert.deepEqual(game.resolution.activity.state.awards, ['procedure-scope', 'procedure-precedent'].slice(0, round + 1));
  }
  return game;
}

test('each single hand has a guaranteed whole-game winning sequence for actual and sparse sources', () => {
  const sources = [ready(), sourceWithTapes(), minimalEligibleSource(), minimalEligibleSource('redact')];
  for (const source of sources) {
    const original = serialize(source);
    let story = structuredClone(source);
    if (story.phase !== 'resolution') {
      assert.equal(startResolution(story), true);
      for (const id of ['vacancy', 'vacancy-accept', 'vacancy-sign']) assert.equal(chooseResolution(story, id), true);
    }
    const actualCards = vacancyStartingDeck(story);
    story = playGuaranteedHandover(story);
    assert.deepEqual(story.resolution.activity.state.cards, actualCards, 'the guarantee never invents source cards');
    assert.equal(chooseResolution(story, 'vacancy-approve'), true);
    assert.equal(story.ending, 'vacancy');
    const practice = playGuaranteedHandover(createMiniGame('vacancy', 'story', 902, source));
    assert.equal(miniGameComplete(practice), true);
    assert.equal(miniGameResult(practice).success, true);
    assert.equal(practice.ending, null);
    assert.deepEqual(getMiniGameUnlocks(practice), []);
    assert.equal(serialize(source), original);
  }
});

test('the same real hand can lose by raising scrutiny too soon or calming too early, but win with interleaved plays', () => {
  const game = minimalEligibleSource();
  assert.equal(startResolution(game), true);
  for (const id of ['vacancy', 'vacancy-accept', 'vacancy-sign']) assert.equal(chooseResolution(game, id), true);
  const firstHand = vacancyStatus(game.resolution.activity.state).hand;
  const firstSupport = firstHand.find(card => card.move === 'comply');
  const firstSignatures = firstHand.filter(card => card.move === 'sign');
  for (const id of [firstSupport.id, ...firstSignatures.map(card => card.id)]) assert.equal(resolutionGameAction(game, `play:${id}`), true);
  const opening = vacancyStatus(game.resolution.activity.state);
  assert.equal(opening.round, 2);
  assert.equal(opening.scrutiny, 6, 'using relief before any claims wastes it and carries both signatures into the next file');
  const snapshot = serialize(game), failed = restore(snapshot), recovered = restore(snapshot);
  assert.deepEqual(failed, game);
  assert.deepEqual(recovered, game);
  const signature = opening.hand.find(card => card.move === 'sign');
  assert.equal(resolutionGameAction(failed, `play:${signature.id}`), true);
  assert.equal(failed.resolution.activity.state.stage, 'failed');
  assert.equal(chooseResolution(failed, 'vacancy-approve'), false);
  assert.deepEqual(getResolution(failed).options.map(option => option.id), ['back']);
  assert.deepEqual(restore(serialize(failed)), failed);
  for (const round of [2, 3]) {
    const hand = vacancyStatus(recovered.resolution.activity.state).hand;
    const support = hand.find(card => ['comply', 'redact'].includes(card.move));
    const signatures = hand.filter(card => card.move === 'sign');
    if (round === 3) {
      const poorlyOrdered = restore(serialize(recovered));
      for (const id of ['procedure-scope', support.id, 'procedure-precedent', ...signatures.map(card => card.id)]) {
        assert.equal(resolutionGameAction(poorlyOrdered, `play:${id}`), true);
      }
      assert.equal(poorlyOrdered.resolution.activity.state.stage, 'failed', 'spending both calming cards first cannot carry three subsequent claims');
      assert.ok(poorlyOrdered.resolution.activity.state.progress >= vacancyStatus(poorlyOrdered.resolution.activity.state).goal, 'meeting approval cannot override the scrutiny cap');
      assert.deepEqual(restore(serialize(poorlyOrdered)), poorlyOrdered);
      assert.equal(chooseResolution(poorlyOrdered, 'vacancy-approve'), false);
    }
    const plan = ['procedure-scope', signatures[0].id, support.id, ...(round === 3 ? ['procedure-precedent'] : []), signatures[1].id];
    for (const id of plan) {
      assert.equal(resolutionGameAction(recovered, `play:${id}`), true);
      assert.deepEqual(restore(serialize(recovered)), recovered);
    }
    assert.equal(recovered.resolution.activity.state.scrutiny, round === 2 ? 3 : 6);
  }
  assert.equal(recovered.resolution.activity.state.stage, 'complete');
  assert.equal(chooseResolution(recovered, 'vacancy-approve'), true);
  assert.equal(recovered.ending, 'vacancy');
  assert.equal(serialize(game), snapshot, 'exploring both real orders leaves the original save untouched');
});

test('current card inputs have no submit, exchange, or procedure-choice shortcut', () => {
  const game = ready(), before = serialize(game);
  for (const value of ['end-turn', 'submit', 'draft:procedure-scope', 'draft:procedure-precedent', 'complete']) {
    assert.equal(resolutionGameAction(game, value), false);
    assert.equal(serialize(game), before);
  }
  let previous = vacancyStatus(game.resolution.activity.state);
  solveResolutionGame(game, state => {
    const current = vacancyStatus(state.resolution.activity.state);
    if (current.round !== previous.round) assert.equal(current.stage, 'play', 'closing a file opens the next hand immediately');
    previous = current;
  });
  assert.equal(game.resolution.activity.state.stage, 'complete');
  assert.equal(game.ending, null, 'the final story commitment remains explicit');
});

function legacyHandover(version) {
  const source = ready();
  source.resolution.activity.state = createVacancy(source, version);
  assert.equal(source.resolution.activity.state.version, version);
  return source;
}

test('validated old active card saves restart the three-hand interview without changing underlying story progress', () => {
  for (const version of [1, 2, 3, 4]) {
    const legacy = legacyHandover(version), snapshots = [structuredClone(legacy)], seen = new Set();
    solveResolutionGame(legacy, state => {
      const activity = state.resolution.activity.state, key = `${activity.round}/${activity.stage}`;
      if (seen.has(key) || activity.stage === 'complete') return;
      seen.add(key);snapshots.push(structuredClone(state));
    });
    for (const original of snapshots) {
      const reports = structuredClone(original.reports), rng = original.rng;
      const resumed = restore(serialize(original));
      assert.ok(resumed);
      const activity = resumed.resolution.activity.state;
      assert.equal(activity.version, 5);
      assert.equal(activity.round, 0, 'the new card balance restarts an unfinished interview fairly');
      assert.equal(activity.progress, 0);
      assert.equal(activity.scrutiny, 0);
      assert.equal(activity.stage, 'play');
      assert.deepEqual(activity.awards, []);
      assert.deepEqual(activity.cards, original.resolution.activity.state.cards);
      assert.deepEqual(resumed.reports, reports);
      assert.deepEqual(resumed.fieldEvents, original.fieldEvents);
      assert.equal(resumed.rng, rng);
      assert.equal(chooseResolution(resumed, 'vacancy-approve'), false);
      assert.deepEqual(restore(serialize(resumed)), resumed, 'migration runs only once');
      solveResolutionGame(resumed);
      assert.equal(chooseResolution(resumed, 'vacancy-approve'), true);
      assert.equal(resumed.ending, 'vacancy');
      assert.deepEqual(restore(serialize(resumed)), resumed);
    }
  }
});

test('legacy completed and failed card interviews keep their exact terminal state', () => {
  for (const version of [1, 2, 3, 4]) {
    const complete = legacyHandover(version);
    solveResolutionGame(complete);
    assert.deepEqual(restore(serialize(complete)), complete, 'earned approval is not played again');
    assert.equal(chooseResolution(complete, 'vacancy-approve'), true);
    assert.deepEqual(restore(serialize(complete)), complete, 'achieved ending remains achieved');
    const failed = version >= 3 ? createMiniGame('vacancy', 'story', 62) : legacyHandover(version);
    if (version >= 3) {
      failed.resolution.activity.state = createVacancy(failed, version);
      failVacancyGame(failed);
    } else for (let turn = 0; turn < 3; turn++) assert.equal(resolutionGameAction(failed, 'end-turn'), true);
    assert.deepEqual(restore(serialize(failed)), failed, 'migration does not erase a completed loss');
    assert.equal(chooseResolution(failed, 'vacancy-approve'), false);
    if (!failed.practice) assert.equal(chooseResolution(failed, 'back'), true);
    else assert.equal(miniGameResult(failed).success, false);
  }
});

test('existing local practice restarts with the same source cards and remains isolated', () => {
  for (const version of [1, 2, 3, 4]) {
    const source = sourceWithTapes(), sourceSave = serialize(source);
    const practice = createMiniGame('vacancy', 'story', 903, source);
    practice.resolution.activity.state = createVacancy(practice, version);
    assert.equal(resolutionGameAction(practice, `play:${practice.resolution.activity.state.hand[0]}`), true);
    const resumed = restore(serialize(practice));
    assert.ok(resumed);
    assert.equal(resumed.practice, 'vacancy');
    assert.equal(resumed.practiceDeckSource, 'current');
    assert.equal(resumed.runId, practice.runId);
    assert.equal(resumed.resolution.activity.state.version, 5);
    assert.deepEqual(resumed.resolution.activity.state.cards, practice.resolution.activity.state.cards);
    assert.deepEqual(resumed.reports, practice.reports);
    assert.equal(miniGameComplete(resumed), false);
    solveResolutionGame(resumed);
    assert.equal(miniGameResult(resumed).success, true);
    assert.equal(chooseResolution(resumed, 'vacancy-approve'), false);
    assert.equal(resumed.ending, null);
    assert.deepEqual(getMiniGameUnlocks(resumed), []);
    assert.equal(serialize(source), sourceSave);
  }
});

test('migration validates old histories before restarting and current saves reject invented progress', () => {
  for (const version of [1, 2, 3, 4]) {
    const original = legacyHandover(version);
    assert.equal(resolutionGameAction(original, 'play:' + original.resolution.activity.state.hand[0]), true);
    const forgedLegacy = structuredClone(original);
    forgedLegacy.resolution.activity.state.progress++;
    assert.equal(restore(serialize(forgedLegacy)), null);
  }
  const forgedCheckpoint = legacyHandover(2);
  forgedCheckpoint.resolution.activity.state.legacyHistory = ['end-turn', 'end-turn', 'end-turn'];
  assert.equal(restore(serialize(forgedCheckpoint)), null, 'invalid legacy checkpoints cannot authorize a new interview');
  const current = ready();
  current.resolution.activity.state.scrutiny = -1;
  assert.equal(restore(serialize(current)), null);
});
