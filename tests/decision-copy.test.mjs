import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getQuestion, answer, serialize } from '../docs/engine.js';
import { ENCOUNTERS } from '../docs/encounters.js';
import { observedSighting } from '../docs/watch-story.js';
import { decisionQuestion } from '../docs/decision-copy.js';

function interview(patch = {}) {
  return Object.assign(createGame('story', 704), { phase: 'debrief' }, patch);
}
const choice = (question, id) => question.options.find(option => option.id === id);
const mechanics = ({ label, detail, ...rest }) => rest;
const currentCorner = ['dress', 'badge', 'teeth'];

function assertEquivalent(game) {
  const before = serialize(game), canonical = getQuestion(game), compact = decisionQuestion(game);
  assert.deepEqual(compact.options.map(mechanics), canonical.options.map(mechanics));
  assert.equal(serialize(game), before, 'displaying a decision must not mutate the game');
  assert.deepEqual(getQuestion(game), canonical, 'full transcript copy stays canonical');
  for (const option of compact.options) {
    assert.ok(option.label.length <= 85, `${option.id} exceeds the response copy budget: ${option.label}`);
    const displayed = structuredClone(game), original = structuredClone(game);
    assert.equal(answer(displayed, option.id), answer(original, option.id));
    assert.deepEqual(displayed, original, 'display answers retain identical consequences and transcript');
  }
  assert.ok(compact.prompt.length <= 120, compact.prompt);
  assert.ok(compact.context.length <= 65, compact.context);
  return compact;
}

test('compact interviews preserve every answer, lock, consequence, and canonical transcript across branches', () => {
  for (const shift of [0, 1, 2]) for (const entered of [false, true]) {
    for (const departure of entered ? ['chosen', 'compelled'] : [null]) {
      for (const evidence of [[], [currentCorner[shift]], ['ledger'], ['sample'], [currentCorner[shift], 'ledger', 'roots']]) {
        for (const disclosure of ['truth', 'comply']) for (const finding of ['evidence', 'redact']) {
          const game = interview({ shift, entered, departure, evidence });
          assertEquivalent(game);
          answer(game, disclosure);
          assertEquivalent(game);
          answer(game, finding);
          assertEquivalent(game);
          if (shift < 2) {
            answer(game, 'question');
            assert.equal(game.question, 3);
            assertEquivalent(game);
          }
        }
      }
    }
  }
});

test('sighting choices distinguish voluntary, compelled, and tower-only testimony without inventing lost lights', () => {
  for (const shift of [0, 1, 2]) for (let count = 0; count <= 3; count++) {
    for (const departure of [null, 'chosen', 'compelled']) {
      const game = interview({ shift, departure, entered: departure !== null, lightsOut: [0, 1, 2].slice(0, count) });
      const question = assertEquivalent(game), truth = choice(question, 'truth').label;
      assert.ok(truth.includes(observedSighting(game)));
      assert.match(truth, departure === 'compelled' ? /meant to stay/ : departure === 'chosen' ? /went to investigate/ : /stayed at my post/);
      if (departure === 'compelled') assert.match(question.prompt, /without answering your relief/);
      if (shift === 2 && !count) assert.doesNotMatch(truth, /light.*out/);
    }
  }
});

test('notebook context names only the corner evidence actually recovered that night', () => {
  const facts = [/white cloth/, /badge clip/, /teeth instead of kernels/];
  for (const shift of [0, 1, 2]) {
    const game = interview({ shift, entered: true, question: 1, evidence: ['ledger', 'water'] });
    const absent = decisionQuestion(game);
    assert.equal(absent.contextLabel, 'NOTEBOOK');
    assert.match(absent.context, /No entry/);
    assert.match(choice(absent, 'evidence').label, /recovered nothing/);
    assert.doesNotMatch(`${absent.context} ${choice(absent, 'evidence').label}`, /white cloth|badge|teeth/);
    game.evidence.push(currentCorner[shift]);
    assert.match(decisionQuestion(game).context, facts[shift]);
    const towerOnly = decisionQuestion(interview({ shift, question: 1 }));
    assert.equal(towerOnly.contextLabel, 'FROM THE TOWER');
    assert.match(choice(towerOnly, 'evidence').label, /never reached the corner/);
  }
});

test('each remembered encounter keeps its identity, saves its complete report, and cannot appear before discovery', () => {
  const unique = new Set();
  const signals = {
    'first-call': /my voice.*own set/, 'paired-tracks': /prints.*damaged heel/,
    'unattended-lamp': /lantern.*still air.*tin/, 'extra-step': /footstep.*after I stopped/,
    'second-call': /radio.*last investigation/, 'moved-crossing': /Two crossings.*survey map/,
    'lamp-keeper': /relief.*voice.*stalk/, 'two-towers': /two tower lights.*ladder/,
    'future-call': /debrief before.*finished/, 'root-knot': /Roots.*empty shoe/,
    'your-outline': /coat.*repair.*breathing/, 'last-follower': /Hold the door.*crop moved/
  };
  for (const encounter of ENCOUNTERS) {
    const game = interview({ shift: encounter.night, question: 1, entered: true });
    assert.equal(choice(decisionQuestion(game), 'field-notes'), undefined);
    game.fieldEvents.journal.push({ id: encounter.id, choice: encounter.choices[0].id });
    const compact = assertEquivalent(game), label = choice(compact, 'field-notes').label;
    assert.match(label, signals[encounter.id]);
    unique.add(label);
    answer(game, 'field-notes');
    assert.equal(game.reports.at(-1).answer, encounter.report);
    const otherNight = interview({ shift: (encounter.night + 1) % 3, question: 1, fieldEvents: game.fieldEvents });
    assert.equal(choice(decisionQuestion(otherNight), 'field-notes'), undefined);
  }
  assert.equal(unique.size, ENCOUNTERS.length);
  const game = interview({ question: 1 });
  game.fieldEvents.journal = [{ id: 'paired-tracks' }, { id: 'first-call' }];
  assert.match(choice(decisionQuestion(game), 'field-notes').label, /damaged heel/);
});

test('supervisor followups respect earlier disclosure and treatment objections use only held evidence', () => {
  for (const entered of [false, true]) for (const disclosure of ['truth', 'comply']) {
    const game = interview({ entered, evidence: ['dress'] });
    answer(game, disclosure);
    const followup = decisionQuestion(game);
    assert.match(followup.prompt, disclosure === 'comply' ? entered ? /perimeter check/ : /Routine movement/ : entered ? /investigation establish/ : /from the tower/);
    answer(game, 'evidence');
    assert.match(decisionQuestion(game).context, /reviewed separately/);
    game.reports[1].redacted = true;
    assert.match(decisionQuestion(game).context, /No unusual findings/);
  }
  for (const [evidence, signal] of [[[], /closing the field/], [['ledger'], /rising doses.*ledger/], [['sample'], /moved.*sealed sample/]]) {
    const game = interview({ question: 2, evidence });
    assert.match(choice(decisionQuestion(game), 'question').label, signal);
    if (!evidence.length) assert.doesNotMatch(choice(decisionQuestion(game), 'question').label, /ledger|sample/);
    answer(game, 'question');
    assert.match(decisionQuestion(game).prompt, evidence.length ? /Do you need that/ : /isn’t your decision/);
  }
});

test('final disclosure uses prepared evidence and retained physical testimony', () => {
  for (const [secured, reported, disabled] of [[[], [], true], [['ledger','sample','map'], [], true], [['ledger','sample'], [0,1], true], [['ledger','sample','map'], [0], true], [['ledger','sample','map'], [0,2], false]]) {
    const game = interview({ shift: 2, question: 2, evidence: ['ledger','sample','map'], caseFile: {secured,reported} });
    const question = assertEquivalent(game), expose = choice(question, 'expose');
    assert.equal(expose.disabled, disabled);
    assert.match(expose.detail, /prepared|Case ready/);
    assert.match(choice(question, 'guide').label, /Join the team and search/);
    game.searched.push('shift-1');
    assert.match(choice(decisionQuestion(game), 'guide').label, /Lead the team/);
  }
});
