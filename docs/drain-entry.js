import { nearbySite } from './engine.js';
import { rogueOptions } from './rogue.js';

export function drainEntryContent(game) {
  const lantern = game.fieldEvents.flags.includes('lantern');
  return `<span>Follow the drain below ground ↘<small>${lantern ? 'Your lantern reveals steps beneath the waterline.' : 'Too dark without a lantern.'}</small><small class="ending-requirements"><span class="ending-requirement ${lantern ? 'requirement-met' : 'requirement-unmet'}"><span aria-hidden="true">${lantern ? '✓' : '✗'}</span> <span class="sr-only">${lantern ? 'Met' : 'Unmet'}: </span>Acquired lantern</span></small></span>`;
}

export function drainEntryMarkup(game) {
  if (game.phase !== 'field' || nearbySite(game)?.id !== 'drain' || !game.inspected.includes('drain')) return '';
  const option = rogueOptions(game).find(option => option.id === 'dungeon');
  return `<button class="choice" data-action="dungeon-enter" ${option.disabled ? 'disabled' : ''}>${drainEntryContent(game)}</button>`;
}
