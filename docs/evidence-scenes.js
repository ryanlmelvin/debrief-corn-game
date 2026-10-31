import { storyDraw } from './story-random.js';
import { EVIDENCE_FLAVORS } from './evidence-flavors.js';

export const EVIDENCE = {
  dress: { title: 'White fabric', code: 'EXHIBIT 01', text: 'You find a strip of white cotton fabric caught on a stalk. The tear is fresh. The stalk has grown through the weave.', where: 'The northeast corner' },
  ledger: { title: 'Application record', code: 'EXHIBIT 02', text: 'You find an application record for the crop treatment. The record lists the same treatment, season after season. Each entry calls for a little more. Beneath the last row of figures: “Response below the root line. Do not amend the public log.”', where: 'An abandoned pump house' },
  roots: { title: 'Connected roots', code: 'EXHIBIT 03', text: 'You find connected roots in the drainage channel. Pale threads run from root to root. When your light crosses them, the entire row leans away. The soil beyond the fence moves a moment later.', where: 'A drainage channel' },
  badge: { title: 'Recovery team badge', code: 'EXHIBIT 04', text: 'You find a recovery team badge. The photograph on the badge is intact. The name has been worn smooth. Something has threaded itself through the badge clip, into the shape of a small ear.', where: 'The northeast corner' },
  sample: { title: 'Sealed sample', code: 'EXHIBIT 05', text: 'You find a sealed sample in a glass vial beside an empty treatment drum. The sample label says BEFORE APPLICATION. Inside, one white filament turns slowly against the glass.', where: 'The pump house' },
  teeth: { title: 'An ear of corn', code: 'EXHIBIT 06', text: 'You find an ear of corn. At first you count what look like kernels. Then you notice their roots. Each supposed kernel is a tooth. A few teeth are loose. You put the ear down.', where: 'The northeast corner' },
  water: { title: 'Water sample', code: 'EXHIBIT 08', text: 'You stop to take a water sample from the drainage channel. A film on the water gathers against the current. You break it with a twig. The two halves drift back together.', where: 'The drainage channel' },
  glove: { title: 'Work glove', code: 'EXHIBIT 09', text: 'You find a work glove beneath the pump tap. The fingers are packed with damp soil. The inside is still warm.', where: 'The pump house' },
  map: { title: 'Drainage survey', code: 'EXHIBIT 07', text: 'You find a drainage survey showing old field boundaries, a creek, and the next farm. Someone has drawn a ring around this station. The water flows beyond the marked boundary.', where: 'The drainage channel' }
};

// Mechanics use the stable exhibit IDs. Only the discovery presentation varies.
export const EVIDENCE_SCHEDULE = {
  corner: ['dress', 'badge', 'teeth'],
  pump: ['ledger', 'sample', 'glove'],
  drain: ['roots', 'water', 'map']
};
export const evidenceAtSite = (site, night) => EVIDENCE_SCHEDULE[site]?.[night] ?? null;
export function freshEvidenceScenes(seed) {
  return Object.fromEntries(Object.keys(EVIDENCE).map(id => [id, storyDraw(seed, `evidence:${id}`) % (1 + (EVIDENCE_FLAVORS[id]?.length || 0))]));
}
export function evidenceForState(s, id) {
  const canonical = EVIDENCE[id];
  if (!canonical) return null;
  const variant = s?.evidenceScenes?.[id] ?? 0;
  const flavor = variant ? EVIDENCE_FLAVORS[id]?.[variant - 1] : null;
  return { ...canonical, ...(flavor ? { title: flavor.title, text: flavor.text, art: flavor.art } : {}), canonicalTitle: canonical.title, variant };
}
export function migrateEvidenceScenes(s) {
  // Existing saves keep the discoveries and notes they already know.
  if (s.evidenceScenes === undefined) s.evidenceScenes = Object.fromEntries(Object.keys(EVIDENCE).map(id => [id, 0]));
}
export function validEvidenceScenes(s) {
  const plan = s.evidenceScenes, ids = Object.keys(EVIDENCE);
  return !!plan && typeof plan === 'object' && !Array.isArray(plan) && Object.keys(plan).length === ids.length &&
    ids.every(id => Object.hasOwn(plan, id) && Number.isInteger(plan[id]) && plan[id] >= 0 && plan[id] <= (EVIDENCE_FLAVORS[id]?.length || 0));
}
