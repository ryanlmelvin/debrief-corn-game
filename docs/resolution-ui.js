import { getResolution } from './alternate-endings.js';
import { scenePlate } from './art.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function resolutionMarkup(game) {
  const scene = getResolution(game);
  if (!scene) return '';
  const menu = game.resolution.route === null;
  const requirements = items => items ? `<small class="ending-requirements">${items.map(r => `<span class="ending-requirement ${r.met ? 'requirement-met' : 'requirement-unmet'}"><span aria-hidden="true">${r.met ? '✓' : '✗'}</span> <span class="sr-only">${r.met ? 'Met' : 'Unmet'}: </span>${escape(r.label)}${r.target > 1 ? ` ${r.current}/${r.target}` : ''}</span>`).join('')}</small>` : '';
  return `<article class="paper resolution-sheet">${menu ? '' : scenePlate(scene.art)}<button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="paper-top"><span>STATION 04</span><span>${escape(scene.eyebrow)}</span></div><h2 id="dialog-title" tabindex="-1">${escape(scene.title)}</h2>${menu ? '<button class="notebook-close" data-action="resolution-answer" data-value="back" aria-label="Back to final debrief">×</button>' : `<span class="question-num" aria-label="Scene ${scene.step} of ${scene.total}">${scene.step} / ${scene.total}</span>`}<div class="resolution-story">${scene.prompt.split('\n\n').map(p => `<p>${escape(p)}</p>`).join('')}</div>${scene.context ? `<p class="note">${escape(scene.context)}</p>` : ''}<section class="${menu ? 'resolution-leads' : 'choices'}" role="group" aria-label="${menu ? 'Your options' : 'Your choice'}">${scene.options.map(option => `<button class="choice" data-action="resolution-answer" data-value="${escape(option.id)}" ${option.disabled ? 'disabled' : ''}><span>${escape(option.label)}${option.detail ? `<small>${escape(option.detail)}</small>` : ''}${requirements(option.requirements)}</span></button>`).join('')}</section></article>`;
}
