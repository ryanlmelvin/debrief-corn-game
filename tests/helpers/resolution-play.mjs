import assert from 'node:assert/strict';
import { advance } from '../../docs/engine.js';
import { rescueStatus } from '../../docs/rescue.js';
import { transmissionStatus, transmissionHorror, TRANSMISSION_DELAY } from '../../docs/transmission.js';
import { vacancyAction, vacancyStatus } from '../../docs/vacancy.js';
import { resolutionGameAction, resolutionGameActive } from '../../docs/resolution-games.js';

// Search only legal card inputs on copies of one round, then replay the winning
// sequence through the same public story actions as the UI. The helper does not
// assign progress, draft awards, shuffle state, or a completed activity.
function vacancyRoundActions(initial) {
  let visited = 0;
  const search = (state, path) => {
    assert.ok(++visited < 25000, 'a real vacancy round must have a bounded playable solution');
    const status = vacancyStatus(state);
    if (status.stage === 'draft' || status.stage === 'complete') return path;
    if (status.stage === 'failed') return null;
    const cards = status.hand.filter(card => card.playable).sort((a, b) =>
      (b.progressGain - b.scrutinyChange * .7) - (a.progressGain - a.scrutinyChange * .7));
    const actions = cards.map(card => `play:${card.id}`);
    if (status.progress >= status.goal && status.scrutiny <= status.approvalLimit) actions.unshift('end-turn');
    else actions.push('end-turn');
    for (const action of actions) {
      const next = structuredClone(state);
      if (!vacancyAction(next, action)) continue;
      const result = search(next, [...path, action]);
      if (result) return result;
    }
    return null;
  };
  const actions = search(structuredClone(initial), []);
  assert.ok(actions, 'the earned starting deck must be able to pass this interview round');
  return actions;
}

// Current rules carry scrutiny across all three files. Search the entire real
// sequence, including automatic file changes, so a local win cannot hide a
// later dead end. Historical fixtures keep the old round/draft replay above.
function vacancyGameActions(initial, target = 'complete') {
  let visited = 0;
  const seen = new Set();
  const search = (state, path) => {
    assert.ok(++visited < 25000, 'the three-hand vacancy replay must stay bounded');
    const status = vacancyStatus(state);
    if (status.stage === target) return path;
    if (['complete', 'failed'].includes(status.stage)) return null;
    const key = JSON.stringify({ round: state.round, progress: state.progress, scrutiny: state.scrutiny,
      amendment: state.amendment, hand: state.hand, draw: state.draw, discard: state.discard,
      deck: state.deck, awards: state.awards, rng: state.rng });
    if (seen.has(key)) return null;
    seen.add(key);
    const cards = status.hand.filter(card => card.playable).sort((a, b) =>
      target === 'failed' ? b.scrutinyChange - a.scrutinyChange || a.progressGain - b.progressGain :
        (b.progressGain - b.scrutinyChange * .7) - (a.progressGain - a.scrutinyChange * .7));
    for (const card of cards) {
      const action = `play:${card.id}`, next = structuredClone(state);
      if (!vacancyAction(next, action)) continue;
      const result = search(next, [...path, action]);
      if (result) return result;
    }
    return null;
  };
  const actions = search(structuredClone(initial), []);
  assert.ok(actions, `the actual three-hand fixture must reach ${target} through player actions`);
  return actions;
}

export function failVacancyGame(game, afterAction = () => {}) {
  assert.equal(game.resolution?.activity?.kind, 'vacancy');
  assert.ok(game.resolution.activity.state.version >= 3);
  for (const action of vacancyGameActions(game.resolution.activity.state, 'failed')) {
    assert.equal(resolutionGameAction(game, action), true);
    afterAction(game, action);
  }
  assert.equal(game.resolution.activity.state.stage, 'failed');
  return game;
}

// Replay player controls against the real clock. Never edit progress or inject a
// completed activity: ending, save and hint fixtures must earn their final choice.
export function solveResolutionGame(game, afterVacancyAction = () => {}) {
  if (!resolutionGameActive(game)) return game;
  const activity = game.resolution.activity;
  if (activity.kind === 'vacancy') {
    if (activity.state.version >= 3) {
      for (const action of vacancyGameActions(activity.state)) {
        assert.equal(resolutionGameAction(game, action), true);
        afterVacancyAction(game, action);
      }
      assert.equal(activity.state.stage, 'complete');
      return game;
    }
    for (let rounds = 0; resolutionGameActive(game); rounds++) {
      assert.ok(rounds < 6, 'the real vacancy replay has three rounds and two drafts');
      const status = vacancyStatus(activity.state);
      const actions = status.stage === 'draft'
        ? [`draft:${status.draft.find(card => card.id === 'procedure-scope' || card.id === 'procedure-precedent').id}`]
        : vacancyRoundActions(activity.state);
      for (const action of actions) {
        assert.equal(resolutionGameAction(game, action), true);
        afterVacancyAction(game, action);
      }
    }
    assert.equal(activity.state.stage, 'complete');
    return game;
  }
  if (activity.kind === 'transmission') {
    for (let frame = 0; resolutionGameActive(game); frame++) {
      assert.ok(frame < 5000, 'the real transmission replay must finish');
      const status = transmissionStatus(activity.state);
      if (status.canTurn && !transmissionHorror(activity.state, activity.state.crossing, activity.state.time + TRANSMISSION_DELAY).present) assert.equal(resolutionGameAction(game, 'turn'), true);
      else if (status.canAdvance && status.arrivalSafe) assert.equal(resolutionGameAction(game, 'advance'), true);
      advance(game, .05);
    }
    assert.equal(activity.state.stage, 'complete');
    return game;
  }
  assert.equal(activity.kind, 'rescue', 'the replay must explicitly support each new game');
  let turns = 0;
  while (!rescueStatus(activity.state).aligned) {
    assert.equal(resolutionGameAction(game, 'later'), true);
    assert.ok(++turns <= 24, 'the tape must have a reachable alignment');
  }
  if (activity.state.stage === 'align') assert.equal(resolutionGameAction(game, 'align'), true);
  for (let frame = 0; resolutionGameActive(game); frame++) {
    assert.ok(frame < 5000, 'the real rescue replay must finish');
    const status = rescueStatus(activity.state);
    if (status.needsRelease) assert.equal(resolutionGameAction(game, 'release'), true);
    else if (status.canPull && !status.holding) assert.equal(resolutionGameAction(game, 'pull'), true);
    advance(game, .05);
  }
  assert.equal(activity.state.stage, 'complete');
  return game;
}
