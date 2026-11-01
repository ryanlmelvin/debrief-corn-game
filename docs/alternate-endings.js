// Optional final-night resolutions. The encounter journal is the source of truth:
// a loose encounter flag cannot unlock a route by itself.
import { endingPathRequirements } from './ending-paths.js';
import { RESOLUTION_GAMES, createResolutionActivity, validResolutionActivity } from './resolution-games.js';
export const ALTERNATE_ENDINGS = {
  relief: { code: '11', title: 'I trained my replacement. He’s me.', art: 'ending-relief', stamp: 'RELIEF ACCEPTED', text: 'You give the figure your badge and show it how to check the rifle. It repeats each order without looking at the paper. At the ladder, it asks when its relief will come. You give it the same answer they gave you. By morning, you are on a bus heading out of the county. The department never calls. Two weeks later, your pay arrives, including overtime.', last: 'Your attendance remains perfect.' },
  witness_present: { code: '12', title: 'I brought a plus-one.', art: 'ending-witness', stamp: 'WITNESS PRESENT', text: 'The supervisor looks at the empty chair. You refuse to answer until he speaks to your witness. He asks its name. The chair creaks. The answer begins in the voice that asked you to hold the door. Halfway through, the voice changes. He reaches for the recorder. You move it out of his reach.', last: 'The tape runs out before your witness finishes its name.' },
  rescue: { code: '13', title: 'I chose people over paperwork.', art: 'ending-rescue', stamp: 'ONE PERSON RECOVERED', text: 'You leave the radio and recorder playing beside the lantern. Between the voices, the field goes quiet. This time, when you pull, the boots come free. You carry the person to the road. The tapes stay in the roots. At the station, the supervisor asks for evidence. You point to the person wrapped in a blanket beside you. He asks whether you kept the recordings. You ask for an ambulance.', last: 'For once, the second set of footprints comes out.' },
  vacancy: { code: '14', title: 'I became the problem.', art: 'ending-vacancy', stamp: 'PROMOTION APPROVED', text: 'You approve the report. The supervisor takes his release and leaves the keys on the desk. He is halfway down the stairs when you ask who gives the orders. Before he answers, the next watch officer arrives. A woman in a white dress, they tell you. The northeast corner. You turn your first report toward them. His corrections are still there, beneath your signature.', last: 'The pen is already uncapped.' },
  transmission: { code: '15', title: 'I took my own advice.', art: 'ending-transmission', stamp: 'SHIFT COMMENCED', text: 'You press the switch and give the warning you remember: “Stay where you are. I can see you.” Below the second tower, a light stops beside a radio half buried in the furrow. You recognize the split heel of the boot beside it. You keep transmitting. Somewhere behind you, a relief officer starts climbing the ladder.', last: 'You have heard this part before.' }
};

const ROUTES = Object.keys(ALTERNATE_ENDINGS);
const MENU_PROMPT = 'What will you do before they send another team?';
const journalChoice = (s, event, choices) => s.fieldEvents?.journal?.some(entry => entry.id === event && choices.includes(entry.choice)) || false;
export function resolutionRequirements(s, route) {
  return route === 'witness' ? [] : endingPathRequirements(s, route);
}

const LEADS = {
  relief: ['Find my replacement.', 'It could take your post. You could leave.'],
  witness_present: ['Bring in my witness.', ''],
  rescue: ['Go back for the person at the lantern.', 'You’ll have to leave the recordings behind.'],
  vacancy: ['Ask about taking over the station.', ''],
  transmission: ['Go to the other tower.', '']
};

export function availableResolutions(s) {
  return ROUTES.map(id => {
    const requirements = resolutionRequirements(s, id);
    return { id, label: LEADS[id][0], detail: LEADS[id][1], requirements, disabled: !requirements.every(item => item.met) };
  });
}
export function canResolve(s) { return availableResolutions(s).some(option => !option.disabled); }

export function startResolution(s) {
  if (s.phase !== 'debrief' || s.shift !== 2 || s.question !== 2 || s.resolution !== undefined) return false;
  s.phase = 'resolution';
  s.resolution = { version: 1, route: null, step: 0, answers: [] };
  return true;
}

const option = (id, label, detail) => ({ id, label, ...(detail ? { detail } : {}) });
const back = () => option('back', 'Leave and answer the supervisor.');
const picked = (s, id) => s.resolution?.answers?.some(answer => answer.id === id) || false;

function transmissionReply(s) {
  const first = s.fieldEvents?.journal?.find(entry => entry.id === 'first-call')?.choice;
  if (first === 'answer') return 'Your voice asks, “Where am I?” Your first question, on your first night. A breath follows. You remember what came next.';
  if (first === 'record') return 'Below, someone holds a recorder to the buried radio. You did not answer that night. The tape kept your breathing and lost the words. Now you hear that breathing through the handset.';
  return 'Below, someone walks past the buried radio without answering. You recognize the retreating boots from the second night’s recording. The radio keeps speaking to the empty path.';
}

function scene(s, route, step) {
  const scenes = {
    relief: [
      { title: 'Your replacement.', prompt: 'It’s still waiting by the lantern.', context: `${journalChoice(s, 'lamp-keeper', ['hand']) ? 'The hand that gripped yours is raised beside the light.' : 'The figure that knew your name waits beside the light.'} Your coat, your height, the same repair on the sleeve. It says your watch number before you do.`, options: [option('relief-approach', 'Walk over with my badge in my hand.')] },
      { title: 'Teach it the job.', prompt: '“What do I do when I get there?”', context: 'It looks from your badge to the tower. Its fingers make the same small movements as yours.', options: [option('relief-orders', 'Tell it to watch the corn and shoot anything that escapes.'), option('relief-warning', 'Explain the orders. Tell it about the missing teams.')] },
      { title: 'The handover.', prompt: '“When will my relief come?”', context: picked(s, 'relief-warning') ? 'It listens to what happened to the teams, then walks to the ladder. It holds out a hand for your badge.' : 'It repeats every order correctly, then walks to the ladder. It holds out a hand for your badge.', options: [option('relief-handoff', 'Give it my badge. “At the end of the night.”'), option('relief-handoff-honest', 'Give it my badge. “I don’t know.”')] }
    ],
    witness_present: [
      { title: 'One more chair.', prompt: 'Where should your witness sit?', context: 'You stop the supervisor before his next question. A wet mark appears beside the door. You heard no one come in.', options: [option('witness-chair', 'Pull out the empty chair beside me.')] },
      { title: 'Two people.', prompt: '“There’s no one in that chair.”', context: 'The chair creaks. Your first tape and the future interview lie on the desk.', options: [option('witness-tapes', 'Play both tapes. Ask him to count again.'), option('witness-live', '“Then who just moved it?”')] },
      { title: 'For the record.', prompt: 'He reaches for the stop button.', context: picked(s, 'witness-tapes') ? 'He has turned your tapes off. The breathing from the chair continues. He keeps looking at the door.' : 'The cushion sinks farther, as though someone has leaned forward to hear him.', options: [option('witness-name', 'Keep it running. “Ask my witness its name.”')] }
    ],
    rescue: [
      { title: 'The buried radio.', prompt: 'Could the two voices loosen the roots?', context: 'On the second night, your tape and the radio canceled into a whistle. For a few seconds the field sounded ordinary. You remember the person whose boots would not come free.', options: [option('rescue-radio', 'Go back and dig out the radio.')] },
      { title: 'Back to the lantern.', prompt: 'The figure raises the hand you held.', context: 'The radio is heavier than it should be. Its cable pulls against the soil, then comes loose. The lantern is still visible between the rows.', options: [option('rescue-carry', 'Carry the radio over. Play my tape beside it.')] },
      { title: 'Both hands.', prompt: 'You can carry the person or the recordings.', context: 'The two speakers give the same breath. The roots loosen. A boot shifts. When you lift the recorder, the path bends again. You set it down. It has to keep playing here.', options: [option('rescue-leave', 'Leave the radio and recorder. Pull them free.', 'You won’t get the recordings back.')] }
    ],
    vacancy: [
      { title: 'A job offer.', prompt: '“How would you like to take over?”', context: 'He sets your signed reports beside a transfer form. “You understand how the record is kept.” There is a suitcase under his desk.', options: [option('vacancy-accept', 'Accept and read the papers.')] },
      { title: 'His way out.', prompt: 'He needs your signature before he can leave.', context: 'The small print says he stays until you also approve the report. He holds the page flat with both hands.', options: [option('vacancy-sign', 'Sign his release.')] },
      { title: 'Your first decision.', prompt: 'Do you approve the report?', context: 'Your first report calls the watch routine. His corrections are under your signature. He has packed the photograph from his desk. Now he watches the pen.', options: [option('vacancy-approve', 'Approve it. Take over the station.', 'He leaves. The watch continues.'), option('vacancy-question', 'Refuse. “Who ordered the treatments?”', 'Tear up his release.')] }
    ],
    transmission: [
      { title: 'The other tower.', prompt: 'Someone’s climbing the other tower.', context: 'You heard the radio switch click before your thumb moved. Now the second tower light is on again. Its ladder is empty.', options: [option('transmission-tower', 'Take my recorder to the other tower.')] },
      { title: 'September 30.', prompt: 'You’ve been here before.', context: 'The desk calendar shows your first night. A white dress moves into the northeast corner. Another light follows the path toward the buried radio.', options: [option('transmission-listen', 'Pick up the handset. Listen.')] },
      { title: 'Your own voice.', prompt: 'Do you send the warning?', context: transmissionReply(s), options: [option('transmission-broadcast', '“Stay where you are. I can see you.”', 'Stay at the radio and guide yourself through the field.')] }
    ]
  };
  const entry = scenes[route]?.[step];
  if (entry && route === 'rescue' && step === 2 && s.resolution?.activity) {
    const complete = s.resolution.activity.state.stage === 'complete';
    entry.context = complete
      ? 'Both boots are free. The radio and recorder keep the roots loose. When you lift the recorder, the path bends again. You set it down. To carry the person out, you need both hands.'
      : 'The voices must line up before the roots will loosen. Match the recorded breath to the radio, then pull during the quiet stretches.';
    entry.options[0] = { ...entry.options[0], label: 'Leave the radio and recorder. Carry the person out.', disabled: !complete };
  }
  return entry ? { ...entry, eyebrow: 'FINAL NIGHT', art: ALTERNATE_ENDINGS[route].art, options: [...entry.options, back()], step: step + 1, total: 3 } : null;
}

export function getResolution(s) {
  if (s.phase !== 'resolution' || !s.resolution) return null;
  if (s.resolution.route === null) return {
    title: 'One more thing.', eyebrow: 'FINAL NIGHT', art: 'debrief', prompt: MENU_PROMPT,
    context: '',
    options: [...availableResolutions(s), back()], step: 0, total: 0
  };
  return scene(s, s.resolution.route, s.resolution.step);
}

function withdraw(s) {
  s.phase = 'debrief';
  s.question = 2;
  delete s.resolution;
}

export function chooseResolution(s, id) {
  if (s.practice || !validResolution(s) || s.phase !== 'resolution') return false;
  const current = getResolution(s), selected = current?.options.find(item => item.id === id && !item.disabled);
  if (!selected) return false;
  const r = s.resolution;
  if (r.route === null && id === 'back') { withdraw(s); return true; }
  const route = r.route === null ? id : r.route;
  if (r.route === null) {
    // Reserve four entries for this route and three for an ordinary ending if
    // the player returns to the debrief. Keep all ordinary testimony.
    let excess = Math.max(0, s.reports.length + 4 - 197);
    s.reports = s.reports.filter(report => {
      if (excess > 0 && report.kind === 'resolution') { excess--; return false; }
      return true;
    });
  }
  s.reports.push({ kind: 'resolution', shift: s.shift, question: current.prompt, answer: selected.label, choice: id, resolutionRoute: route, resolutionStep: r.route === null ? -1 : r.step });
  if (id === 'back' || id === 'vacancy-question') { withdraw(s); return true; }
  r.answers.push({ id });
  if (r.route === null) { r.route = id; return true; }
  r.step++;
  if (r.step === 2 && RESOLUTION_GAMES.includes(route)) {
    r.version = 1;
    r.activity = createResolutionActivity(s, route);
    s.reports.at(-1).resolutionGame = route;
  }
  if (r.step < 3) return true;
  if (route === 'rescue') r.recordingsRelinquished = true;
  s.phase = 'ending';
  s.ending = route;
  s.targets = [];
  s.compulsionNotice = false;
  s.fieldEvents.pending = null;
  s.fieldEvents.journey = null;
  return true;
}

export function validResolution(s) {
  const r = s.resolution, alternateEnding = s.phase === 'ending' && ROUTES.includes(s.ending);
  if (r === undefined) return s.phase !== 'resolution' && !alternateEnding;
  if (!r || !['resolution', 'ending'].includes(s.phase) || s.shift !== 2 || s.question !== 2 || !Array.isArray(r.answers) || !Number.isInteger(r.step) || r.step < 0 || r.step > 3) return false;
  if (Object.keys(r).some(key => !['version', 'route', 'step', 'answers', 'recordingsRelinquished', 'activity'].includes(key))) return false;
  if (r.version !== undefined && r.version !== 1) return false;
  if (r.route === null) return s.phase === 'resolution' && r.step === 0 && r.answers.length === 0 && r.recordingsRelinquished === undefined && r.activity === undefined;
  if (!ROUTES.includes(r.route) || !resolutionRequirements(s, r.route).every(item => item.met)) return false;
  const completed = r.step === 3;
  const playable = RESOLUTION_GAMES.includes(r.route) && r.step >= 2;
  if (r.activity !== undefined && (!playable || !validResolutionActivity(r.activity, r.route))) return false;
  if (playable && r.version === 1 && !r.activity) return false;
  if (completed && r.activity && r.activity.state.stage !== 'complete') return false;
  if (completed ? !alternateEnding || s.ending !== r.route : s.phase !== 'resolution') return false;
  if (completed && r.route === 'rescue' ? r.recordingsRelinquished !== true : r.recordingsRelinquished !== undefined) return false;
  if (r.answers.length !== r.step + 1 || !r.answers.every(answer => answer && Object.keys(answer).length === 1 && typeof answer.id === 'string') || r.answers[0].id !== r.route) return false;
  const expected = [r.route];
  for (let step = 0; step < r.step; step++) {
    const entry = scene(s, r.route, step);
    const selected = entry.options.find(item => item.id === r.answers[step + 1].id && !['back', 'vacancy-question'].includes(item.id));
    if (!selected) return false;
    expected.push(selected.id);
  }
  const reports = s.reports?.slice(-expected.length);
  return reports?.length === expected.length && expected.every((id, i) => {
    const report = reports[i];
    // Keep the wording the player actually read. Copy edits must not invalidate
    // progress; the stable choice, route, and step bind each saved response.
    return report?.kind === 'resolution' && report.shift === 2 && typeof report.question === 'string' && typeof report.answer === 'string' && report.choice === id && report.resolutionRoute === r.route && report.resolutionStep === i - 1;
  });
}

// Archived endings keep their original sequence. An older unfinished lead
// resumes at the new activity without discarding testimony or prerequisites.
export function migrateResolution(s) {
  if (!validResolution(s)) return false;
  const r = s.resolution;
  if (s.phase !== 'resolution' || !r || r.version !== undefined) return true;
  r.version = 1;
  if (RESOLUTION_GAMES.includes(r.route) && r.step === 2) {
    r.activity = createResolutionActivity(s, r.route);
    s.reports.at(-1).resolutionGame = r.route;
  }
  return validResolution(s);
}

export function resolutionEnding(s) {
  if (s.phase !== 'ending' || !ROUTES.includes(s.ending) || !validResolution(s)) return null;
  if (s.ending === 'relief' && picked(s, 'relief-handoff-honest')) return {
    text: 'You give the figure your badge. When it asks about relief, you tell it the truth: you do not know when anyone will come. It looks up at the tower for a long time. Then it takes the rifle and starts climbing. At the first landing, it asks you to leave the gate unlatched. You do. By morning, you are on a bus heading out of the county. Two weeks later, your pay arrives, including overtime.',
    last: ALTERNATE_ENDINGS.relief.last, stamp: ALTERNATE_ENDINGS.relief.stamp
  };
  if (s.ending === 'relief' && picked(s, 'relief-warning')) return {
    text: 'You tell your replacement about the vanished teams and the reports you were asked to sign. It listens, then takes your badge. At the ladder it asks when its own relief will come. “At the end of the night,” you say. It climbs without looking back. By morning, you are on a bus heading out of the county. Two weeks later, your pay arrives, including overtime.',
    last: ALTERNATE_ENDINGS.relief.last, stamp: ALTERNATE_ENDINGS.relief.stamp
  };
  if (s.ending === 'transmission') {
    const first = s.fieldEvents.journal.find(entry => entry.id === 'first-call')?.choice;
    const reply = first === 'answer' ? 'Your voice answers, “Where am I?” You give your position and tell yourself not to turn around.'
      : first === 'record' ? 'Below, you hold your recorder to the buried radio. The words vanish from the tape as you speak them. Only your breathing gets through.'
        : 'Below, you step past the buried radio without answering. You describe the next crossing to the empty path, exactly as you remember hearing it.';
    return { text: `You press the switch. “Stay where you are. I can see you.” ${reply} You recognize the split heel of the boot beside the furrow. You keep transmitting. Somewhere behind you, a relief officer starts climbing the ladder.`, last: ALTERNATE_ENDINGS.transmission.last, stamp: ALTERNATE_ENDINGS.transmission.stamp };
  }
  return null;
}
