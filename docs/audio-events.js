import { encounterAudioCue } from './encounters.js';
// Observe progress even while muted, so resuming never replays an old scare.
function snapshot(game) {
  const encounter = encounterAudioCue(game);
  return {
    run: game?.runId, phase: game?.phase, night: game?.shift || 0,
    steps: game?.phase === 'field' ? game.fieldSteps : game?.phase === 'guide' ? Math.floor(game.guide.steps) : 0,
    encounter: encounter ? { id: encounter.id, choice: encounter.choice } : null,
    watch: {
      bells: game?.watch?.bellsUsed || 0, rushes: game?.watch?.rushesWon || 0,
      flares: game?.watch?.flaresEarned || 0, reloads: game?.watch?.fastReloads || 0
    }
  };
}

export class SoundEvents {
  reset(game) { this.previous = snapshot(game); }
  update(game, sound, enabled, style = 'quiet') {
    const next = snapshot(game), previous = this.previous;
    this.previous = next;
    if (!enabled || !sound || !previous || next.run !== previous.run || next.phase !== previous.phase || next.night !== previous.night) return;
    if (next.phase === 'tower') {
      // One acknowledgment per action: winning a rush also awards a flare.
      const cue = next.watch.bells > previous.watch.bells ? 'bell'
        : next.watch.rushes > previous.watch.rushes ? 'rush'
        : next.watch.flares > previous.watch.flares ? 'flare'
        : next.watch.reloads > previous.watch.reloads ? 'reload' : null;
      if (cue) sound.watchCue(cue);
    }
    if (next.steps > previous.steps) sound.step({ night: next.night, style });
    const event = next.encounter;
    if (event && (event.id !== previous.encounter?.id || event.choice !== previous.encounter?.choice)) {
      sound.cueEncounter(event, next.night);
    }
  }
}
