import { EVIDENCE } from './engine.js';
import { currentEncounter, encounterById } from './encounters.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const FIELD_ART = {
  corner: { file: 'field-corner', alt: 'Torn white cotton caught in a corn stalk beside the perimeter fence.' },
  pump: { file: 'field-pump', alt: 'A dim pump shed with rusting pipes, treatment drums and an old ledger.' },
  drain: { file: 'field-drain', alt: 'Pale roots spread across a muddy drainage ditch and dark water.' },
  tower: { file: 'station-kit', alt: 'A worn field radio, binoculars, pocket notebook and brass cartridges on the tower sill.' },
  retrieval: { file: 'field-retrieval', alt: 'Three recovery workers in worn field clothing enter the corn, each carrying a light.' },
  sighting: { file: 'field-sighting', alt: 'A distant pale human figure disappears between corn rows, seen from the watchtower.' },
  stove: { file: 'pump-stove', alt: 'Corn steams on a camping stove beside a clean plate, butter and salt in the dirty pump shed.' },
  debrief: { file: 'debrief-desk', alt: 'A reel-to-reel recorder and blank report sheets on a worn desk under lamplight.' }
};
export const SPECIMENS = {
  dress: { cell: 0, site: 'corner' }, ledger: { cell: 1, site: 'pump' }, roots: { cell: 2, site: 'drain' },
  badge: { cell: 3, site: 'corner' }, sample: { cell: 4, site: 'pump' }, teeth: { cell: 5, site: 'corner' },
  map: { cell: 6, site: 'drain' }, water: { cell: 7, site: 'drain' }, glove: { cell: 8, site: 'pump' }
};

export function scenePlate(site) {
  const art = FIELD_ART[site];
  if (!art) return '';
  return `<figure class="scene-plate"><img src="./assets/${art.file}.webp" alt="${art.alt}" width="1200" height="800"></figure>`;
}

export function specimenStudy(id) {
  const specimen = SPECIMENS[id], evidence = EVIDENCE[id];
  if (!specimen || !evidence) return '';
  const x = specimen.cell % 3, y = Math.floor(specimen.cell / 3);
  return `<figure class="specimen-study"><div class="specimen-drawing" role="img" aria-label="Field sketch: ${escape(evidence.title)}" style="background-position:${x * 50}% ${y * 50}%"></div></figure>`;
}

export function evidenceMount(id) {
  const specimen = SPECIMENS[id];
  return specimen ? `<div class="evidence-mount">${scenePlate(specimen.site)}${specimenStudy(id)}</div>` : '';
}

// Only completed answers belong on the tape; field notes remain private.
export function interviewRecord(game) {
  const reports=game.reports.filter(r=>r.shift===game.shift), last=reports.at(-1);
  return `<aside class="interview-record" aria-label="Recorded testimony"><div class="tape-heading"><svg viewBox="0 0 72 28" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="15" cy="13" r="10"/><circle cx="57" cy="13" r="10"/><circle cx="15" cy="13" r="2"/><circle cx="57" cy="13" r="2"/><path d="M15 3V8M5 13H10M15 18V23M20 13H25M57 3V8M47 13H52M57 18V23M62 13H67M15 23L27 26H45L57 23"/></svg><span>ON RECORD<small>${String(reports.length).padStart(2,'0')} / 03 RECORDED</small></span></div><p class="record-caption">${last?'LAST STATEMENT':'AWAITING TESTIMONY'}</p><p class="record-quote">${last?escape(last.answer):'No statement on record.'}</p></aside>`;
}

export function dialogArtwork(kind, shift = 0) {
  if (kind === 'debrief') return `<div class="interview-scene">${scenePlate('debrief')}<span class="recording-label"><i></i> REC / TAPE 0${shift + 1}</span></div>`;
  if (kind === 'guide-intro') return scenePlate('retrieval');
  if (['briefing', 'manual'].includes(kind)) return scenePlate('tower');
  if (kind === 'sighting') return scenePlate(shift > 0 ? 'retrieval' : 'sighting');
  if (['ending', 'records'].includes(kind)) return scenePlate('debrief');
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
  if(game.fieldEvents.journal.length)pages.push('encounters');
  if (game.reports.length) pages.push('testimony');
  if (!pages.length) pages.push('empty');
  const page = Math.max(0, Math.min(pages.length - 1, Number(requestedPage) || 0)), id = pages[page];
  let content;
  if (id === 'empty') content = `${scenePlate('tower')}`;
  else if (id === 'testimony') content = `<h3>What went on record.</h3><div class="notebook-testimony">${game.reports.map(r => `<section><p class="eyebrow">SHIFT 0${r.shift + 1}</p><h4>${escape(r.question)}</h4><p>${r.redacted ? '<span class="withheld-note">Observation withheld</span> ' : ''}${escape(r.answer)}</p>${r.supervisorReply ? `<p class="pencil-note">Supervisor: ${escape(r.supervisorReply)}</p>` : ''}</section>`).join('')}</div>`;
  else if(id==='encounters')content=`<h3>Between the rows.</h3><div class="notebook-encounters">${game.fieldEvents.journal.map(j=>{const e=encounterById(j.id),c=e.choices.find(c=>c.id===j.choice);return `<section><p class="eyebrow">NIGHT 0${e.night+1} · CROSSING ${j.x+1}, ${j.y+1}</p><h4>${escape(e.title)}</h4><p>${escape(e.report)}</p><p class="pencil-note">${escape(c.label)} ${escape(c.result)}</p></section>`;}).join('')}</div>`;
  else {
    const e = EVIDENCE[id];
    content = `<p class="eyebrow">${escape(e.code)} / ${escape(e.where)}</p><h3>${escape(e.title)}</h3>${evidenceMount(id)}<p class="handwritten-observation">${escape(e.text)}</p>`;
  }
  return `<article class="field-notebook"><header class="notebook-header"><div><h2 id="dialog-title" tabindex="-1">Private notebook.</h2></div><button class="notebook-close" data-action="close" aria-label="Close notebook">×</button></header><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><div class="notebook-spread"><aside class="notebook-index"><p class="pencil-note">Write it down.<br>Before it changes.</p><nav aria-label="Notebook pages">${pages.map((entry, i) => `<button data-action="notebook-page" data-value="${i}" ${i === page ? 'aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${entry === 'empty' ? 'Unwritten' : entry === 'testimony' ? 'Previous testimony' : entry === 'encounters' ? 'Between the rows' : escape(EVIDENCE[entry].title)}</button>`).join('')}</nav></aside><section class="notebook-leaf">${content}<footer class="notebook-pagination"><button data-action="notebook-page" data-value="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Previous notebook page">←</button><span>${String(page + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span><button data-action="notebook-page" data-value="${page + 1}" ${page === pages.length - 1 ? 'disabled' : ''} aria-label="Next notebook page">→</button></footer></section></div></article>`;
}

// Brief action labels keep the scene and its costs beside every alternative.
const encounterLabels = {
  'two-towers:visible': 'Get your bearings from the ladder.',
  'two-towers:other': 'Step toward the second light.',
  'future-call:record': 'Record the future interview.',
  'future-call:compare': 'Compare with your first tape.'
};
const encounterAlt={radio:'A scratched field radio half buried in wet soil between corn rows.',tracks:'Two trails of boot prints lead toward pale roots and a dirty survey ribbon.',lantern:'An oil lantern lights a corn row with an indistinct human shape beyond it.'};
export function encounterMarkup(game) {
  const e=currentEncounter(game);if(!e)return '';
  const pending=game.fieldEvents.pending,chosen=e.choices.find(c=>c.id===pending.choice);
  const effect=delta=>delta>0?`+${delta} exposure${game.exposure+delta>=100?' · reaches 100':''}`:delta<0?`−${-delta} exposure`:'0 exposure';
  return `<article class="encounter-sheet"><div class="encounter-image"><img src="./assets/encounter-${e.art}.webp" alt="${encounterAlt[e.art]}" width="1536" height="1024"></div><div class="encounter-copy"><button id="dialog-update" class="secondary" data-update hidden>Update ready. Download?</button><p class="eyebrow">EXPOSURE ${Math.floor(game.exposure)} / 100</p><h2 id="dialog-title" tabindex="-1">${escape(e.title)}</h2><p class="encounter-story">${escape(chosen?chosen.result:e.text)}</p>${chosen?`<div class="encounter-outcome"><button class="primary" data-action="encounter-continue">${game.fieldEvents.journey?'Continue →':'Return →'}</button>${game.fieldEvents.journey?'<button class="secondary" data-action="encounter-map">Map</button>':''}</div>`:`<div class="encounter-choices">${e.choices.map(c=>`<button class="choice" data-action="encounter-choice" data-value="${c.id}"><span>${escape(encounterLabels[`${e.id}:${c.id}`] || c.label)}</span><small class="${c.delta>0?'encounter-cost':''}">${effect(c.delta)}</small></button>`).join('')}</div>`}</div></article>`;
}
