import { encounterAudioCue } from './encounters.js';
// Observe progress even while muted, so resuming never replays an old scare.
function snapshot(game) {
  const encounter = encounterAudioCue(game);
  return {
    run: game?.runId, phase: game?.phase, night: game?.shift || 0,
    steps: game?.phase === 'field' ? game.fieldSteps : game?.phase === 'guide' ? Math.floor(game.guide.steps) : 0,
    encounter: encounter ? { id: encounter.id, choice: encounter.choice } : null
  };
}

export class SoundEvents {
  reset(game) { this.previous = snapshot(game); }
  update(game, sound, enabled, style = 'quiet') {
    const next = snapshot(game), previous = this.previous;
    this.previous = next;
    if (!enabled || !sound || !previous || next.run !== previous.run || next.phase !== previous.phase || next.night !== previous.night) return;
    if (next.steps > previous.steps) sound.step({ night: next.night, style });
    const event = next.encounter;
    if (event && (event.id !== previous.encounter?.id || event.choice !== previous.encounter?.choice)) {
      sound.cueEncounter(event, next.night);
    }
  }
}
