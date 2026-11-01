import assert from 'node:assert/strict';
import { advance } from '../../docs/engine.js';
import { rescueStatus } from '../../docs/rescue.js';
import { transmissionStatus, transmissionHorror, TRANSMISSION_DELAY } from '../../docs/transmission.js';
import { resolutionGameAction, resolutionGameActive } from '../../docs/resolution-games.js';

// Replay player controls against the real clock. Never edit progress or inject a
// completed activity: ending, save and hint fixtures must earn their final choice.
export function solveResolutionGame(game) {
  if (!resolutionGameActive(game)) return game;
  const activity = game.resolution.activity;
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
