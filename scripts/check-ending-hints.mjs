import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDINGS } from '../docs/engine.js';

// An audit record, not a second set of game rules. Adding an ending must trigger
// a deliberate review of hints and regression tests before it can be published.
const reviewed = (coverage, rationale) => Object.freeze({ coverage, rationale });
export const REVIEWED_ENDING_HINTS = Object.freeze({
  witness: reviewed('direct', 'The enabled final evidence response is simulated through the real witness gate.'),
  guide: reviewed('recovery', 'Recovery can spare the team; an interview interruption remains possible while ammunition remains.'),
  compliance: reviewed('direct', 'Final signing is simulated with current honesty rather than assigned a fixed outcome.'),
  dissent: reviewed('direct', 'Final signing is simulated with current honesty rather than assigned a fixed outcome.'),
  breach: reviewed('conservative', 'Watch failures and disconnected pump releases remain within open gameplay bounds.'),
  assimilation: reviewed('direct', 'Putting down roots is terminal; timed failures remain conservative, and 100 exposure starts a route.'),
  consumption: reviewed('direct', 'Eating is simulated only when the current pump scene actually permits it.'),
  guide_arrested: reviewed('recovery', 'Surviving witnesses after firing have their own ending identity, including when every shot missed.'),
  guide_interrupted: reviewed('recovery', 'Loaded-rifle interview choices remain reachable after ordinary first answers.'),
  guide_shot: reviewed('recovery', 'All three casualties have a distinct identity; remaining ammunition may still permit interruption.'),
  relief: reviewed('direct', 'Only the final handover commits; earlier scenes retain every withdrawal destination.'),
  witness_present: reviewed('direct', 'Only the final recording choice commits; earlier scenes retain every withdrawal destination.'),
  rescue: reviewed('direct', 'Only leaving the recordings commits; earlier scenes retain every withdrawal destination.'),
  vacancy: reviewed('direct', 'Approval commits; signing the release and refusing approval still allow withdrawal.'),
  transmission: reviewed('direct', 'Only the final broadcast commits; earlier scenes retain every withdrawal destination.'),
  corn_escape: reviewed('direct', 'The stable finale choice is simulated; crossings and entry remain conservatively bounded.'),
  corn_uprising: reviewed('direct', 'The stable gate choice is simulated; crossings and entry remain conservatively bounded.'),
  radio_ghost: reviewed('direct', 'The stable final warning is simulated; timed signal locks are never predicted from a render snapshot.'),
  field_voice: reviewed('direct', 'The stable final command is simulated; timed signal locks are never predicted from a render snapshot.'),
  flood: reviewed('conservative', 'The pipe puzzle remains within open gameplay bounds; its introduction can return to the field.'),
  corn_contained: reviewed('conservative', 'Bullet collisions happen during live movement and remain within open gameplay bounds.'),
  roadkill: reviewed('conservative', 'Traffic collisions happen during live movement and remain within open gameplay bounds.'),
  dungeon_escape: reviewed('conservative', 'A human guard reaches the keyed surface exit in a real three-floor replay using movement, rifle fire and reloading. Drain entry, beginning and withdrawal keep all endings regardless of ammunition; turn controls stay unmarked. Field-only entry is unavailable throughout committed recovery.'),
  dungeon_lost: reviewed('conservative', 'Real waiting turns let roots reduce the human guard’s condition to zero. The loss remains in every drain entry and introduction bound alongside escape and withdrawal outcomes; rifle, reload and other turn inputs stay unmarked. Recovery cannot enter the field-only route.')
});

export function validateEndingHintCoverage(endings = ENDINGS) {
  if (!endings || typeof endings !== 'object' || Array.isArray(endings)) throw Error('An ending registry is required.');
  const ids = Object.keys(endings), reviewedIds = Object.keys(REVIEWED_ENDING_HINTS);
  const unreviewed = ids.filter(id => !Object.hasOwn(REVIEWED_ENDING_HINTS, id));
  const stale = reviewedIds.filter(id => !Object.hasOwn(endings, id));
  const invalid = reviewedIds.filter(id => {
    const entry = REVIEWED_ENDING_HINTS[id];
    return !['direct', 'recovery', 'conservative'].includes(entry.coverage) || typeof entry.rationale !== 'string' || !entry.rationale.trim();
  });
  const problems = [
    unreviewed.length && `Unreviewed endings: ${unreviewed.join(', ')}.`,
    stale.length && `Stale ending reviews: ${stale.join(', ')}.`,
    invalid.length && `Invalid ending reviews: ${invalid.join(', ')}.`
  ].filter(Boolean);
  if (problems.length) throw Error(`${problems.join(' ')} Review docs/seen-endings.js and its regression tests, then update scripts/check-ending-hints.mjs. Do not add an audit entry without checking every reachable unseen ending.`);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    validateEndingHintCoverage();
    console.log(`Ending hint audit covers all ${Object.keys(ENDINGS).length} endings.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
