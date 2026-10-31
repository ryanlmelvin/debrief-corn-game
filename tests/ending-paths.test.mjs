import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../docs/engine.js';
import { ENCOUNTERS } from '../docs/encounters.js';
import { ENDING_PATHS, endingPathRequirements, neededEncounterIds } from '../docs/ending-paths.js';
import { witnessRequirements } from '../docs/ending-requirements.js';
import { resolutionRequirements } from '../docs/alternate-endings.js';

const field = (shift = 0) => ({ ...createGame('story', 42), phase: 'field', shift });
function record(game, id, choice) {
  game.fieldEvents.seen.push(id);
  game.fieldEvents.journal.push({ id, choice });
  const option = ENCOUNTERS.find(event => event.id === id).choices.find(option => option.id === choice);
  if (option.flag) game.fieldEvents.flags.push(option.flag);
}

test('the director and final choice gates share one declaration for every encounter-dependent ending', () => {
  assert.deepEqual(Object.keys(ENDING_PATHS).sort(), ['relief', 'rescue', 'transmission', 'vacancy', 'witness', 'witness_present']);
  const game = field();
  assert.deepEqual(witnessRequirements(game), endingPathRequirements(game, 'witness'));
  for (const route of Object.keys(ENDING_PATHS).filter(route => route !== 'witness')) assert.deepEqual(resolutionRequirements(game, route), endingPathRequirements(game, route));
  assert.deepEqual(endingPathRequirements(game, 'unknown'), []);
  assert.deepEqual([...neededEncounterIds(game, ENCOUNTERS)].sort(), ['first-call', 'future-call', 'lamp-keeper', 'last-follower', 'second-call', 'two-towers', 'your-outline']);
});

test('turning down a prerequisite releases only the encounters on closed ending paths', () => {
  const game = field();
  record(game, 'first-call', 'leave');
  assert.deepEqual([...neededEncounterIds(game, ENCOUNTERS)].sort(), ['lamp-keeper', 'your-outline']);
  game.shift = 1;
  record(game, 'lamp-keeper', 'back');
  assert.deepEqual([...neededEncounterIds(game, ENCOUNTERS)], []);
  const untouched = field(1);
  assert.deepEqual([...neededEncounterIds(untouched, ENCOUNTERS)].sort(), ['lamp-keeper', 'your-outline'], 'missed prior-night recordings cannot be recovered later');
});

test('pending choices stay protected, completed prerequisites unlock later beats, and fulfilled beats need no protection', () => {
  const game = field();
  game.fieldEvents.seen.push('first-call');
  game.fieldEvents.pending = { id: 'first-call', choice: null };
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('first-call'));
  game.fieldEvents.seen = [];
  game.fieldEvents.pending = null;
  record(game, 'first-call', 'record');
  assert.equal(neededEncounterIds(game, ENCOUNTERS).has('first-call'), false);
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('second-call'));
  game.shift = 1;
  record(game, 'second-call', 'compare');
  record(game, 'lamp-keeper', 'hand');
  record(game, 'two-towers', 'other');
  game.shift = 2;
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('future-call'));
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('last-follower'));
  record(game, 'future-call', 'compare');
  assert.equal(neededEncounterIds(game, ENCOUNTERS).has('last-follower'), false, 'comparing instead of recording closes the invited-witness path');
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('your-outline'), 'the replacement remains available');
});

test('a locked-in detour cannot resurrect the canonical choice after saving', () => {
  const game = field(2);
  record(game, 'lamp-keeper', 'ask');
  assert.ok(neededEncounterIds(game, ENCOUNTERS).has('your-outline'));
  game.fieldEvents.plan.find(entry => entry.id === 'your-outline').detour = 1;
  assert.equal(neededEncounterIds(game, ENCOUNTERS).has('your-outline'), false);
});

function withPath(id, path, run) {
  ENDING_PATHS[id] = path;
  try { run(); } finally { delete ENDING_PATHS[id]; }
}

test('adding an ending automatically protects new encounters and recursively discovers their item prerequisites', () => {
  const encounters = [
    { id: 'new-key', night: 0, step: 3, choices: [{ id: 'take', flag: 'new-key' }] },
    { id: 'new-proof', night: 1, step: 9, choices: [{ id: 'unlock', requires: 'new-key', flag: 'new-proof' }] },
    { id: 'new-finale', night: 2, step: 16, choices: [{ id: 'show', requires: 'new-proof' }] }
  ];
  const path = { requirements: [{ id: 'new-route-proof', label: 'Show the recovered proof.', kind: 'encounters', events: [{ id: 'new-finale', choices: ['show'] }], target: 1 }] };
  withPath('new-route', path, () => {
    const game = field();
    assert.deepEqual([...neededEncounterIds(game, encounters)].sort(), encounters.map(event => event.id).sort());
    assert.deepEqual(endingPathRequirements(game, 'new-route'), [{ id: 'new-route-proof', label: 'Show the recovered proof.', current: 0, target: 1, met: false }]);
    game.fieldEvents.journal.push({ id: 'new-key', choice: 'leave' });
    assert.equal(neededEncounterIds(game, encounters).size, 0, 'a declined implicit prerequisite closes the new route automatically');
    game.fieldEvents.journal = [{ id: 'new-finale', choice: 'show' }];
    assert.equal(endingPathRequirements(game, 'new-route')[0].met, true, 'the same new declaration drives the final gate');
  });
});

test('evidence and report opportunity limits release a future encounter only when its route has become impossible', () => {
  const last = { id: 'new-finale', night: 2, step: 16, choices: [{ id: 'show' }] };
  const sceneRequirement = { id: 'new-route-proof', label: 'Show proof.', kind: 'encounters', events: [{ id: last.id, choices: ['show'] }], target: 1 };
  const evidence = { id: 'proof', label: 'Old evidence.', kind: 'evidence', evidence: 'ledger', night: 0, target: 1 };
  const objections = ENDING_PATHS.witness.requirements.find(requirement => requirement.id === 'objections');
  withPath('evidence-route', { requirements: [evidence, sceneRequirement] }, () => {
    const game = field();
    assert.ok(neededEncounterIds(game, [last]).has(last.id));
    game.shift = 1;
    assert.equal(neededEncounterIds(game, [last]).has(last.id), false);
    game.evidence.push('ledger');
    assert.ok(neededEncounterIds(game, [last]).has(last.id));
  });
  withPath('reports-route', { requirements: [objections, sceneRequirement] }, () => {
    const game = field();
    assert.ok(neededEncounterIds(game, [last]).has(last.id));
    game.shift = 1;
    assert.equal(neededEncounterIds(game, [last]).has(last.id), false, 'one remaining report cannot supply two objections');
    game.reports.push({ shift: 0, supervisorReply: 'Do you need to know?' });
    assert.ok(neededEncounterIds(game, [last]).has(last.id), 'legacy objections still count');
    game.phase = 'debrief'; game.question = 2;
    assert.ok(neededEncounterIds(game, [last]).has(last.id), 'the current unanswered signature still has an objection opportunity');
    game.question = 3;
    assert.equal(neededEncounterIds(game, [last]).has(last.id), false, 'a passed signature cannot be answered again');
    game.reports.push({ shift: 1, choice: 'question' });
    assert.ok(neededEncounterIds(game, [last]).has(last.id));
  });
});

test('distinct report counts, legacy objections, and relinquished recordings retain their original gate behavior', () => {
  const game = field(2);
  game.reports = [
    { shift: 0, choice: 'question' }, { shift: 0, choice: 'question' },
    { shift: 1, supervisorReply: 'Watch the corn.' },
    ...[0, 1].flatMap(shift => ['comply', 'redact', 'sign', 'sign'].map(choice => ({ shift, choice }))),
    { shift: 0, choice: 'sign', kind: 'resolution' }
  ];
  record(game, 'first-call', 'record'); record(game, 'future-call', 'record');
  assert.equal(endingPathRequirements(game, 'witness').find(requirement => requirement.id === 'objections').current, 2);
  assert.deepEqual(endingPathRequirements(game, 'vacancy').map(requirement => requirement.current), [2, 6]);
  game.resolution = { recordingsRelinquished: true };
  assert.equal(endingPathRequirements(game, 'witness').find(requirement => requirement.id === 'recordings').current, 0);
  assert.equal(endingPathRequirements(game, 'witness_present')[0].met, false);
});
