// Derive the final refusal from actions already taken. No separate preparation
// state or early objective list: requirements are shown only at the last choice.
export function witnessRequirements(s) {
  const recordings = new Set(s.fieldEvents.journal
    .filter(entry => ['first-call', 'future-call'].includes(entry.id) && entry.choice === 'record')
    .map(entry => entry.id)).size;
  const objections = new Set(s.reports
    .filter(report => [0, 1].includes(report.shift) && (report.choice === 'question' ||
      (report.choice === undefined && typeof report.supervisorReply === 'string')))
    .map(report => report.shift)).size;
  return [
    ...[['ledger', 'Application record'], ['sample', 'Sealed sample'], ['map', 'Drainage survey']].map(([id, label]) => ({ id, label, current: Number(s.evidence.includes(id)), target: 1 })),
    { id: 'recordings', label: 'Field recordings', current: recordings, target: 2 },
    { id: 'objections', label: 'Reports challenged', current: objections, target: 2 }
  ].map(requirement => ({ ...requirement, met: requirement.current >= requirement.target }));
}
export function canTakeEvidenceOutside(s) { return witnessRequirements(s).every(requirement => requirement.met); }

// Retire the short-lived preparation mechanic without charging ongoing games
// for actions that no longer exist. Removing the field makes this a one-time refund.
export function retirePreparations(s) {
  if (s.caseFile === undefined) return true;
  const file = s.caseFile, costs = { ledger: 12, sample: 16, map: 14 };
  if (!file || !Array.isArray(file.secured) || file.secured.length > 3 ||
      new Set(file.secured).size !== file.secured.length ||
      !file.secured.every(id => Object.hasOwn(costs, id) && s.evidence.includes(id))) return false;
  if (!['ending', 'guide'].includes(s.phase)) s.exposure = Math.max(0, s.exposure - file.secured.reduce((sum, id) => sum + costs[id], 0));
  s.log = s.log.filter(entry => !/prepared for the outside case\./.test(entry.message));
  delete s.caseFile;
  return true;
}
