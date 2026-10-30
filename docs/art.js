import { EVIDENCE } from './engine.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const FIELD_ART = {
  corner: { file: 'field-corner', caption: 'Northeast corner / first field impression', alt: 'Torn white cotton caught in a corn stalk beside the perimeter fence.' },
  pump: { file: 'field-pump', caption: 'Pump house / treatment station', alt: 'A dim pump shed with rusting pipes, treatment drums and an old ledger.' },
  drain: { file: 'field-drain', caption: 'Drainage channel / below the root line', alt: 'Pale roots spread across a muddy drainage ditch and dark water.' },
  tower: { file: 'station-kit', caption: 'Station 04 / issued equipment', alt: 'A worn field radio, binoculars, pocket notebook and brass cartridges on the tower sill.' },
  sighting: { file: 'field-sighting', caption: 'Northeast perimeter / something moved', alt: 'A distant pale human figure disappears between corn rows, seen from the watchtower.' },
  stove: { file: 'pump-stove', caption: 'Pump house / do not consume the crop', alt: 'Corn steams on a camping stove beside a clean plate, butter and salt in the dirty pump shed.' },
  debrief: { file: 'debrief-desk', caption: 'Interview room / recording in progress', alt: 'A reel-to-reel recorder and blank report sheets on a worn desk under lamplight.' }
};
export const SPECIMENS = {
  dress: { cell: 0, site: 'corner' }, ledger: { cell: 1, site: 'pump' }, roots: { cell: 2, site: 'drain' },
  badge: { cell: 3, site: 'corner' }, sample: { cell: 4, site: 'pump' }, teeth: { cell: 5, site: 'corner' },
  map: { cell: 6, site: 'drain' }, water: { cell: 7, site: 'drain' }, glove: { cell: 8, site: 'pump' }
};

export function scenePlate(site, caption = FIELD_ART[site]?.caption) {
  const art = FIELD_ART[site];
  if (!art) return '';
  return `<figure class="scene-plate"><img src="./assets/${art.file}.webp" alt="${art.alt}" width="1200" height="800">${caption?`<figcaption>${escape(caption)}</figcaption>`:''}</figure>`;
}

export function specimenStudy(id) {
  const specimen = SPECIMENS[id], evidence = EVIDENCE[id];
  if (!specimen || !evidence) return '';
  const x = specimen.cell % 3, y = Math.floor(specimen.cell / 3);
  return `<figure class="specimen-study"><div class="specimen-drawing" role="img" aria-label="Field sketch: ${escape(evidence.title)}" style="background-position:${x * 50}% ${y * 50}%"></div><figcaption>${escape(evidence.code)} / FIELD STUDY</figcaption></figure>`;
}

export function evidenceMount(id) {
  const specimen = SPECIMENS[id];
  return specimen ? `<div class="evidence-mount">${scenePlate(specimen.site)}${specimenStudy(id)}</div>` : '';
}

export function dialogArtwork(kind, shift = 0) {
  if (kind === 'debrief') return `<div class="interview-scene">${scenePlate('debrief', '')}<span class="recording-label"><i></i> REC / TAPE 0${shift + 1}</span></div>`;
  if (['briefing', 'manual', 'guide-intro'].includes(kind)) return scenePlate('tower');
  if (kind === 'sighting') return scenePlate('sighting');
  if (['ending', 'records'].includes(kind)) return scenePlate('debrief', 'Station archive / retained copy');
  if (kind === 'corn') return scenePlate('stove');
  return '';
}

const landmarkPaths = {
  tower: '<path d="M20 28L16 58M44 28L49 58M18 45L46 30M18 30L47 46M25 29V58M32 29V58M25 36H32M25 43H32M25 50H32M15 16H49V29H15ZM10 16L32 6L54 16M20 20V25M38 20V25"/>',
  pump: '<path d="M10 28L32 12L54 28M15 25V54H49V25M25 54V34H37V54M9 55H55M43 12V20M40 12H46M17 29H23M41 29H47"/><path d="M7 42H12V52H7ZM52 38H58V52H52"/>',
  corner: '<path d="M9 53V24M55 53V24M9 30H55M9 42H55M15 27L20 33M38 39L43 45M33 54V13M33 28Q15 24 19 16Q31 15 33 28M33 39Q51 34 47 27Q35 27 33 39M33 18L28 8M33 18L38 8"/>',
  drain: '<path d="M7 21Q17 13 29 21T57 21M7 45Q17 37 29 45T57 45M10 53Q20 45 32 53T57 53M16 36V27Q16 11 32 11T48 27V36M24 34V27Q24 19 32 19T40 27V34M26 39Q32 35 38 39"/>'
};
export function landmarkDrawing(id) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${landmarkPaths[id] || ''}</svg>`;
}

export function notebookMarkup(game, requestedPage = 0) {
  const pages = [...game.evidence];
  if (game.reports.length) pages.push('testimony');
  if (!pages.length) pages.push('empty');
  const page = Math.max(0, Math.min(pages.length - 1, Number(requestedPage) || 0)), id = pages[page];
  let content;
  if (id === 'empty') content = `${scenePlate('tower')}<h3>A place for what you saw.</h3><p>The pages are still empty.</p>`;
  else if (id === 'testimony') content = `<h3>What went on record.</h3><div class="notebook-testimony">${game.reports.map(r => `<section><p class="eyebrow">SHIFT 0${r.shift + 1}</p><h4>${escape(r.question)}</h4><p>${r.redacted ? '<span class="withheld-note">Observation withheld</span> ' : ''}${escape(r.answer)}</p>${r.supervisorReply ? `<p class="pencil-note">Supervisor: ${escape(r.supervisorReply)}</p>` : ''}</section>`).join('')}</div>`;
  else {
    const e = EVIDENCE[id];
    content = `<p class="eyebrow">${escape(e.code)} / ${escape(e.where)}</p><h3>${escape(e.title)}</h3>${evidenceMount(id)}<p class="handwritten-observation">${escape(e.text)}</p>`;
  }
  return `<article class="field-notebook"><header class="notebook-header"><div><p class="eyebrow">STATION 04 / PERSONAL EFFECTS</p><h2 id="dialog-title" tabindex="-1">Private notebook.</h2></div><button class="notebook-close" data-action="close" aria-label="Close notebook">×</button></header><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="notebook-spread"><aside class="notebook-index"><span class="notebook-label">FIELD NOTES</span><p class="pencil-note">Write it down.<br>Before it changes.</p><nav aria-label="Notebook pages">${pages.map((entry, i) => `<button data-action="notebook-page" data-value="${i}" ${i === page ? 'aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${entry === 'empty' ? 'Unwritten' : entry === 'testimony' ? 'Previous testimony' : escape(EVIDENCE[entry].title)}</button>`).join('')}</nav><span class="notebook-private">DO NOT FILE</span></aside><section class="notebook-leaf">${content}<footer class="notebook-pagination"><button data-action="notebook-page" data-value="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Previous notebook page">← Previous</button><span>PAGE ${String(page + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span><button data-action="notebook-page" data-value="${page + 1}" ${page === pages.length - 1 ? 'disabled' : ''} aria-label="Next notebook page">Next →</button></footer></section></div></article>`;
}
