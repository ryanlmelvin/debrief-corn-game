import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, answer } from '../docs/engine.js';
import { EVIDENCE } from '../docs/evidence-scenes.js';
import { encounterForState } from '../docs/encounters.js';
import { endingPathRequirements } from '../docs/ending-paths.js';
import { createVacancy, vacancyStartingDeck, vacancyStatus, vacancyAction, validVacancy, migrateVacancy } from '../docs/vacancy.js';

function assignment(seed = 42, minimal = false) {
  const game = createGame('story', seed);
  if (minimal) {
    game.reports = [0, 1].flatMap(shift => ['comply', 'sign'].map(choice => ({ shift, choice, answer: `My ${choice} answer on night ${shift + 1}.` })));
    return game;
  }
  game.evidence = Object.keys(EVIDENCE);
  for (let shift = 0; shift < 3; shift++) {
    Object.assign(game, { shift, phase: 'debrief', question: 0 });
    for (const choice of shift === 2 ? ['truth', 'evidence'] : ['comply', 'redact', 'sign']) assert.equal(answer(game, choice), true);
  }
  return game;
}
function signatures(state) { return state.cards.filter(card => card.move === 'sign').slice(0, 2).map(card => card.id); }
function winningCards(state) {
  const signed = signatures(state);
  const support = state.hand.find(id => state.cards.some(card => card.id === id && ['comply', 'redact'].includes(card.move)));
  assert.ok(support, 'a real comply/redact reply is visible in the opening hand');
  if (state.round === 0) return [...signed, support];
  if (state.round === 1) return ['procedure-scope', signed[0], support, signed[1]];
  return ['procedure-scope', signed[0], support, 'procedure-precedent', signed[1]];
}
function playFile(state, afterAction = () => {}) {
  const round = state.round, opening = new Set(state.hand), actions = winningCards(state);
  for (const id of actions) assert.ok(opening.has(id), `file ${round + 1} begins with every card needed to win`);
  for (const id of actions) {
    assert.equal(vacancyAction(state, `play:${id}`), true);
    afterAction(state);
    if (state.stage !== 'play' || state.round !== round) break;
  }
  assert.ok(state.round !== round || state.stage === 'complete');
}
function finish(state, afterAction = () => {}) {
  while (state.stage === 'play') playFile(state, afterAction);
  assert.equal(state.stage, 'complete');
}
function openSecondFileAtSix() {
  const state = createVacancy(assignment(1));
  const support = winningCards(state).at(-1);
  for (const id of [support, ...signatures(state)]) assert.equal(vacancyAction(state, `play:${id}`), true);
  assert.equal(state.round, 1); assert.equal(state.scrutiny, 6); assert.equal(state.stage, 'play');
  return state;
}
function openThirdFileAtZero() {
  const state = createVacancy(assignment());
  playFile(state);
  const signed = signatures(state), support = winningCards(state)[2];
  for (const id of [signed[0], 'procedure-scope', signed[1], support]) assert.equal(vacancyAction(state, `play:${id}`), true);
  assert.equal(state.round, 2); assert.equal(state.scrutiny, 0); assert.equal(state.stage, 'play');
  return state;
}

test('starting deck uses this run’s real exhibits and ordinary debrief answers', () => {
  const game = assignment(), before = structuredClone(game);
  game.reports.push({ kind: 'resolution', choice: 'sign', shift: 2, answer: 'Not a normal debrief.' });
  game.reports.push({ kind: 'recovery', choice: 'truth', shift: 2, answer: 'Not a normal debrief.' });
  const deck = vacancyStartingDeck(game);
  assert.equal(deck.length, 17);
  assert.deepEqual(deck.filter(card => card.kind === 'evidence').map(card => card.move), game.evidence);
  assert.deepEqual(deck.filter(card => card.kind === 'testimony').map(card => card.quote), before.reports.map(report => report.answer));
  assert.ok(deck.some(card => card.move === 'sign' && card.title === 'Prior Approval'));
  assert.ok(deck.some(card => card.move === 'truth' && card.title === 'On Record'));
  assert.ok(deck.every(card => card.source && card.quote));
  const smaller = structuredClone(game);
  smaller.evidence = ['badge']; smaller.reports = smaller.reports.slice(0, 1);
  assert.deepEqual(vacancyStartingDeck(smaller).map(card => card.id), ['evidence-badge', 'answer-0-comply']);
});

test('creating, inspecting, and playing the duel leaves the source run and its RNG untouched', () => {
  const game = assignment(), before = JSON.stringify(game), state = createVacancy(game);
  assert.deepEqual(createVacancy(game), state);
  finish(state, current => vacancyStatus(current));
  assert.equal(JSON.stringify(game), before);
  assert.equal(validVacancy(state, game), true);
  const changed = structuredClone(game); changed.evidence.pop();
  assert.equal(validVacancy(state, changed), false);
});

test('field recordings require real recording receipts and preserve the recorded scene', () => {
  const game = assignment();
  game.fieldEvents.flags.push('recording', 'future-recording');
  assert.equal(vacancyStartingDeck(game).filter(card => card.move.endsWith('-call')).length, 0);
  game.fieldEvents.journal.push({ id: 'first-call', choice: 'answer' });
  assert.equal(vacancyStartingDeck(game).filter(card => card.move.endsWith('-call')).length, 0);
  game.fieldEvents.journal = ['first-call', 'future-call'].map(id => ({ id, choice: 'record' }));
  const tapes = vacancyStartingDeck(game).filter(card => card.move.endsWith('-call'));
  assert.equal(tapes.length, 2);
  for (const tape of tapes) assert.equal(tape.quote, encounterForState(game, tape.move).choices.find(choice => choice.id === 'record').result);
  const state = createVacancy(game); finish(state);
  game.resolution = { recordingsRelinquished: true };
  assert.equal(vacancyStartingDeck(game).filter(card => card.move.endsWith('-call')).length, 0);
  assert.equal(validVacancy(state, game), false);
});

test('three approval targets automatically close three files and teach two procedures', () => {
  const state = createVacancy(assignment());
  assert.equal(state.version, 5);
  const initialSize = state.deck.length;
  playFile(state);
  assert.equal(state.round, 1); assert.equal(state.progress, 0); assert.equal(state.stage, 'play');
  assert.deepEqual(state.awards, ['procedure-scope']); assert.equal(state.deck.length, initialSize + 1);
  playFile(state);
  assert.equal(state.round, 2); assert.equal(state.stage, 'play');
  assert.deepEqual(state.awards, ['procedure-scope', 'procedure-precedent']);
  playFile(state);
  assert.equal(state.round, 2); assert.equal(state.stage, 'complete'); assert.equal(state.deck.length, initialSize + 2);
  assert.equal(vacancyAction(state, `play:${state.hand[0]}`), false);
});

test('one hand permits more than two card plays and never requires submit or drafting', () => {
  const game = assignment(42, true);
  game.reports = [
    { shift: 0, choice: 'sign', answer: 'Signed.' }, { shift: 1, choice: 'sign', answer: 'Signed again.' },
    ...[0, 1, 2].map(shift => ({ shift, choice: 'redact', answer: `Routine findings on night ${shift + 1}.` }))
  ];
  const state = createVacancy(game), starting = structuredClone(state);
  for (const action of ['end-turn', 'draft:procedure-scope', '', null, {}]) {
    assert.equal(vacancyAction(state, action), false); assert.deepEqual(state, starting);
  }
  for (const card of state.cards.filter(card => card.move === 'redact')) assert.equal(vacancyAction(state, `play:${card.id}`), true);
  assert.equal(state.round, 0); assert.equal(state.progress, 3); assert.equal(state.hand.length, 2);
  assert.equal(vacancyAction(state, `play:${signatures(state)[0]}`), true);
  assert.equal(state.round, 0); assert.equal(state.hand.length, 1);
  assert.equal(vacancyAction(state, `play:${signatures(state)[1]}`), true);
  assert.equal(state.round, 1);
  const view = vacancyStatus(state);
  for (const removed of ['actions', 'turn', 'maxTurns', 'draft', 'canEndTurn', 'approvalLimit', 'intent']) assert.equal(Object.hasOwn(view, removed), false);
});

test('at six scrutiny the same hand loses with authority first and wins with relief first', () => {
  const state = openSecondFileAtSix();
  const nextOpening = vacancyStatus(state);
  assert.equal(nextOpening.scrutiny, 6); assert.equal(nextOpening.goal, 9);
  const reckless = structuredClone(state);
  assert.equal(vacancyAction(reckless, `play:${signatures(reckless)[0]}`), true);
  assert.equal(reckless.stage, 'failed');
  playFile(state);
  assert.equal(state.round, 2); assert.equal(state.scrutiny, 3);
  playFile(state);
  assert.equal(state.stage, 'complete'); assert.equal(state.scrutiny, 6);
});

test('front-loading all relief fails the final file even from zero; interleaving the same papers wins', () => {
  const state = openThirdFileAtZero(), interleaved = structuredClone(state), signed = signatures(state);
  const support = winningCards(state)[2];
  for (const id of ['procedure-scope', support, signed[0], 'procedure-precedent']) assert.equal(vacancyAction(state, `play:${id}`), true);
  assert.equal(state.progress, 10); assert.equal(state.scrutiny, 6); assert.equal(state.stage, 'play');
  assert.equal(vacancyAction(state, `play:${signed[1]}`), true);
  assert.equal(state.progress, 13); assert.equal(state.scrutiny, 9);
  assert.equal(state.stage, 'failed'); assert.equal(state.round, 2, 'scrutiny loss takes priority over approval');
  playFile(interleaved);
  assert.equal(interleaved.stage, 'complete'); assert.equal(interleaved.scrutiny, 6);
  assert.deepEqual(new Set(state.history.slice(-5)), new Set(interleaved.history.slice(-5)), 'only the order differs');
  assert.equal(vacancyAction(state, `play:${state.hand[0]}`), false);
});

test('playing only claims without relief loses on the third card', () => {
  const state = createVacancy(assignment(1));
  for (const id of [...signatures(state), 'answer-6-truth']) assert.equal(vacancyAction(state, `play:${id}`), true);
  assert.equal(state.stage, 'failed'); assert.equal(state.round, 0); assert.equal(state.scrutiny, 9);
});

test('excess relief is discarded at zero and cannot subsidize the next claim', () => {
  const state = openSecondFileAtSix(), signed = signatures(state), support = winningCards(state)[2];
  assert.equal(vacancyAction(state, 'play:procedure-scope'), true);
  assert.equal(state.scrutiny, 1);
  assert.equal(vacancyAction(state, `play:${support}`), true);
  assert.equal(state.scrutiny, 0, 'subtracting four from one clamps at zero');
  assert.equal(vacancyAction(state, `play:${signed[0]}`), true);
  assert.equal(state.scrutiny, 3, 'the unused three points of relief are not banked');
});

test('Reclassify states that its next-evidence bonus adds approval', () => {
  const game = assignment(42, true);
  game.reports = game.reports.map(report => report.choice === 'comply' ? { ...report, choice: 'redact', answer: 'Nothing outside the expected growth pattern.' } : report);
  const state = createVacancy(game), card = vacancyStatus(state).hand.find(entry => entry.move === 'redact');
  assert.ok(card); assert.match(card.effect, /next evidence: \+2 approval$/);
  assert.doesNotMatch(card.effect, /next evidence \+2$/);
});

test('a card is used once and invalid actions do not alter the hand', () => {
  const state = createVacancy(assignment()), card = state.hand[0];
  assert.equal(vacancyAction(state, `play:${card}`), true);
  const after = structuredClone(state);
  for (const action of [`play:${card}`, 'play:evidence-fiction', 'draft:procedure-scope', 'end-turn']) {
    assert.equal(vacancyAction(state, action), false); assert.deepEqual(state, after);
  }
});

test('all file states survive JSON restore; forged progress, cards, RNG, and awards do not', () => {
  const game = assignment(), state = createVacancy(game);
  finish(state, current => {
    const restored = JSON.parse(JSON.stringify(current));
    assert.equal(validVacancy(restored, game), true);
    assert.deepEqual(vacancyStatus(restored), vacancyStatus(current));
  });
  for (const mutate of [r => { r.stage = 'play'; }, r => { r.progress++; }, r => { r.rng++; },
    r => { r.awards.pop(); }, r => { r.hand.push(r.deck[0]); }, r => { r.scrutiny++; },
    r => { r.cards[0].quote = 'An exhibit never collected'; }, r => { r.history.pop(); }, r => { r.extra = true; }]) {
    const forged = structuredClone(state); mutate(forged); assert.equal(validVacancy(forged, game), false);
  }
  for (const value of [null, {}, [], 42, { version: 3 }]) {
    assert.equal(validVacancy(value), false); assert.equal(vacancyStatus(value), null);
  }
});

test('relief spent at zero is wasted, while the same cards in a different order reduce carryover', () => {
  const efficient = createVacancy(assignment(42, true)), wasteful = structuredClone(efficient);
  const signed = signatures(efficient), support = winningCards(efficient).at(-1);
  for (const id of [...signed, support]) assert.equal(vacancyAction(efficient, `play:${id}`), true);
  for (const id of [support, ...signed]) assert.equal(vacancyAction(wasteful, `play:${id}`), true);
  assert.equal(efficient.round, 1); assert.equal(wasteful.round, 1);
  assert.equal(efficient.scrutiny, 2); assert.equal(wasteful.scrutiny, 6);
  assert.deepEqual(efficient.hand, wasteful.hand, 'card order changes pressure, not the next deal');
  for (const card of vacancyStatus(efficient).hand) assert.doesNotMatch(card.effect, /· 0 scrutiny/);
});

test('every reply type and source density has a win contained entirely in its three opening hands', () => {
  const replies = ['comply', 'redact', 'truth', 'evidence', 'field-notes', 'question'];
  for (const reply of replies) for (const tapes of [0, 1, 2]) for (let seed = 1; seed <= 16; seed++) {
    const game = assignment(seed, true);
    game.reports.unshift({ shift: 0, choice: reply, answer: `The run's retained ${reply} response.` });
    if (tapes) game.evidence = Object.keys(EVIDENCE);
    game.fieldEvents.journal = ['first-call', 'future-call'].slice(0, tapes).map(id => ({ id, choice: 'record' }));
    assert.ok(endingPathRequirements(game, 'vacancy').every(requirement => requirement.met));
    const state = createVacancy(game); finish(state);
    assert.ok(state.scrutiny < 7); assert.equal(validVacancy(state, game), true);
  }
  for (let seed = 1; seed <= 32; seed++) {
    const game = assignment(seed, true);
    assert.ok(endingPathRequirements(game, 'vacancy').every(requirement => requirement.met));
    const sparse = createVacancy(game); finish(sparse); assert.equal(validVacancy(sparse), true);
  }
});

test('legacy active previews validate before restarting the three-file format', () => {
  for (const version of [1, 2, 3, 4]) {
    const game = assignment(), old = createVacancy(game, version);
    assert.equal(vacancyAction(old, version >= 3 ? `play:${old.hand[0]}` : 'end-turn'), true);
    const cards = structuredClone(old.cards), source = JSON.stringify(game);
    assert.equal(migrateVacancy(old, game), true);
    assert.equal(old.version, 5); assert.equal(old.round, 0); assert.equal(old.progress, 0); assert.equal(old.scrutiny, 0);
    assert.deepEqual(old.history, []); assert.deepEqual(old.cards, cards); assert.equal(JSON.stringify(game), source);
    assert.equal(validVacancy(old, game), true); finish(old);
    if (version < 3) {
      const failed = createVacancy(game, version);
      for (let turn = 0; turn < 3; turn++) vacancyAction(failed, 'end-turn');
      const before = JSON.stringify(failed); assert.equal(migrateVacancy(failed, game), true); assert.equal(JSON.stringify(failed), before);
    }
    const forged = createVacancy(game, version); forged.progress = 100;
    assert.equal(migrateVacancy(forged, game), false); assert.equal(forged.version, version);
  }
});

test('completed version-four interviews retain their old effects and result', () => {
  const game = assignment(), old = createVacancy(game, 4);
  assert.match(vacancyStatus(old).hand.find(card => card.move === 'sign').effect, /\+2 scrutiny/);
  finish(old);
  const before = JSON.stringify(old);
  assert.equal(validVacancy(old, game), true); assert.equal(migrateVacancy(old, game), true);
  assert.equal(JSON.stringify(old), before); assert.equal(old.version, 4); assert.equal(old.stage, 'complete');
});
