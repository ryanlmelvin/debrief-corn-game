import { getQuestion } from './engine.js';
import { encounterById, encounterForState } from './encounters.js';
import { observedSighting } from './watch-story.js';

// Presentation copy only. The engine remains the authority for available answers,
// their consequences, and the complete wording saved in the official transcript.
const cornerFacts = [
  'Corner: a stalk grew through torn white cloth.',
  'Corner: corn-shaped growth threaded through a badge clip.',
  'Corner: an ear of corn had teeth instead of kernels.'
];
const cornerReports = [
  'Report the white cloth pierced by a stalk.',
  'Report the badge with corn growing through its clip.',
  'Report the corn with teeth instead of kernels.'
];
const encounterReports = {
  'first-call': 'A buried radio spoke in my voice. My own set was silent.',
  'paired-tracks': 'New prints appeared ahead of me, with the same damaged heel as my boots.',
  'unattended-lamp': 'A lantern swung in still air beside a supply tin.',
  'extra-step': 'One more footstep sounded behind me after I stopped.',
  'second-call': 'The field radio replayed sounds from my last investigation.',
  'moved-crossing': 'Two crossings held my tracks. Neither matched the survey map.',
  'lamp-keeper': 'A figure said it was my relief. Its voice came from a stalk.',
  'two-towers': 'I saw two tower lights and heard an unseen ladder being climbed.',
  'future-call': 'The radio played tonight’s debrief before my search was finished.',
  'root-knot': 'Roots tightened around the shape of an empty shoe.',
  'your-outline': 'A figure had my coat’s repair and moved with my breathing.',
  'last-follower': 'The radio said, “Hold the door,” as the crop moved toward me.'
};

export function decisionQuestion(game) {
  const canonical = getQuestion(game);
  const testimony = game.reports.filter(report => report.shift === game.shift);
  const found = game.evidence.includes(['dress', 'badge', 'teeth'][game.shift]);
  let prompt = canonical.prompt, context = canonical.context, contextLabel = 'IN THE ROOM';
  const labels = {};

  if (game.question === 0) {
    const sighting = observedSighting(game);
    const compelled = game.departure === 'compelled';
    prompt = compelled ? 'Why did you leave without answering your relief?'
      : game.entered ? 'Why did you leave the tower?'
        : 'What did you see in the northeast corner?';
    context = compelled ? 'Your hands ache from the ladder. You cannot explain leaving.'
      : 'The microphone catches your breathing.';
    labels.truth = compelled ? `I saw ${sighting}.`
      : game.entered ? `I saw ${sighting} and went to investigate.`
        : `I saw ${sighting}. I stayed at my post.`;
    labels.comply = game.entered ? 'I was checking the perimeter, sir.' : 'Routine crop movement. Nothing further.';
  } else if (game.question === 1) {
    const followup = testimony[0]?.redacted
      ? game.entered ? 'Your perimeter check: anything to report?' : 'Routine movement, then. Anything to inspect?'
      : game.departure === 'compelled' ? 'I’ll record an investigation. What did you establish?'
        : game.entered ? 'What did your investigation establish?' : 'What could you establish from the tower?';
    const background = [
      'No other entry was reported.',
      'The recovery team is still missing.',
      'Another team is overdue. Account for their lights.'
    ][game.shift];
    prompt = `${followup} ${background}`;
    contextLabel = game.entered || found ? 'NOTEBOOK' : 'FROM THE TOWER';
    context = found ? cornerFacts[game.shift] : game.entered
      ? 'No entry for the northeast corner.'
      : 'The rows hid what happened in the corner.';
    labels.evidence = found ? cornerReports[game.shift] : game.entered
      ? 'I recovered nothing from the corner.'
      : 'I never reached the corner. I can’t say.';
    const fieldNote = game.fieldEvents.journal.find(entry => encounterById(entry.id)?.night === game.shift);
    if (fieldNote) labels['field-notes'] = encounterForState(game,fieldNote.id).shortReport || encounterReports[fieldNote.id];
    labels.redact = 'Nothing outside the expected growth pattern.';
  } else if (game.question === 3 && game.shift < 2) {
    // Preserve the actual reply on the saved report, including after a reload.
    prompt = canonical.prompt.startsWith('Do you need')
      ? 'Do you need that to do your job? Watch the corn. Shoot any that try to escape.'
      : 'Closing the field isn’t your decision. Watch the corn. Shoot any that try to escape.';
    context = 'He shuts the folder before you can answer.';
    labels.return = 'Return to my post.';
  } else {
    contextLabel = 'SUPERVISOR';
    context = testimony[1]?.redacted ? 'No unusual findings will be recorded.'
      : found ? 'Your description will be reviewed separately.'
        : 'The record will show you could not account for the corner.';
    prompt = game.shift < 2
      ? 'The report calls this routine and continues the watch. Will you sign?'
      : 'Another team is going in. Will you lead them?';
    labels.question = game.evidence.includes('ledger')
      ? 'I found rising doses in the pump-house ledger. What’s the treatment?'
      : game.evidence.includes('sample')
        ? 'Something moved in the sealed sample I found. What is the treatment for?'
        : 'I can’t sign this as routine. Why keep watching instead of closing the field?';
    labels.sign = 'Sign the report. Return to the tower.';
    labels.expose = 'Refuse another search. Take my evidence outside the department.';
    labels.guide = game.searched.some(place => /^shift-/.test(place))
      ? 'Lead the team to the northeast corner.'
      : 'Join the team and search the northeast corner.';
  }

  return {
    ...canonical, prompt, context, contextLabel,
    options: canonical.options.map(option => ({
      ...option,
      label: labels[option.id] || option.label
    }))
  };
}
