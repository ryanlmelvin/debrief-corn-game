// All simulation and story state lives here. Rendering and storage are separate.
export const SAVE_VERSION = 1;
export const SHIFT_LENGTH = 55;
export const DATES = ['SEPTEMBER 30', 'OCTOBER 14', 'OCTOBER 29'];
export const REPORT_DATES = ['OCTOBER 01', 'OCTOBER 15', 'OCTOBER 30'];
export const EVIDENCE = {
  dress: { title: 'White fabric', code: 'EXHIBIT 01', text: 'A strip of white cotton caught on a stalk. The tear is fresh. The stalk has grown through the weave.', where: 'The northeast corner' },
  ledger: { title: 'Application record', code: 'EXHIBIT 02', text: 'The same treatment, season after season. Each entry calls for a little more. Beneath the last row of figures: “Response below the root line. Do not amend the public log.”', where: 'An abandoned pump house' },
  roots: { title: 'Connected roots', code: 'EXHIBIT 03', text: 'Pale threads run from root to root. When your light crosses them, the entire row leans away. The soil beyond the fence moves a moment later.', where: 'A drainage channel' },
  badge: { title: 'Recovery team badge', code: 'EXHIBIT 04', text: 'The photograph is intact. The name has been worn smooth. Something has threaded itself through the clip, into the shape of a small ear.', where: 'The northeast corner' },
  sample: { title: 'Sealed sample', code: 'EXHIBIT 05', text: 'A glass vial beside an empty treatment drum. The sample label says BEFORE APPLICATION. Inside, one white filament turns slowly against the glass.', where: 'The pump house' },
  teeth: { title: 'An ear of corn', code: 'EXHIBIT 06', text: 'At first you count kernels. Then you notice their roots. All of them are teeth. They are arranged with the care of something learning.', where: 'The northeast corner' },
  map: { title: 'Drainage survey', code: 'EXHIBIT 07', text: 'Old field boundaries, a creek, the next farm. Someone has drawn a ring around this station. The water does not respect it.', where: 'The drainage channel' }
};
export const BRIEFINGS = [
  { title: 'Watch the corn grow.', text: 'Your post overlooks an experimental crop outside a small Illinois town. The night shift is quiet. Usually.', orders: ['Shoot any corn that attempts to leave the field.', 'Do not fire on human figures.', 'Remain in the watchtower. Record irregularities.'], note: 'The handbook has no procedure for someone entering the field.' },
  { title: 'Maintain the perimeter.', text: 'A recovery team has been sent to the northeast corner. You have been reassigned to the same post. The previous report has already been corrected.', orders: ['Prevent crop material from crossing the perimeter.', 'Recovery personnel are not targets.', 'Botanical observations belong in the approved vocabulary.'], note: 'A fresh coat of paint covers the old warning on the treatment drums.' },
  { title: 'Nothing has changed.', text: 'Another team is overdue. The wind has dropped. The rows continue to move. Your supervisor requests a clean report before the end of the month.', orders: ['Contain all mobile specimens.', 'Remain available for debrief.', 'Do not remove samples from the site.'], note: 'The lights on the neighboring farm went out at 18:40.' }
];

export function createGame(mode = 'standard', seed = Date.now()) {
  const s = { version: SAVE_VERSION, mode, rng: seed >>> 0 || 1, phase: 'briefing', shift: 0, time: 0,
    rounds: 6, reserve: 24, reload: 0, kills: 0, shots: 0, breaches: 0, exposure: 0,
    trust: 0, honesty: 0, evidence: [], reports: [], log: [], targets: [], nextSpawn: 3, nextId: 1,
    incident: false, entered: false, searched: [], question: 0, ending: null, lastShot: null,
    player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null };
  return s;
}
function random(s) { s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0; return s.rng / 4294967296; }
export function addLog(s, message, tone = 'normal') { s.log.unshift({ message, tone, at: Math.floor(s.time) }); s.log = s.log.slice(0, 20); }
export function startShift(s) {
  if (s.phase !== 'briefing') return false;
  Object.assign(s, { phase: 'tower', time: 0, rounds: 6, reserve: 24, reload: 0, targets: [], nextSpawn: 3,
    incident: false, entered: false, question: 0, player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null, lastShot: null });
  addLog(s, `Station 04. Shift ${s.shift + 1}. Perimeter check complete.`);
  return true;
}
function spawn(s) {
  const direction = random(s) < 0.5 ? -1 : 1;
  const x = 330 + random(s) * 300;
  const y = 360 + random(s) * 90;
  const speed = (17 + s.shift * 4 + random(s) * 9) * (s.mode === 'story' ? 0.58 : 1);
  s.targets.push({ id: s.nextId++, x, y, direction, speed, kind: 'corn', wobble: random(s) * 6.28 });
  addLog(s, 'Movement in the rows. Confirm your target.', 'alert');
}
export function advance(s, dt) {
  if (s.phase !== 'tower' || !Number.isFinite(dt) || dt <= 0) return;
  // Small fixed steps keep large elapsed times from skipping spawns or perimeter checks.
  let remaining = Math.min(dt, SHIFT_LENGTH);
  while (remaining > 0 && s.phase === 'tower') {
    const step = Math.min(remaining, 0.1); remaining -= step;
    s.time += step;
    if (s.reload > 0) {
      s.reload = Math.max(0, s.reload - step);
      if (s.reload === 0) {
        const n = Math.min(6 - s.rounds, s.reserve); s.rounds += n; s.reserve -= n;
        addLog(s, 'Rifle ready.');
      }
    }
    if (s.time >= s.nextSpawn && s.time < SHIFT_LENGTH - 13) {
      spawn(s); s.nextSpawn += 5.8 - s.shift * 0.65;
    }
    if (!s.incident && s.time >= 12) {
      s.incident = true;
      // A person crosses the field. Players must distinguish them from mobile crops.
      s.targets.push({ id: s.nextId++, x: 710, y: 331, direction: -1, speed: 9, kind: 'person', wobble: 0 });
      addLog(s, ['A white dress. Northeast corner. Someone went in.', 'A team light near the northeast corner. No radio response.', 'Three lights in the northeast. One by one, they go out.'][s.shift], 'story');
      addLog(s, 'You may leave the tower to investigate, or remain at your post.', 'story');
    }
    for (const target of s.targets) {
      target.x += target.direction * target.speed * step;
      if (target.kind === 'person' && s.time > 24) target.gone = true;
      if (target.kind === 'corn' && (target.x < 65 || target.x > 895)) {
        target.gone = true; s.breaches++;
        addLog(s, 'Perimeter breach. Something reached the road.', 'alert');
      }
    }
    s.targets = s.targets.filter(t => !t.gone);
    if (s.breaches >= 6) finish(s, 'breach');
    else if (s.time >= SHIFT_LENGTH) { s.phase = 'decision'; addLog(s, 'Relief has arrived. The northeast corner is quiet.', 'story'); }
  }
}
export function reload(s) {
  if (s.phase !== 'tower' || s.reload > 0 || s.rounds === 6 || s.reserve <= 0) return false;
  s.reload = 1.65; addLog(s, 'Reloading…'); return true;
}
export function targetAt(s, x, y, padding = 0) {
  return [...s.targets].reverse().find(t => ((x-t.x)/(24+padding))**2 + ((y-(t.y-34))/(45+padding))**2 <= 1);
}
export function shoot(s, x, y, padding = 0) {
  if (s.phase !== 'tower' || s.reload > 0) return 'blocked';
  if (!s.rounds) { addLog(s, 'Empty. Reload your rifle.', 'alert'); return 'empty'; }
  s.rounds--; s.shots++; s.lastShot = { x, y, time: s.time };
  const target = targetAt(s, x, y, padding);
  if (!target) return 'miss';
  s.targets = s.targets.filter(t => t.id !== target.id);
  if (target.kind === 'person') {
    s.trust -= 2; s.exposure = Math.min(100, s.exposure + 14);
    if (!s.searched.includes('figure-shot')) s.searched.push('figure-shot');
    addLog(s, 'The white figure folds into the rows. Your radio stays silent.', 'story');
    return 'person';
  }
  s.kills++; addLog(s, 'Mobile crop contained.'); return 'hit';
}
export function focusNext(s) {
  const targets = s.targets.filter(t => t.kind === 'corn');
  if (!targets.length) { s.focused = null; return null; }
  const i = targets.findIndex(t => t.id === s.focused);
  const target = targets[(i + 1) % targets.length]; s.focused = target.id;
  return { x: target.x, y: target.y - 34 };
}
export function enterField(s) {
  if (!['tower', 'decision'].includes(s.phase) || !s.incident) return false;
  // Leaving early lets any specimens already loose escape an unattended post.
  if (s.phase === 'tower') {
    const loose = s.targets.filter(t => t.kind === 'corn').length;
    s.breaches += loose;
    if (loose) addLog(s, `${loose} mobile specimen${loose === 1 ? '' : 's'} crossed while the tower was unattended.`, 'alert');
  }
  s.targets = [];
  if (s.breaches >= 6) { finish(s, 'breach'); return true; }
  s.phase = 'field'; s.entered = true;
  s.searched.push(`shift-${s.shift}`);
  addLog(s, 'You leave the tower. Every step into the rows raises exposure.', 'story');
  return true;
}
export const FIELD_SITES = [
  { x: 9, y: 1, id: 'corner', label: 'Northeast corner' },
  { x: 3, y: 3, id: 'pump', label: 'Pump house' },
  { x: 7, y: 5, id: 'drain', label: 'Drainage channel' },
  { x: 1, y: 7, id: 'tower', label: 'Watchtower' }
];
export function nearbySite(s) { return FIELD_SITES.find(p => p.x === s.player.x && p.y === s.player.y); }
export function move(s, dx, dy) {
  if (s.phase !== 'field' || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const x = s.player.x + dx, y = s.player.y + dy;
  if (x < 0 || x > 10 || y < 0 || y > 8) return false;
  s.player = { x, y }; s.fieldSteps++;
  const key = `${x},${y}`; if (!s.visited.includes(key)) s.visited.push(key);
  s.exposure = Math.min(100, s.exposure + (s.mode === 'story' ? 0.75 : 1.15));
  if (s.fieldSteps === 5) addLog(s, 'The rows close behind you. Nothing here smells like rain.', 'story');
  if (s.exposure >= 70 && !s.inspected.includes('warning')) { s.inspected.push('warning'); addLog(s, 'Your hands are cold. Return before exposure reaches 100.', 'alert'); }
  if (s.exposure >= 100) finish(s, 'assimilation');
  return true;
}
export function inspect(s) {
  if (s.phase !== 'field') return null;
  const site = nearbySite(s);
  if (!site || site.id === 'tower' || s.inspected.includes(site.id)) return null;
  s.inspected.push(site.id);
  const id = site.id === 'corner' ? ['dress', 'badge', 'teeth'][s.shift] : site.id === 'pump' ? (s.shift === 0 ? 'ledger' : 'sample') : (s.shift < 2 ? 'roots' : 'map');
  if (!s.evidence.includes(id)) s.evidence.push(id);
  addLog(s, `${EVIDENCE[id].title} entered in your private notebook.`, 'story');
  return id;
}
export function beginDebrief(s) {
  if (s.phase === 'field' && nearbySite(s)?.id !== 'tower') return false;
  if (!['field', 'decision'].includes(s.phase)) return false;
  s.phase = 'debrief'; s.question = 0; return true;
}
export function getQuestion(s) {
  const testimony = s.reports.filter(r => r.shift === s.shift);
  const concealedSighting = testimony[0]?.redacted;
  const correctedObservation = testimony[1]?.redacted;
  const latest = ['dress', 'badge', 'teeth'][s.shift];
  const found = s.evidence.includes(latest);
  const sighting = ['a figure in a white dress', 'a recovery team light', 'three lights going out'][s.shift];
  if (s.question === 0) return {
    prompt: s.entered ? 'Your log shows you left the tower. What prompted you to investigate?' : 'Before we close the shift log, what did you observe in the northeast corner?',
    context: `This interview concerns the watch you just completed. You saw ${sighting} near the northeast corner.`,
    options: [
      { id: 'truth', label: s.entered ? `I saw ${sighting}. I went into the field to investigate.` : `I saw ${sighting}. I stayed at my post.`, detail: 'Put the sighting and your response on record.', honesty: 1, trust: -1 },
      { id: 'comply', label: s.entered ? 'I was checking the perimeter, sir.' : 'Routine crop movement. Nothing further.', detail: 'Leave the sighting out of the official account.', honesty: -1, trust: 1 }
    ]
  };
  if (s.question === 1) {
    const followup = concealedSighting
      ? s.entered ? 'A perimeter check, then. Did you find anything that needs to go in the report?' : 'Routine movement. Did you see anything from the tower that would require a closer inspection?'
      : s.entered ? 'You went in to investigate. What were you able to establish?' : 'You stayed in the tower. What could you establish from there?';
    const background = ['We have no other report of anyone entering the field tonight.', 'The recovery team sent to that corner has not returned.', 'Another recovery team is overdue. We need to account for those lights.'][s.shift];
    return { prompt: `${followup} ${background}`,
      context: found ? `You recorded this in your private notebook: ${EVIDENCE[latest].text}` : s.entered ? 'You returned without an exhibit from the northeast corner. You can report that limit without inventing a finding.' : 'You did not search the corner. The sighting alone does not tell you what happened there.',
      options: [
        { id: 'evidence', label: found ? ['I found white fabric in the corner. A stalk had grown through it.', 'I found a recovery team badge. Something shaped like an ear of corn was growing through the clip.', 'I found an ear of corn with teeth where the kernels should be.'][s.shift] : s.entered ? 'I cannot say what happened there. I did not recover anything from the corner.' : 'I cannot say. I did not reach the corner.', detail: found ? 'Add this finding to the report.' : 'Record the limits of your observation.', honesty: 1, trust: found ? -1 : 0 },
        { id: 'redact', label: 'Nothing outside the expected growth pattern.', detail: 'Approve the routine-growth wording, without recording uncertainty or unusual findings.', honesty: -1, trust: 1 }
      ] };
  }
  const response = correctedObservation
    ? 'Then I will record no unusual findings.'
    : found ? 'I have noted your description. It will be reviewed separately.' : 'Then the record will show that you could not establish what happened in the corner.';
  if (s.shift < 2) return {
    prompt: `${response} The report for signature describes routine crop movement and recommends continuing the watch. Will you sign it?`,
    context: 'The supervisor places the report in front of you. Signing approves that wording. You may instead raise an objection before the interview closes.',
    options: [
      { id: 'question', label: s.evidence.includes('ledger') ? 'Before I sign: I found a treatment ledger in the pump house. The application amounts keep increasing. What are you putting on this crop?' : s.evidence.includes('sample') ? 'Before I sign: I found a sealed sample beside the treatment drums. Something inside it was moving. What is the treatment supposed to do?' : 'I cannot approve this as routine. If the crop has to be kept inside a perimeter, why are we continuing the watch instead of closing the field?', detail: 'Withhold your signature and retain your private notes.', honesty: 1, trust: -1 },
      { id: 'sign', label: 'I will sign the report and return to the watchtower.', detail: 'Approve the routine-growth account and the continuing watch.', honesty: -1, trust: 1 }
    ]
  };
  return { prompt: `${response} I am authorizing another search of the northeast corner. Will you assist the team, or sign the report and return to your post?`, context: 'The supervisor opens a field map and puts the final report beside it. You can also refuse the assignment and take your private record outside the department, if you have enough evidence.', options: [
    { id: 'expose', label: 'No more teams. I will take my evidence outside the department.', detail: 'Release your evidence. Requires 3 exhibits, including the application record or sealed sample.', disabled: s.evidence.length < 3 || !s.evidence.some(e => ['ledger', 'sample'].includes(e)) },
    { id: 'guide', label: s.searched.some(place => /^shift-/.test(place)) ? 'I have been inside the field. I will lead the team to the northeast corner.' : 'I will go in with the team and help search the northeast corner.', detail: 'Enter the field with the next recovery team.' },
    { id: 'sign', label: 'I will sign the report and return to the watchtower.', detail: 'Approve the final report and continue containment duty.' }
  ] };
}

export function answer(s, id) {
  if (s.phase !== 'debrief') return false;
  const q = getQuestion(s), option = q.options.find(o => o.id === id && !o.disabled);
  if (!option) return false;
  s.honesty += option.honesty || 0; s.trust += option.trust || 0;
  s.reports.push({ shift: s.shift, question: q.prompt, answer: option.label, redacted: ['redact', 'comply', 'sign'].includes(id) });
  s.question++;
  if (s.question === 3) {
    if (s.shift === 2) finish(s, id === 'expose' ? 'witness' : id === 'guide' ? 'guide' : s.honesty >= 2 ? 'dissent' : 'compliance');
    else { s.shift++; s.phase = 'briefing'; s.exposure = Math.max(0, s.exposure - 12); }
  }
  return true;
}
export const ENDINGS = {
  witness: { code: '01', title: 'An unofficial record.', stamp: 'DISTRIBUTION UNAUTHORIZED', text: 'The photographs and application records reach someone outside the department. The field is closed pending an inquiry. For a week, no one calls you. Then a farmer three counties away sends a photograph of his drainage ditch.', last: 'You keep the original report.' },
  guide: { code: '02', title: 'You remember where.', stamp: 'RECOVERY PENDING', text: 'They follow you between the rows. You know each turn before you take it. Behind you, someone asks why the path is so warm. At the northeast corner, the corn makes room.', last: 'This makes three, sir.' },
  compliance: { code: '03', title: 'Within acceptable limits.', stamp: 'REPORT APPROVED', text: 'The corrections are filed. The next treatment is authorized. From the tower, the road looks narrower than it did yesterday. Your replacement asks if the corn has always grown on both sides.', last: 'You watch the corn grow.' },
  dissent: { code: '04', title: 'Unfit for field duty.', stamp: 'TESTIMONY DISPUTED', text: 'Your final report is approved. The earlier objections are attached to your medical evaluation. They take your badge and issue a transfer. From the bus window, field after field passes in the dark.', last: 'You cannot see where this one ends.' },
  breach: { code: '05', title: 'Beyond the perimeter.', stamp: 'CONTAINMENT LOST', text: 'The sixth movement crosses the road. Dispatch tells you to stay on the line. From somewhere beyond the station comes the sound of stalks brushing together. There are no fields on that side.', last: '[static]' },
  assimilation: { code: '06', title: 'Expected growth.', stamp: 'PERSONNEL UNACCOUNTED FOR', text: 'You stop to catch your breath. The rows stop with you. Somewhere a radio calls your number, then calls it again. You understand at last why the field has been so patient.', last: 'Nothing here is wasted.' }
};
function finish(s, ending) { s.phase = 'ending'; s.ending = ending; s.targets = []; }

export function serialize(s) { return JSON.stringify(s); }
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION || !['standard','story'].includes(s.mode) || !['briefing','tower','decision','field','debrief','ending'].includes(s.phase)) return null;
    if (!Number.isInteger(s.shift) || s.shift < 0 || s.shift > 2 || !Number.isInteger(s.question) || s.question < 0 || s.question > 3) return null;
    for (const key of ['time','rounds','reserve','reload','kills','shots','breaches','exposure','trust','honesty','rng','nextSpawn','nextId','fieldSteps']) if (!Number.isFinite(s[key])) return null;
    if (s.time < 0 || s.time > SHIFT_LENGTH + 1 || s.rounds < 0 || s.rounds > 6 || s.reserve < 0 || s.exposure < 0 || s.exposure > 100) return null;
    for (const key of ['evidence','reports','log','targets','searched','visited','inspected']) if (!Array.isArray(s[key]) || s[key].length > 200) return null;
    if (!s.evidence.every(e => Object.hasOwn(EVIDENCE,e))) return null;
    if (!s.player || !Number.isInteger(s.player.x) || !Number.isInteger(s.player.y) || s.player.x < 0 || s.player.x > 10 || s.player.y < 0 || s.player.y > 8) return null;
    if (!s.targets.every(t => Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.speed) && Number.isFinite(t.wobble) && [-1,1].includes(t.direction) && ['corn','person'].includes(t.kind))) return null;
    if (!s.log.every(l => typeof l.message === 'string') || !s.reports.every(r => typeof r.question === 'string' && typeof r.answer === 'string')) return null;
    if (s.phase === 'ending' && !Object.hasOwn(ENDINGS,s.ending)) return null;
    if (s.phase === 'debrief' && s.question > 2) return null;
    return s;
  } catch { return null; }
}
