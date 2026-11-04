import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDINGS } from '../docs/engine.js';

// An audit record, not a second set of game rules. Adding an ending must trigger
// a deliberate review of hints and regression tests before it can be published.
const reviewed = (coverage, rationale) => Object.freeze({ coverage, rationale });
export const REVIEWED_ENDING_HINTS = Object.freeze({
  witness: reviewed('direct', 'The enabled final evidence response is simulated through the real witness gate.'),
  guide: reviewed('recovery', 'Actual free movement reaches the northeast corner after skipping both optional clues, either one, or neither in either order. Every path retains the original guarded spare action and recorded interview, with only genuinely discovered clues saved. Spared personnel reach this identity; a loaded rifle still permits interruption after an ordinary answer. Entry retains all four recovery identities, every missing reachable identity vetoes its hint, and walking, looking and inspection stay unmarked. Previews preserve navigation, saves, testimony, collection history and randomness.'),
  compliance: reviewed('direct', 'Final signing is simulated with current honesty rather than assigned a fixed outcome.'),
  dissent: reviewed('direct', 'Final signing is simulated with current honesty rather than assigned a fixed outcome.'),
  breach: reviewed('conservative', 'Six real watch breaches retain this identity; pump rupture now has its own identity. Open entries remain conservative.'),
  assimilation: reviewed('direct', 'Putting down roots is terminal; timed failures remain conservative, and 100 exposure starts a route. Real Transmission row collisions and failed delayed turns reach the forced Corn introduction, where rooting still awards this identity.'),
  consumption: reviewed('direct', 'Eating is simulated only when the current pump scene actually permits it.'),
  guide_arrested: reviewed('recovery', 'Free exploration reaches the actual corner encounter with zero, one or both optional discoveries. On every such path, one missed shot followed by surviving witnesses, and all six missed shots with empty ammunition, reach the arrested interview and this collection identity. Loaded interviews retain interruption after the first answer; empty interviews do not invent it. Entry bounds and omission vetoes retain every recovery identity without inferring outcomes from skipped clues, discovery order or render time.'),
  guide_interrupted: reviewed('recovery', 'Real free movement reaches the original corner encounter while skipping both optional clues, either one, or visiting both in either order. Loaded-rifle choices after ordinary first answers reach interruption from spared, secured and arrested interviews on every path. The same replays verify that six expended rounds remove that action, and the corner interaction retains its input delay. Every reachable interruption vetoes an all-seen hint when uncollected; live controls remain unmarked and previews consume no ammunition or randomness.'),
  guide_shot: reviewed('recovery', 'After skipping zero, one or both optional discoveries, actual target selection and three rifle hits at the corner produce all three casualties and this distinct collection identity. Both optional discovery orders are covered. Three prior misses exhaust ammunition and exclude interview interruption through real transitions; remaining rounds retain it. Entry preserves the four recovery identities and omission vetoes, with unchanged conservative search/escape bounds, honest partial discovery saves and immutable previews.'),
  relief: reviewed('direct', 'Only the final handover commits; earlier scenes retain every withdrawal destination.'),
  witness_present: reviewed('direct', 'Only the final recording choice commits; earlier scenes retain every withdrawal destination.'),
  rescue: reviewed('direct', 'Real tape alignment and timed hold/release inputs free both boots before the stable final sacrifice can commit. Live inputs remain unmarked; entry and withdrawals conservatively retain every ending. Replays verify rescue, alternate leads, outside evidence, signing and all four recovery identities after withdrawal, while previews preserve saves, testimony, history and randomness.'),
  vacancy: reviewed('direct', 'Real card plays automatically close three files, earning procedures without a submit or draft action, before the stable final approval can commit. Signatures and claims raise carried scrutiny; actual routine replies and narrowing scope reduce it. Interleaving risk and relief wins the same final hand that fails when both calming cards are spent first, including when the last claim simultaneously meets approval and exceeds scrutiny. Failure permits only withdrawal. Card controls stay unmarked; entry, automatic file changes, refusal and failed withdrawal retain the full registry bound. Real continuations reach compatible alternate leads, routine or disputed signing, and all four recovery identities. Locked, unsupported and practice choices acquire no hints. Previewing preserves the source deck, draw order, saves, testimony, collection history and randomness through both risk and relief.'),
  transmission: reviewed('direct', 'The safe first-move tutorial and later delayed controls reach the buried radio before the stable warning can commit. Legacy timing and all first-call memories remain supported. Tutorial and timed controls remain unmarked; entry, pending commands, bends, setbacks and withdrawal retain all endings. Real row collisions and turns delivered into the horror raise exposure to 100, then public Corn movement reaches rooting, containment, roadkill and both escape choices. Withdrawal replays also cover other resolutions, signing and all recovery identities. Previews preserve saves, journal, commands, history and randomness; practice exposure failure cannot enter Corn or earn ending hints.'),
  corn_escape: reviewed('direct', 'The stable finale choice is simulated; crossings and entry remain conservatively bounded. Real Transmission exposure failures enter Corn, and three public-action crossings reach this final choice without fabricated movement or damage state.'),
  corn_uprising: reviewed('direct', 'The stable gate choice is simulated; crossings and entry remain conservatively bounded. Real Transmission exposure failures enter Corn, and three public-action crossings reach this final choice without fabricated movement or damage state.'),
  radio_ghost: reviewed('direct', 'The stable final warning is simulated; timed signal locks are never predicted from a render snapshot.'),
  field_voice: reviewed('direct', 'The stable final command is simulated; timed signal locks are never predicted from a render snapshot.'),
  flood: reviewed('conservative', 'The pipe puzzle remains within open gameplay bounds; its introduction can return to the field.'),
  corn_contained: reviewed('conservative', 'Bullet collisions happen during live movement and remain within open gameplay bounds. Transmission exposure failures reach this identity through actual Corn lane movement and three bullet hits; every prior entry and withdrawal retains it.'),
  roadkill: reviewed('conservative', 'Traffic collisions happen during live movement and remain within open gameplay bounds. Transmission exposure failures reach this identity after two real safe Corn crossings and three traffic hits; every prior entry and withdrawal retains it.'),
  pump_rupture: reviewed('conservative', 'Three disconnected releases use real pump transitions to this distinct failure; entry and withdrawal retain the full registry, puzzle inputs stay unmarked; recovery rejects field-only entry, and omission vetoes cover the new identity.'),
  signal_lost: reviewed('conservative', 'Three real missed carrier locks reach this distinct failure from each radio encounter. Entry and withdrawal retain the full registry; timed locks stay unmarked, recovery rejects field-only entry, and omission vetoes cover this identity.'),
  dungeon_escape: reviewed('direct', 'A real three-floor rifle replay reaches a three-question debrief; all eight answer paths use actual transitions to the existing escape ending. Each interview choice previews its remaining testimony, with no withdrawal or combat input accepted there. The real unattended-lamp take action acquires the required lantern; passing, searching and waiting leave drain entry locked. Acquisition, drain entry, beginning and withdrawal retain all endings; live crawl inputs stay unmarked and committed recovery cannot enter the route.'),
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
