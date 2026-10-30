export const CASE_TASKS = [
  { id: 'ledger', site: 'pump', night: 0, title: 'Copy the application record', short: 'Record copy', cost: 12,
    text: 'Copy the dates and doses before the ink lifts from the page.' },
  { id: 'sample', site: 'pump', night: 1, title: 'Pack the sealed sample', short: 'Packed sample', cost: 16,
    text: 'Keep the seal intact and pack the glass so it survives the walk out.' },
  { id: 'map', site: 'drain', night: 2, title: 'Trace the drainage survey', short: 'Survey tracing', cost: 14,
    text: 'Match the survey to the channel and trace where it crosses the boundary.' }
];
// Add another path here to reuse the live counter and requirements panel.
// Values come from saved game facts; viewing progress never grants progress.
export const ENDING_PATHS = [
  { id: 'witness', title: 'An outside case', requirements: [
    ...CASE_TASKS.map(task => ({ id:task.id, label:task.title, target:1, value:s=>Number(s.caseFile.secured.includes(task.id)), hint:`${task.site==='pump'?'Pump house':'Drainage channel'}, from night ${task.night+1} · +${task.cost} exposure.` })),
    { id: 'findings', label: 'Physical findings reported', target: 2, value: s => s.caseFile.reported.length, hint: 'Report the corner exhibit on two different nights. Physical testimony stays on tape, even if you sign.' }
  ] }
];
export function endingPaths(s) {
  return ENDING_PATHS.map(path => {
    const requirements = path.requirements.map(r => ({ id:r.id, label:r.label, hint:r.hint, target:r.target, current:Math.min(r.target,r.value(s)) }));
    const current = requirements.reduce((n,r) => n+r.current,0), target = requirements.reduce((n,r) => n+r.target,0);
    return { id:path.id, title:path.title, requirements, current, target, ready:current===target };
  });
}
export function endingPath(s,id) { return endingPaths(s).find(path => path.id===id); }
export function endingPathCounter(s) {
  return endingPaths(s).map(p=>`${p.current}/${p.target}`).join(' · ');
}
export function endingPathsMarkup(s) {
  return endingPaths(s).map(p=>`<section><h3>${p.title} · ${p.current} / ${p.target}</h3><p>${p.ready?'Ready to take outside at the final debrief.':'Prepare all three exhibits and report physical findings on two nights.'}</p><ul class="ending-path-checklist">${p.requirements.map(r=>`<li><strong>${r.current===r.target?'✓ ':''}${r.label} · ${r.current} / ${r.target}</strong><p class="small">${r.hint}</p></li>`).join('')}</ul><p class="note">You can return to prepare a discovered exhibit on a later night. Preparation costs ${CASE_TASKS.reduce((sum,task)=>sum+task.cost,0)} exposure in total; walking and optional encounters use the same reserve. Rest removes 12 between nights.</p></section>`).join('');
}
