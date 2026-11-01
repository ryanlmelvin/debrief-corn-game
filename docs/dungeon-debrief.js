// These receipts belong to the escaped crawl. Their order is also the save
// contract, so a resumed interview cannot skip questions or rewrite testimony.
const QUESTIONS = [
  {
    title: 'Below the drainage channel.',
    prompt: 'How far below the field did you go?',
    context: 'The supervisor has ruled three lines on the form. Your lantern is still dripping onto his desk.',
    options: [
      { id: 'tunnels-count', label: 'Three levels. Brickwork all the way down.', reply: '“Culvert. Root cellar. Chapel.” He names them without looking up. “Continue.”' },
      { id: 'tunnels-roots', label: 'The roots were moving through the walls.', reply: '“They avoid the load-bearing walls,” he says. His pen moves before you finish speaking.' }
    ]
  },
  {
    title: 'Three locked gates.',
    prompt: 'What did you use to open the stair gates?',
    context: 'He draws a small brass key in the margin. He gets the shape of its teeth right.',
    options: [
      { id: 'keys-found', label: 'A brass key on each level. They fitted the gates.', reply: '“Three keys issued, three gates opened.” He checks a box headed ROUTINE ACCESS.' },
      { id: 'keys-placed', label: 'The keys were waiting for someone. Who put them there?', reply: '“No one puts them there,” he says. “We only check that they return.”' }
    ]
  },
  {
    title: 'The other side of the gate.',
    prompt: 'Where did the last gate let you out?',
    context: 'There is a folded road map beneath the form. His hand stays on it.',
    options: [
      { id: 'exit-road', label: 'A road outside the perimeter. I could not see the tower.', reply: '“Then the exterior gate is working.” He stamps the form and slides your rifle back across the desk.' },
      { id: 'exit-map', label: 'Show me where that road belongs on your map.', reply: 'He folds the map again. “You are back at the station. That is the location we are recording.”' }
    ]
  }
];
const objectWith = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

function sceneFor(answers, index, recordedReply = null) {
  const question = QUESTIONS[index];
  if (!question) return null;
  const previous = recordedReply || (index ? QUESTIONS[index - 1].options.find(option => option.id === answers[index - 1])?.reply : null);
  const arrival = 'The road bends behind a stand of trees and brings you to the station. The supervisor is waiting with a blank form. “Set the rifle on the desk. We still need your debrief.”';
  return { title: question.title, text: `${previous || arrival}\n\n${question.context}`, prompt: question.prompt,
    options: question.options.map(option => ({ ...option })), index, total: QUESTIONS.length };
}

export function getDungeonDebriefScene(s) {
  const r = s?.rogue;
  if (s?.phase !== 'rogue' || r?.route !== 'dungeon' || r.stage !== 'debrief' || !Array.isArray(r.debrief?.answers)) return null;
  const index = r.debrief.answers.length;
  const recordedReply = index ? s.reports.find(report => report.dungeonDebriefIndex === index - 1)?.supervisorReply : null;
  return sceneFor(r.debrief.answers, index, recordedReply);
}

export function validDungeonDebrief(s) {
  const r = s.rogue, interview = r.debrief;
  if (!objectWith(interview, ['version', 'answers']) || interview.version !== 1 || !Array.isArray(interview.answers) || interview.answers.length > 3) return false;
  const answers = interview.answers;
  const savedText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
  if (!answers.every((id,index) => QUESTIONS[index].options.some(option => option.id === id))) return false;
  const active = r.stage === 'debrief', complete = r.stage === 'done' && r.outcome === 'dungeon_escape';
  if (!active && !complete) return answers.length === 0 && !s.reports.some(report => report.dungeonDebriefIndex !== undefined);
  if (active ? answers.length === 3 : answers.length !== 3) return false;
  const tail = complete ? 1 : 0, beginIndex = s.reports.length - answers.length - tail - 1;
  const matches = (report, choice) => report?.kind === 'rogue' && report.rogueRoute === 'dungeon' && report.shift === s.shift && report.choice === choice;
  if (!matches(s.reports[beginIndex], 'begin')) return false;
  for (let index = 0; index < answers.length; index++) {
    const report = s.reports[beginIndex + index + 1];
    // IDs and order determine the branch. Keep the words actually recorded in
    // the save, even if a later release edits that question or its reply.
    if (!matches(report, answers[index]) || report.dungeonDebriefIndex !== index || !savedText(report.question) || !savedText(report.answer) || !savedText(report.supervisorReply) || report.replySpeaker !== 'SUPERVISOR') return false;
  }
  if (complete && !matches(s.reports.at(-1), 'surface')) return false;
  // No detached or duplicate interview answers may hide earlier in testimony.
  return s.reports.filter(report => report.dungeonDebriefIndex !== undefined).length === answers.length;
}

export function dungeonDebriefEnding(s) {
  const answers = s?.rogue?.debrief?.answers;
  if (s?.ending !== 'dungeon_escape' || !Array.isArray(answers) || answers.length !== 3) return null;
  const tunnels = answers[0] === 'tunnels-count'
    ? 'Your account of three levels is filed under existing structures. The supervisor knew their names before you gave them.'
    : 'Your account of roots moving through the walls is filed as a maintenance observation. The supervisor knew which walls they would leave standing.';
  const keys = answers[1] === 'keys-found'
    ? 'The three brass keys are entered as routine access equipment. No one asks how you found them.'
    : 'Your question about who left the keys is omitted. The supervisor has written that all three will be checked for return.';
  const exit = answers[2] === 'exit-road'
    ? 'Beyond the station door, the road bends past the same stand of trees. This time you keep walking.'
    : 'When he leaves to file the report, you take your rifle and step outside. You remember the turn that brought you here.';
  const recordedReply = s.reports.find(report => report.dungeonDebriefIndex === 2)?.supervisorReply;
  const reply = recordedReply || QUESTIONS[2].options.find(option => option.id === answers[2]).reply;
  return { text: `${reply}\n\n${tunnels} ${keys} ${exit}`,
    last: answers[2] === 'exit-road' ? 'The file records an exit. You intend to make it one.' : 'The road exists, whether or not it is on their map.' };
}
