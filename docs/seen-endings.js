// A hint is a claim about EVERY continuation, not just the intended route.
// Preview real transitions on copies; uncertainty must never discourage a choice.
import { ENDINGS, answer, endingId, getQuestion, eatCrop, chooseFieldEncounter } from './engine.js';
import { getResolution, chooseResolution } from './alternate-endings.js';
import { resolutionGameActive } from './resolution-games.js';
import { guideDebrief, answerGuideDebrief, spareGuide } from './guide.js';
import { startRogue, chooseRogue, getRogueScene } from './rogue.js';

export const SEEN_ENDINGS_NOTE = "You've already seen all these endings.";
const clone = value => JSON.parse(JSON.stringify(value));
const transitions = new Map([
  ['answer', answer], ['resolution-answer', chooseResolution],
  ['guide-answer', answerGuideDebrief], ['eat-crop', eatCrop],
  ['encounter-choice', chooseFieldEncounter], ['guide-spare', spareGuide],
  ['rogue-start', startRogue], ['rogue-choice', chooseRogue]
]);

// Once committed to recovery, these existing endings are unreachable. Keep an
// exclusion list, not a guide-ending whitelist: newly added endings stay possible
// until explicitly reviewed. Retain all four recovery outcomes even when some
// have become impossible; false negatives are preferable to misleading hints.
const outsideRecovery = new Set([
  'consumption', 'witness', 'compliance', 'dissent', 'breach', 'assimilation',
  'relief', 'witness_present', 'rescue', 'vacancy', 'transmission',
  'corn_escape', 'corn_uprising', 'radio_ghost', 'field_voice', 'flood',
  'corn_contained', 'roadkill', 'dungeon_escape', 'dungeon_lost'
]);

function decisionKey(s) {
  // Withdrawals add archival resolution transcripts but change no gameplay
  // prerequisites. Ignore only those old entries when recognizing a loop. Keep
  // the active route's entire transcript: validResolution checks it on every move.
  const active = s.phase === 'resolution' ? s.resolution?.answers?.length || 0 : 0;
  const reports = s.reports.filter(report => report.kind !== 'resolution');
  if (active) reports.push(...s.reports.slice(-active));
  return JSON.stringify({ ...s, reports });
}

function continuations(s) {
  if (s.phase === 'debrief' && s.shift === 2 && [0, 1, 2].includes(s.question)) {
    return { action: 'answer', options: getQuestion(s).options };
  }
  if (s.phase === 'resolution') return { action: 'resolution-answer', options: getResolution(s)?.options };
  if (s.phase === 'guide' && s.guide?.stage === 'debrief') return { action: 'guide-answer', options: guideDebrief(s)?.options };
  if (s.phase === 'rogue' && ['intro', 'choice', 'debrief'].includes(s.rogue?.stage)) return { action: 'rogue-choice', options: getRogueScene(s)?.options };
  return null;
}

export function possibleChoiceEndings(game, action, value) {
  const transition = transitions.get(action);
  // Practice has no ending-collection provenance, even when it uses the same
  // scenes and terminal transitions as an assignment.
  if (!game || game.practice || game.phase === 'ending' || !transition) return null;
  // Minigame inputs include both timed controls and turn-based combat. Do not
  // infer the remaining crawl (or a later timed click) from one rendered input.
  if (action === 'rogue-choice' && !['intro', 'choice', 'debrief'].includes(game.rogue?.stage)) return null;
  try {
    const next = clone(game);
    // Contextual radio/root choices use the real encounter transition, just as
    // pump/drain entry uses the real location gate. Exposure, scene variants and
    // the acquired lantern are never duplicated in hint metadata.
    if (!transition(next, value)) return null;
    const pending = [next], visited = new Set(), endings = new Set();
    while (pending.length) {
      const state = pending.pop();
      if (state.phase === 'ending') {
        const id = endingId(state);
        if (!Object.hasOwn(ENDINGS, id)) return null;
        endings.add(id);
        continue;
      }
      // Open gameplay includes timing, exposure, random events and later nights.
      // We make no claims about pruning it: every registered ending stays possible.
      if (['briefing', 'tower', 'decision', 'field'].includes(state.phase) ||
          (state.phase === 'debrief' && state.shift < 2) ||
          (state.phase === 'rogue' && state.rogue?.stage === 'play') ||
          resolutionGameActive(state)) {
        Object.keys(ENDINGS).forEach(id => endings.add(id));
        continue;
      }
      if (state.phase === 'guide' && ['search', 'escape'].includes(state.guide?.stage)) {
        Object.keys(ENDINGS).filter(id => !outsideRecovery.has(id)).forEach(id => endings.add(id));
        continue;
      }
      const key = decisionKey(state);
      if (visited.has(key)) continue;
      visited.add(key);
      // A future branch that exceeds the analysis budget is unknown, never empty.
      if (visited.size > 600) return null;
      const choices = continuations(state);
      const enabled = choices?.options?.filter(option => !option.disabled);
      if (!enabled?.length) return null;
      for (const option of enabled) {
        const branch = clone(state);
        if (!transitions.get(choices.action)(branch, option.id)) return null;
        pending.push(branch);
      }
    }
    return endings.size ? [...endings].sort() : null;
  } catch {
    return null;
  }
}

export function hasSeenChoiceEndings(game, action, value, collected) {
  if (!Array.isArray(collected) || !collected.length) return false;
  const endings = possibleChoiceEndings(game, action, value);
  return !!endings?.length && endings.every(id => collected.includes(id));
}

export function markSeenEndingChoices(root, game, collected) {
  for (const button of root.querySelectorAll('button[data-action]')) {
    const existing = button.querySelector('.seen-endings-note');
    if (button.disabled || button.classList.contains('notebook-close') ||
        !hasSeenChoiceEndings(game, button.dataset.action, button.dataset.value, collected)) {
      existing?.remove();
      continue;
    }
    if (existing) continue;
    const note = root.ownerDocument.createElement('small');
    note.className = 'seen-endings-note';
    const full = root.ownerDocument.createElement('span');
    full.className = 'seen-endings-full';
    full.textContent = SEEN_ENDINGS_NOTE;
    const compact = root.ownerDocument.createElement('span');
    compact.className = 'seen-endings-compact';
    compact.setAttribute('aria-hidden', 'true');
    compact.textContent = 'All endings already seen.';
    note.append(full, compact);
    const label = button.querySelector(':scope > span:not(.response-key)');
    (label || button).append(note);
  }
}
