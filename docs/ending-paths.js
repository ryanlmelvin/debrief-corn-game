// The final gates and the field director share these declarations. New paths
// belong here; their prerequisite flags are discovered from the encounter data.
const encounter = (id, label, event, choices, extra = {}) => ({ id, label, kind: 'encounters', events: [{ id: event, choices }], target: 1, ...extra });
const reports = (id, label, slots, target, extra = {}) => ({ id, label, kind: 'reports', shifts: [0, 1], slots, target, unique: 'shift', routineOnly: true, ...extra });

export const ENDING_PATHS = {
  witness: { requirements: [
    ...[['ledger', 'Application record', 0], ['sample', 'Sealed sample', 1], ['map', 'Drainage survey', 2]].map(([id, label, night]) => ({ id, label, kind: 'evidence', evidence: id, night, target: 1 })),
    { id: 'recordings', label: 'Field recordings', kind: 'encounters', events: ['first-call', 'future-call'].map(id => ({ id, choices: ['record'] })), target: 2, keepRecordings: true },
    reports('objections', 'Reports challenged', [{ question: 2, choices: ['question'] }], 2, { routineOnly: false, legacyObjections: true })
  ] },
  relief: { requirements: [
    encounter('relief-contact', 'Ask about the relief or offer a hand.', 'lamp-keeper', ['ask', 'hand']),
    encounter('relief-double', 'Call to your double or stand beside it.', 'your-outline', ['name', 'stand'])
  ] },
  witness_present: { requirements: [
    encounter('witness-first', 'Record the first radio call.', 'first-call', ['record'], { keepRecordings: true }),
    encounter('witness-future', 'Record the future interview.', 'future-call', ['record'], { keepRecordings: true }),
    encounter('witness-invite', 'Invite the follower back.', 'last-follower', ['reply'])
  ] },
  rescue: { requirements: [
    encounter('rescue-recording', 'Record the first radio call.', 'first-call', ['record']),
    encounter('rescue-silence', 'Play the first tape beside the radio.', 'second-call', ['compare']),
    encounter('rescue-hand', 'Offer the figure at the lantern your hand.', 'lamp-keeper', ['hand'])
  ] },
  vacancy: { requirements: [
    reports('vacancy-signatures', 'Sign the first two reports.', [{ question: 2, choices: ['sign'] }], 2),
    reports('vacancy-corrections', 'Agree with the supervisor.', [{ question: 0, choices: ['comply'] }, { question: 1, choices: ['redact'] }, { question: 2, choices: ['sign'] }], 4, { unique: 'shift-choice' })
  ] },
  transmission: { requirements: [
    encounter('transmission-tower', 'Approach the second tower.', 'two-towers', ['other']),
    encounter('transmission-time', 'Compare the future interview with your first tape.', 'future-call', ['compare'], { keepRecordings: true })
  ] }
};

const journal = s => s.fieldEvents?.journal || [];
const recordedChoice = (s, event) => journal(s).find(entry => entry.id === event.id && event.choices.includes(entry.choice));
const reportKey = (requirement, shift, choice) => requirement.unique === 'shift-choice' ? `${shift}:${choice}` : String(shift);
function matchingReports(s, requirement) {
  const choices = requirement.slots.flatMap(slot => slot.choices);
  return (s.reports || []).filter(report => requirement.shifts.includes(report.shift) && (!requirement.routineOnly || !report.kind) &&
    (choices.includes(report.choice) || (requirement.legacyObjections && report.choice === undefined && typeof report.supervisorReply === 'string')));
}
function currentValue(s, requirement) {
  if (requirement.keepRecordings && s.resolution?.recordingsRelinquished === true) return 0;
  if (requirement.kind === 'evidence') return Number((s.evidence || []).includes(requirement.evidence));
  if (requirement.kind === 'encounters') return new Set(requirement.events.filter(event => recordedChoice(s, event)).map(event => event.id)).size;
  if (requirement.kind === 'reports') return new Set(matchingReports(s, requirement).map(report => reportKey(requirement, report.shift, report.choice))).size;
  return 0;
}

export function endingPathRequirements(s, route) {
  return (ENDING_PATHS[route]?.requirements || []).map(requirement => {
    const current = currentValue(s, requirement), { id, label, target } = requirement;
    return { id, label, current, target, met: current >= target };
  });
}

const failed = () => ({ possible: false, needed: new Set() });
const possible = (needed = []) => ({ possible: true, needed: new Set(needed) });
const mergeNeeded = results => new Set(results.flatMap(result => [...result.needed]));
const fieldStillOpen = (s, night) => night > s.shift || (night === s.shift && ['briefing', 'tower', 'decision', 'field'].includes(s.phase));

function encounterOpportunity(s, requested, encounters, visiting = new Set()) {
  const event = encounters.find(candidate => candidate.id === requested.id);
  if (!event || visiting.has(event.id)) return failed();
  if (recordedChoice(s, requested)) return possible();
  if (journal(s).some(entry => entry.id === event.id) || !fieldStillOpen(s, event.night) || s.fieldEvents?.plan?.find(entry => entry.id === event.id)?.detour) return failed();
  if (s.fieldEvents?.seen?.includes(event.id) && s.fieldEvents?.pending?.id !== event.id) return failed();
  const next = new Set([...visiting, event.id]);
  const options = event.choices.filter(option => requested.choices.includes(option.id)).map(option => {
    if (!option.requires || s.fieldEvents?.flags?.includes(option.requires)) return possible([event.id]);
    // Follow the prerequisite flag to all of its providers. This also works for
    // later additions with several interchangeable ways to obtain an item.
    const providers = encounters.filter(provider => provider.night < event.night || (provider.night === event.night && provider.step < event.step))
      .map(provider => ({ id: provider.id, choices: provider.choices.filter(choice => choice.flag === option.requires).map(choice => choice.id) }))
      .filter(provider => provider.choices.length && !recordedChoice(s, provider))
      .map(provider => encounterOpportunity(s, provider, encounters, next)).filter(result => result.possible);
    return providers.length ? possible([event.id, ...mergeNeeded(providers)]) : failed();
  }).filter(result => result.possible);
  return options.length ? possible(mergeNeeded(options)) : failed();
}

function reportOpportunityCount(s, requirement) {
  const available = new Set(matchingReports(s, requirement).map(report => reportKey(requirement, report.shift, report.choice)));
  for (const shift of requirement.shifts) for (const slot of requirement.slots) {
    const open = shift > s.shift || (shift === s.shift && (fieldStillOpen(s, shift) || (s.phase === 'debrief' && s.question <= slot.question)));
    if (open) for (const choice of slot.choices) available.add(reportKey(requirement, shift, choice));
  }
  return available.size;
}

function requirementOpportunity(s, requirement, encounters) {
  if (requirement.keepRecordings && s.resolution?.recordingsRelinquished === true) return failed();
  if (currentValue(s, requirement) >= requirement.target) return possible();
  if (requirement.kind === 'evidence') return fieldStillOpen(s, requirement.night) ? possible() : failed();
  if (requirement.kind === 'reports') return reportOpportunityCount(s, requirement) >= requirement.target ? possible() : failed();
  if (requirement.kind === 'encounters') {
    const opportunities = requirement.events.map(event => encounterOpportunity(s, event, encounters)).filter(result => result.possible);
    return opportunities.length >= requirement.target ? possible(mergeNeeded(opportunities)) : failed();
  }
  return failed();
}

export function neededEncounterIds(s, canonicalEncounters) {
  const needed = new Set();
  for (const path of Object.values(ENDING_PATHS)) {
    const opportunities = path.requirements.map(requirement => requirementOpportunity(s, requirement, canonicalEncounters));
    if (opportunities.every(result => result.possible)) for (const id of mergeNeeded(opportunities)) needed.add(id);
  }
  return needed;
}
