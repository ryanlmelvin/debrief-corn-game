import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startShift, advance, shoot, reload, move, inspect, FIELD_SITES,
  chooseFieldEncounter, continueFieldEncounter, beginDebrief, answer, getQuestion,
  restore, serialize, getEnding, endingId, ENDINGS
} from '../docs/engine.js';
import { planFieldRoute } from '../docs/field.js';
import { currentEncounter } from '../docs/encounters.js';
import { availableResolutions, getResolution, chooseResolution } from '../docs/alternate-endings.js';
import { canTakeEvidenceOutside } from '../docs/ending-requirements.js';
import { encodeProgress, decodeProgress, progressSnapshot } from '../docs/progress.js';
import { endingShareData } from '../docs/sharing.js';
import { interviewRecord } from '../docs/art.js';
import { guideTravel, guideRouteStatus, inspectGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';

const routes = {
  relief: {
    picks: { 'lamp-keeper': 'ask', 'your-outline': 'name' },
    actions: ['relief-approach', 'relief-orders', 'relief-handoff'],
    title: 'I trained my replacement. He’s me.'
  },
  witness_present: {
    picks: { 'first-call': 'record', 'future-call': 'record', 'last-follower': 'reply' },
    actions: ['witness-chair', 'witness-tapes', 'witness-name'],
    title: 'I brought a plus-one.'
  },
  rescue: {
    picks: { 'first-call': 'record', 'second-call': 'compare', 'lamp-keeper': 'hand' },
    actions: ['rescue-radio', 'rescue-carry', 'rescue-leave'],
    title: 'I chose people over paperwork.'
  },
  vacancy: {
    picks: {}, actions: ['vacancy-accept', 'vacancy-sign', 'vacancy-approve'],
    title: 'I became the problem.'
  },
  transmission: {
    picks: { 'first-call': 'record', 'two-towers': 'other', 'future-call': 'compare' },
    actions: ['transmission-tower', 'transmission-listen', 'transmission-broadcast'],
    title: 'I took my own advice.'
  }
};

function roundTrip(game) {
  const saved = restore(serialize(game));
  assert.ok(saved, `saved state must resume: ${game.phase}/${game.resolution?.route}/${game.resolution?.step}`);
  assert.deepEqual(saved, game);
  return saved;
}

// Play actual watch shifts and walks; no injected clues, flags, reports or exposure.
function campaign(name, mode = 'story', { picks = routes[name].picks, compliant = name === 'vacancy', object = false } = {}) {
  let game = createGame(mode, 42);
  for (let night = 0; night < 3; night++) {
    assert.equal(startShift(game), true);
    let ticks = 0;
    while (game.phase === 'tower') {
      assert.ok(ticks++ < 300, 'watch must finish');
      advance(game, .25);
      for (const target of [...game.targets]) if (target.kind === 'corn') shoot(game, target.x, target.y - 34);
      if (game.rounds < 2) reload(game);
    }
    assert.equal(game.phase, 'field');
    for (const id of ['pump', 'corner', 'drain', 'tower']) {
      for (const step of planFieldRoute(game, FIELD_SITES.find(site => site.id === id)).steps) {
        assert.equal(move(game, step.x - game.player.x, step.y - game.player.y), true);
        if (game.fieldEvents.pending) {
          const encounter = currentEncounter(game);
          assert.equal(chooseFieldEncounter(game, picks[encounter.id] || encounter.choices[0].id), true);
          assert.equal(continueFieldEncounter(game), true);
        }
      }
      if (id !== 'tower') assert.ok(inspect(game));
      game = roundTrip(game);
    }
    assert.ok(game.exposure < 100);
    assert.equal(beginDebrief(game), true);
    assert.equal(answer(game, compliant ? 'comply' : 'truth'), true);
    assert.equal(answer(game, compliant ? 'redact' : 'evidence'), true);
    if (night < 2) {
      assert.equal(answer(game, object ? 'question' : 'sign'), true);
      if (game.phase === 'debrief' && game.question === 3) assert.equal(answer(game, 'return'), true);
    }
  }
  assert.equal(game.question, 2);
  assert.equal(game.fieldEvents.journal.length, 12);
  assert.equal(game.evidence.length, 9);
  assert.equal(game.breaches, 0);
  return roundTrip(game);
}

async function transfer(game, history = { collected: [], runs: [] }) {
  const snapshot = progressSnapshot(game, history);
  const imported = await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(imported, snapshot);
  return imported.save;
}

for (const mode of ['story', 'hard']) for (const [id, route] of Object.entries(routes)) {
  test(`${id} is reachable through a complete ${mode} campaign and resumes every scene`, async () => {
    let game = campaign(id, mode);
    assert.equal(availableResolutions(game).find(option => option.id === id).disabled, false);
    assert.ok(getQuestion(game).options.some(option => option.id === 'follow-lead'));
    assert.equal(answer(game, 'follow-lead'), true);
    game = await transfer(roundTrip(game));
    assert.equal(chooseResolution(game, id), true);
    for (const action of route.actions) {
      game = await transfer(roundTrip(game));
      assert.equal(game.phase, 'resolution');
      assert.ok(getResolution(game).options.some(option => option.id === action));
      const before = serialize(game);
      assert.equal(chooseResolution(game, 'not-an-answer'), false);
      assert.equal(serialize(game), before, 'invalid responses cannot advance or change the transcript');
      assert.equal(chooseResolution(game, action), true);
    }
    assert.equal(game.phase, 'ending');
    assert.equal(endingId(game), id);
    const ending = getEnding(game);
    assert.equal(ending.title, route.title);
    assert.equal(Object.keys(ENDINGS).length, 22);
    const share = endingShareData(id, [id]);
    assert.equal(share.text, `${route.title}\nI've achieved 1 of 22 endings.`);
    assert.ok(share.url.endsWith(`/share/${ending.code}/`));
    assert.ok(game.reports.some(report => report.kind === 'resolution'));
    const history = { collected: [id], runs: [{ ...ending, id: game.runId, ending: id, date: '2026-10-30T12:00:00Z', reports: game.reports }] };
    game = await transfer(roundTrip(game), history);
    assert.equal(getEnding(game).text, ending.text);
    assert.equal(chooseResolution(game, route.actions.at(-1)), false, 'completed finales cannot replay an answer');
  });
}

test('an undiscovered lead menu remains reversible and preserves the original final choice', () => {
  const game = campaign('vacancy', 'story', { compliant: false, object: true });
  assert.ok(availableResolutions(game).every(option => option.disabled));
  const reports = structuredClone(game.reports);
  assert.equal(answer(game, 'follow-lead'), true);
  for (const id of Object.keys(routes)) assert.equal(chooseResolution(game, id), false);
  roundTrip(game);
  assert.equal(chooseResolution(game, 'back'), true);
  assert.equal(game.phase, 'debrief');
  assert.equal(game.question, 2);
  assert.equal(game.resolution, undefined);
  assert.deepEqual(game.reports, reports);
  assert.equal(answer(game, 'sign'), true);
  assert.equal(game.ending, 'dissent');
  roundTrip(game);
});

test('leaving the follower behind locks the new witness without blocking the original evidence ending', () => {
  const picks = { ...routes.witness_present.picks, 'last-follower': 'leave' };
  const game = campaign('witness_present', 'hard', { picks, object: true });
  assert.equal(canTakeEvidenceOutside(game), true);
  assert.equal(answer(game, 'follow-lead'), true);
  assert.equal(getResolution(game).options.find(option => option.id === 'witness_present').disabled, true);
  assert.equal(chooseResolution(game, 'witness_present'), false);
  assert.equal(chooseResolution(game, 'back'), true);
  assert.equal(answer(game, 'expose'), true);
  assert.equal(game.ending, 'witness');
  roundTrip(game);
});

test('the rescue gives up recordings only at commitment, while preserving the private journal and earned testimony', () => {
  const picks = { ...routes.rescue.picks, ...routes.witness_present.picks };
  const game = campaign('rescue', 'hard', { picks, object: true });
  const journal = structuredClone(game.fieldEvents.journal);
  const priorTestimony = structuredClone(game.reports);
  assert.equal(canTakeEvidenceOutside(game), true);
  assert.equal(answer(game, 'follow-lead'), true);
  assert.equal(chooseResolution(game, 'rescue'), true);
  assert.equal(chooseResolution(game, 'rescue-radio'), true);
  assert.equal(chooseResolution(game, 'rescue-carry'), true);
  assert.equal(canTakeEvidenceOutside(game), true);
  assert.equal(chooseResolution(game, 'back'), true);
  roundTrip(game);
  assert.equal(canTakeEvidenceOutside(game), true);
  assert.equal(answer(game, 'follow-lead'), true);
  assert.equal(chooseResolution(game, 'rescue'), true);
  for (const action of routes.rescue.actions) assert.equal(chooseResolution(game, action), true);
  assert.equal(game.ending, 'rescue');
  assert.equal(canTakeEvidenceOutside(game), false);
  assert.equal(availableResolutions(game).find(option => option.id === 'witness_present').disabled, true);
  assert.deepEqual(game.fieldEvents.journal, journal);
  assert.deepEqual(game.reports.filter(report => report.kind !== 'resolution'), priorTestimony);
  roundTrip(game);
});

test('rejecting the conditional promotion restores the debrief and leaves the original endings available', () => {
  const game = campaign('vacancy');
  assert.equal(answer(game, 'follow-lead'), true);
  assert.equal(chooseResolution(game, 'vacancy'), true);
  for (const action of ['vacancy-accept', 'vacancy-sign', 'vacancy-question']) assert.equal(chooseResolution(game, action), true);
  assert.equal(game.phase, 'debrief');
  assert.equal(game.question, 2);
  assert.equal(game.resolution, undefined);
  roundTrip(game);
  assert.equal(answer(game, 'sign'), true);
  assert.equal(game.ending, 'compliance');
  roundTrip(game);
});

test('an honest handoff changes the ending and survives progress transfer', async () => {
  const game = campaign('relief');
  assert.equal(answer(game, 'follow-lead'), true);
  for (const action of ['relief', 'relief-approach', 'relief-warning', 'relief-handoff-honest']) {
    assert.equal(chooseResolution(game, action), true);
  }
  assert.equal(game.ending, 'relief');
  const text = getEnding(game).text;
  assert.match(text, /you do not know when anyone will come/);
  assert.doesNotMatch(text, /At the end of the night/);
  assert.equal(getEnding(await transfer(roundTrip(game))).text, text);
});

test('returning from an unfinished lead keeps the debrief tape limited to actual interview answers', () => {
  const game = campaign('relief');
  const before = interviewRecord(game);
  assert.equal(answer(game, 'follow-lead'), true);
  for (const action of ['relief', 'relief-approach', 'back']) assert.equal(chooseResolution(game, action), true);
  assert.equal(interviewRecord(game), before);
});

test('repeatedly reconsidering a lead leaves room to save original sign and recovery endings', () => {
  const game = campaign('relief');
  const ordinary = structuredClone(game.reports);
  for (let visit = 0; visit < 60; visit++) {
    assert.equal(answer(game, 'follow-lead'), true);
    for (const action of ['relief', 'relief-approach', 'relief-orders', 'back']) assert.equal(chooseResolution(game, action), true);
    roundTrip(game);
  }
  assert.deepEqual(game.reports.filter(report => report.kind !== 'resolution'), ordinary);
  const signed = structuredClone(game);
  assert.equal(answer(signed, 'sign'), true);
  assert.equal(signed.ending, 'dissent');
  roundTrip(signed);
  assert.equal(answer(game, 'guide'), true);
  for (let clue = 0; clue < 3; clue++) {
    assert.equal(guideTravel(game), true);
    for (let tick = 0; tick < 300 && !guideRouteStatus(game).ready; tick++) advance(game, .1);
    assert.equal(guideRouteStatus(game).ready, true);
    assert.ok(inspectGuide(game));
  }
  advance(game, .7);
  assert.equal(spareGuide(game), true);
  for (let question = 0; question < 2; question++) {
    const interview = guideDebrief(game);
    assert.ok(interview);
    assert.equal(answerGuideDebrief(game, interview.options[0].id), true);
  }
  assert.equal(game.ending, 'guide');
  roundTrip(game);
});
