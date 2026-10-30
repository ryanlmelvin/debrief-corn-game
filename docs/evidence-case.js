import { CASE_TASKS, endingPath } from './ending-paths.js';
export { CASE_TASKS } from './ending-paths.js';
// An outside case is prepared deliberately; ordinary notebook discoveries are free.
export const CASE_PLAN = 'To take evidence outside: prepare the record at the pump house on night 1, the sample there on night 2, and the survey at the drain on night 3. Report physical findings on two nights. Preparation costs exposure. Follow paths and leave room to get back.';
export function freshCaseFile() { return { secured: [], reported: [] }; }
export function caseProgress(s) {
  const file = s.caseFile || freshCaseFile();
  const missing = CASE_TASKS.filter(task => !file.secured.includes(task.id));
  return { missing, prepared: 3 - missing.length, reports: file.reported.length, ready: endingPath(s,'witness').ready };
}
export function caseDetail(s) {
  const p = caseProgress(s);
  return p.ready ? 'Case ready: 3 preparations · 2 findings on record.'
    : `${p.prepared}/3 prepared · ${Math.min(2,p.reports)}/2 findings on record. ${p.missing.length ? `Still need: ${p.missing.map(t=>t.short.toLowerCase()).join(', ')}.` : 'Report physical findings on two nights.'}`;
}
export function preparationTasks(s, site) {
  return s.phase === 'field' && !s.fieldEvents.pending && s.inspected.includes(site)
    ? CASE_TASKS.filter(t => t.site === site && s.evidence.includes(t.id) && !s.caseFile.secured.includes(t.id)) : [];
}
export function validCaseFile(s) {
  const f = s.caseFile;
  return !!f && Array.isArray(f.secured) && f.secured.length <= 3 && new Set(f.secured).size === f.secured.length
    && f.secured.every(id => CASE_TASKS.some(t => t.id === id) && s.evidence.includes(id))
    && Array.isArray(f.reported) && f.reported.length <= 3 && new Set(f.reported).size === f.reported.length
    && f.reported.every(n => Number.isInteger(n) && n >= 0 && n <= s.shift);
}
// Existing saves retain their discoveries. Earlier physical testimony can still
// support a case, but notes are never silently upgraded into prepared exhibits.
export function migrateCaseFile(s) {
  if (s.caseFile !== undefined) return;
  s.caseFile = freshCaseFile();
  for (let night = 0; night <= s.shift; night++) {
    const reports = s.reports.filter(r => r.shift === night);
    const physical = reports.some(r => /^I found (white fabric|a recovery team badge|an ear of corn with teeth)/.test(r.answer));
    if (physical) s.caseFile.reported.push(night);
  }
}
