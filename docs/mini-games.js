import { createGame, startShift, enterField, inspect, SHIFT_LENGTH, ENDINGS } from './engine.js';
import { startRogue, chooseRogue } from './rogue.js';
import { startResolution, chooseResolution } from './alternate-endings.js';
import { RESOLUTION_GAMES } from './resolution-games.js';
import { ENDING_PATHS } from './ending-paths.js';
import { ENCOUNTERS } from './encounters.js';

export const MINI_GAMES = Object.freeze([
  { id: 'watch', title: 'Watchtower', description: 'Hold the post for one watch. Contain the corn, reload, and protect the perimeter.' },
  { id: 'corn', title: 'Corn Escape', description: 'Dodge two fields of rifle fire, then cross the road between passing cars.' },
  { id: 'broadcast', title: 'Radio Tuning', description: 'Catch three moving signals inside the gold band.' },
  { id: 'flood', title: 'Pump Puzzle', description: 'Rotate the pipes to connect the treatment pump to the field outlet.' },
  { id: 'dungeon', title: 'Dungeon Crawler Corn', description: 'Take your rifle beneath the drain. Find three keys and climb back out.' },
  { id: 'rescue', title: 'Roots & Recordings', description: 'Match the two voices. Pull while the roots loosen and free both boots.' },
  { id: 'transmission', title: 'The Other Tower', description: 'Guide your earlier self through moving rows with delayed radio commands.' }
].map(game => Object.freeze(game)));

/** Keep persisted unlocks small, unique, and in the menu's stable display order. */
export function normalizeMiniGameUnlocks(ids) {
  const requested = new Set(Array.isArray(ids) ? ids : []);
  return MINI_GAMES.filter(game => requested.has(game.id)).map(game => game.id);
}

/** Read actual story entry receipts, including transcripts from older completed runs. */
export function getMiniGameUnlocks(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return [];
  // Preview and practice must never become evidence merely because their
  // simulations use the real transition functions and produce real reports.
  if (Object.hasOwn(state, 'practice') || Object.hasOwn(state, 'preview') ||
      [state.runId, state.id].some(id => typeof id === 'string' && id.startsWith('practice-'))) return [];
  const reports = Array.isArray(state.reports) ? state.reports : [];
  const unlocked = reports.filter(report => report?.kind === 'rogue' && report.choice === 'begin')
    .map(report => report.rogueRoute).filter(id => id !== 'watch');
  for (const report of reports) {
    if (report?.kind === 'resolution' && report.resolutionGame === report.resolutionRoute &&
        report.resolutionStep === 1 && report.choice === { rescue: 'rescue-carry', transmission: 'transmission-listen' }[report.resolutionGame] &&
        RESOLUTION_GAMES.includes(report.resolutionGame)) unlocked.push(report.resolutionGame);
  }
  // All genuine story states beyond the first briefing have entered a watch.
  // An archived ending also proves this, including a breach with no transcript.
  const enteredWatch = ['tower', 'decision', 'field', 'debrief', 'resolution', 'rogue', 'guide', 'ending'].includes(state.phase)
    || state.phase === 'briefing' && Number.isInteger(state.shift) && state.shift > 0
    || state.phase === undefined && typeof state.id === 'string' && Object.hasOwn(ENDINGS, state.ending) && Array.isArray(state.reports);
  if (enteredWatch || unlocked.some(id => MINI_GAMES.some(game => game.id === id))) unlocked.push('watch');
  return normalizeMiniGameUnlocks(unlocked);
}

/** Every practice session owns a fresh game object and a persistent provenance marker. */
export function createMiniGame(id, mode = 'story', seed = Date.now()) {
  if (!MINI_GAMES.some(game => game.id === id)) return null;
  const s = createGame(mode, seed);
  startShift(s);
  if (RESOLUTION_GAMES.includes(id)) {
    Object.assign(s, { phase: 'debrief', shift: 2, question: 2, targets: [] });
    // Practice supplies the route's actual journal prerequisites, then enters
    // through the same scenes/actions as a normal assignment.
    const events = ENDING_PATHS[id].requirements.flatMap(requirement => requirement.events || []);
    if (id === 'transmission') events.unshift({ id: 'first-call', choices: ['record'] });
    for (const event of events) {
      const selected = ENCOUNTERS.find(entry => entry.id === event.id).choices.find(choice => event.choices.includes(choice.id));
      s.fieldEvents.seen.push(event.id);
      s.fieldEvents.journal.push({ id: event.id, choice: selected.id, delta: selected.delta, x: 4, y: 4 });
      if (selected.flag && !s.fieldEvents.flags.includes(selected.flag)) s.fieldEvents.flags.push(selected.flag);
    }
    if (!startResolution(s) || !chooseResolution(s, id)) return null;
    for (const action of { rescue: ['rescue-radio', 'rescue-carry'], transmission: ['transmission-tower', 'transmission-listen'] }[id]) if (!chooseResolution(s, action)) return null;
  } else if (id !== 'watch') {
    // Practice skips the assignment, while route setup and every playable action
    // still pass through the same transition functions used by the story.
    s.incident = true;
    enterField(s);
    if (id === 'corn') s.exposure = 100;
    if (id === 'flood' || id === 'dungeon') {
      s.player = id === 'flood' ? { x: 3, y: 3 } : { x: 7, y: 5 };
      inspect(s);
    }
    if (!startRogue(s, id) || !chooseRogue(s, 'begin')) return null;
  }
  s.practice = id;
  s.runId = `practice-${id}-${s.runId}`;
  return s;
}

export function miniGameComplete(s) {
  if (!s || !MINI_GAMES.some(game => game.id === s.practice)) return false;
  if (s.practice === 'watch') return s.phase !== 'tower';
  if (RESOLUTION_GAMES.includes(s.practice)) return s.resolution?.activity?.kind === s.practice &&
    (s.resolution.activity.state.stage === 'complete' || s.practice === 'transmission' && s.exposure >= 100);
  return s.rogue?.route === s.practice && (s.phase === 'ending' || s.rogue.stage === 'choice');
}

export function miniGameResult(s) {
  if (!miniGameComplete(s)) return null;
  const id = s.practice;
  let success = false, title, message;
  if (id === 'watch') {
    success = s.phase === 'field' && s.time >= SHIFT_LENGTH && s.breaches < 6;
    title = success ? 'Watch complete.' : s.phase === 'ending' ? 'The perimeter broke.' : 'You left the post.';
    message = `${s.kills} crops contained · ${s.breaches} perimeter breaches.`;
  } else if (id === 'corn') {
    success = s.rogue.stage === 'choice' || ['corn_escape', 'corn_uprising'].includes(s.ending);
    title = success ? 'You made it across.' : 'The crossing caught you.';
    message = success ? 'Both fields and the road are behind you.' : 'Try the cover in the ditch and the road’s center median.';
  } else if (id === 'broadcast') {
    success = s.rogue.stage === 'choice' || ['radio_ghost', 'field_voice'].includes(s.ending);
    title = success ? 'All three signals locked.' : 'The signal slipped away.';
    message = `${s.rogue.locks} of 3 carriers locked · ${s.rogue.hits} missed locks.`;
  } else if (id === 'flood') {
    success = s.ending === 'flood';
    title = success ? 'The pipes are connected.' : 'The pressure broke the seals.';
    message = success ? 'Treatment reaches the field outlet.' : 'Join the inlet to the outlet before releasing the pressure.';
  } else if (id === 'rescue') {
    success = true;
    title = 'Both boots are free.';
    message = 'The voices hold the roots loose. In the story, carrying the person out means leaving the recordings behind.';
  } else if (id === 'transmission') {
    success = s.resolution.activity.state.stage === 'complete' && s.exposure < 100;
    title = success ? 'You found your way back.' : 'The field found you.';
    message = success ? `All three crossings cleared · ${s.resolution.activity.state.commands} commands sent · ${s.resolution.activity.state.setbacks} crossings retried.` :
      'Exposure reached 100. Watch the moving rows and try again.';
  } else {
    success = s.ending === 'dungeon_escape';
    title = success ? 'Back above ground.' : 'The roots closed in.';
    message = `Floor ${s.rogue.dungeon.floor + 1} of 3 · ${s.rogue.dungeon.turn} turns · ${s.rogue.dungeon.kills} roots stopped.`;
  }
  const reply = id === 'dungeon' && success && s.rogue.debrief?.answers.length === 3
    ? s.reports.find(report => report.dungeonDebriefIndex === 2)?.supervisorReply : null;
  return { id, title, success, message, ...(reply ? { reply } : {}) };
}
