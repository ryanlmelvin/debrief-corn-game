import { SIGHTING_TIME, sightingPeople, watchNight, personExitTime, observedSighting } from './watch-story.js';
import { startGuide, advanceGuide, guideDisposition } from './guide.js';
import { fieldStepCost } from './field.js';
import { freshFieldEvents, encounterAfterStep, resolveEncounter, dismissEncounter, migrateFieldEvents, validFieldEvents, encounterById } from './encounters.js';
// All simulation and story state lives here. Rendering and storage are separate.
export const SAVE_VERSION = 2;
export const SHIFT_LENGTH = 55;
export const COMPULSION_NOTICE = 'You could not resist the urge to investigate any longer.';
export const DATES = ['SEPTEMBER 30', 'OCTOBER 14', 'OCTOBER 29'];
export const REPORT_DATES = ['OCTOBER 01', 'OCTOBER 15', 'OCTOBER 30'];
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
const WATCH_ORDERS = ['Watch the corn. Shoot any that try to escape.', 'Remain in the watchtower.', 'Do not consume the crop.', 'Remember any irregularities for your debrief at the end of the night.'];
export const BRIEFINGS = [
  { title: 'Watch the corn.', text: 'Your post overlooks an experimental crop outside ██████, Illinois. The night shift is quiet. Usually.', orders: WATCH_ORDERS, note: 'Your relief comes at the end of the night.' },
  { title: 'Watch the corn.', text: 'You have been reassigned to the same post. The previous report has been filed.', orders: WATCH_ORDERS, note: '' },
  { title: 'Watch the corn.', text: 'The wind has dropped. You are due at the tower before dark.', orders: WATCH_ORDERS, note: 'The lights on the neighboring farm went out at 18:40.' }
];

export function createGame(mode = 'story', seed = Date.now()) {
  const s = { runId: String(seed), version: SAVE_VERSION, mode: mode === 'hard' ? 'hard' : 'story', rng: seed >>> 0 || 1, phase: 'briefing', shift: 0, time: 0,
    rounds: 6, reserve: 24, reload: 0, kills: 0, shots: 0, breaches: 0, exposure: 0,
    trust: 0, honesty: 0, evidence: [], reports: [], log: [], targets: [], nextSpawn: 3, nextId: 1,
    incident: false, lightsOut: [], entered: false, departure: null, compulsionNotice: false, searched: [], question: 0, ending: null, lastShot: null,
    player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null, fieldEvents: freshFieldEvents() };
  return s;
}
function random(s) { s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0; return s.rng / 4294967296; }
export function addLog(s, message, tone = 'normal') { s.log.unshift({ message, tone, at: Math.floor(s.time) }); s.log = s.log.slice(0, 20); }
export function startShift(s) {
  if (s.phase !== 'briefing') return false;
  s.fieldEvents.pending=null;s.fieldEvents.journey=null;
  Object.assign(s, { phase: 'tower', time: 0, rounds: 6, reserve: 24, reload: 0, targets: [], nextSpawn: 3,
    incident: false, lightsOut: [], incidentPrompted: false, entered: false, departure: null, compulsionNotice: false, question: 0, player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null, lastShot: null });
  addLog(s, `Station 04. Shift ${s.shift + 1}. Perimeter check complete.`);
  return true;
}
function spawn(s) {
  const direction = random(s) < 0.5 ? -1 : 1;
  const x = 330 + random(s) * 300;
  const y = 360 + random(s) * 90;
  const speed = (17 + s.shift * 4 + random(s) * 9) * (s.mode === 'hard' ? 1.4 : 1);
  s.targets.push({ id: s.nextId++, x, y, direction, speed, kind: 'corn', wobble: random(s) * 6.28 });
  addLog(s, 'Movement in the rows. Confirm your target.', 'alert');
}
export function advance(s, dt) {
  if (s.phase === 'guide') { advanceGuide(s, dt); return; }
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
      spawn(s); s.nextSpawn += (5.8 - s.shift * 0.65) * (s.mode === 'hard' ? .75 : 1);
    }
    if (!s.incident && s.time >= SIGHTING_TIME) {
      s.incident = true;
      // Each visible worker is a real civilian, never a decorative crop target.
      s.targets.push(...sightingPeople(s.shift).map(person=>({...person,id:s.nextId++})));
      addLog(s, watchNight(s.shift).log, 'story');
      addLog(s, 'You look toward the tower latch, then back to the gap in the rows.', 'story');
    }
    for (const target of s.targets) {
      target.x += target.direction * target.speed * step;
      if (target.kind === 'person') {
        if(s.shift===2) {
          const out=18+(target.member||0)*3;
          if(s.time-step<out&&s.time>=out) {
            s.lightsOut.push(target.member||0);
            addLog(s,['The first team light goes out.','A second team light goes dark.','The last team light goes out. No radio response.'][target.member||0],'story');
          }
        }
        if(s.time>personExitTime(s.shift,target))target.gone=true;
      }
      if (target.kind === 'corn' && (target.x < 65 || target.x > 895)) {
        target.gone = true; s.breaches++;
        addLog(s, 'Perimeter breach. Something reached the road.', 'alert');
      }
    }
    s.targets = s.targets.filter(t => !t.gone);
    if (s.breaches >= 6) finish(s, 'breach');
    else if (s.time >= SHIFT_LENGTH) {
      // Relief prevents abandonment penalties. Go directly to the playable map.
      s.phase = 'decision'; enterField(s);
    }
  }
}
export function investigationUrge(s) {
  if (s.phase !== 'tower' || !s.incident || s.time < 13) return 0;
  return Math.min(1, .22 + .78 * (s.time - 13) / (SHIFT_LENGTH - 16));
}
export function investigationPressure(s) {
  const strength = investigationUrge(s);
  if (!strength) return null;
  const stage = strength < .45 ? 0 : strength < .68 ? 1 : strength < .88 ? 2 : 3;
  return { strength, stage };
}
export function reload(s) {
  if (s.phase !== 'tower' || s.reload > 0 || s.rounds === 6 || s.reserve <= 0) return false;
  s.reload = 1.65; addLog(s, 'Reloading…'); return true;
}
export function targetAt(s, x, y, padding = 0) {
  return [...s.targets].reverse().find(t => t.kind === 'corn' && ((x-t.x)/(24+padding))**2 + ((y-(t.y-34))/(45+padding))**2 <= 1);
}
export function shoot(s, x, y, padding = 0) {
  if (s.phase !== 'tower' || s.reload > 0) return 'blocked';
  if (!s.rounds) { addLog(s, 'Empty. Reload your rifle.', 'alert'); return 'empty'; }
  s.rounds--; s.shots++; s.lastShot = { x, y, time: s.time };
  const target = targetAt(s, x, y, padding);
  if (!target) return 'miss';
  s.targets = s.targets.filter(t => t.id !== target.id);
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
  s.departure = s.phase === 'tower' ? 'chosen' : 'compelled';
  s.compulsionNotice = s.departure === 'compelled';
  s.phase = 'field'; s.entered = true;
  s.searched.push(`shift-${s.shift}`);
  addLog(s, 'Choose a landmark. Follow the paths for lower exposure, or cut through the rows.', 'story');
  if (s.compulsionNotice) addLog(s, COMPULSION_NOTICE, 'story');
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
  if (s.phase !== 'field' || s.fieldEvents.pending || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const x = s.player.x + dx, y = s.player.y + dy;
  if (x < 0 || x > 10 || y < 0 || y > 8) return false;
  s.player = { x, y }; s.fieldSteps++;
  const key = `${x},${y}`; if (!s.visited.includes(key)) s.visited.push(key);
  s.exposure = Math.min(100, s.exposure + fieldStepCost(s,x,y));
  if (s.fieldSteps === 5) addLog(s, 'The rows close behind you. Nothing here smells like rain.', 'story');
  if (s.exposure >= 70 && !s.inspected.includes('warning')) { s.inspected.push('warning'); addLog(s, 'Your hands are cold. Return before exposure reaches 100.', 'alert'); }
  if (s.exposure >= 100) finish(s, 'assimilation');
  else if(!nearbySite(s))encounterAfterStep(s);
  return true;
}
export function chooseFieldEncounter(s,id) {
  if(!resolveEncounter(s,id))return false;
  addLog(s,'An encounter between the rows is retained in your private notebook.','story');
  if(s.exposure>=100)finish(s,'assimilation');
  return true;
}
export function continueFieldEncounter(s) { return dismissEncounter(s); }
export function inspect(s) {
  if (s.phase !== 'field' || s.fieldEvents.pending) return null;
  const site = nearbySite(s);
  if (!site || site.id === 'tower' || s.inspected.includes(site.id)) return null;
  s.inspected.push(site.id);
  const id = site.id === 'corner' ? ['dress', 'badge', 'teeth'][s.shift] : site.id === 'pump' ? ['ledger', 'sample', 'glove'][s.shift] : ['roots', 'water', 'map'][s.shift];
  if (!s.evidence.includes(id)) s.evidence.push(id);
  addLog(s, 'Private observation saved. Open your notebook to read it.', 'story');
  return id;
}
export function canEatCrop(s) {
  return s.phase === 'field' && !s.fieldEvents.pending && nearbySite(s)?.id === 'pump' && s.inspected.includes('pump');
}
export function eatCrop(s) {
  if (!canEatCrop(s)) return false;
  addLog(s, 'You eat an ear from the pot in the pump house.', 'story');
  finish(s, 'consumption');
  return true;
}
export function investigationComplete(s) {
  return ['corner', 'pump', 'drain'].every(id => s.inspected.includes(id));
}
export function beginDebrief(s) {
  if (s.phase !== 'field' || s.fieldEvents.pending || nearbySite(s)?.id !== 'tower' || !investigationComplete(s)) return false;
  s.fieldEvents.journey=null;
  s.compulsionNotice=false;
  s.phase = 'debrief'; s.question = 0; return true;
}
export function getQuestion(s) {
  if (s.question === 3 && s.shift < 2) return {
    prompt: s.reports.at(-1).supervisorReply,
    context: 'He closes the folder before you can answer. His hand stays on the cover.',
    options: [{ id: 'return', label: 'Return to your post.' }]
  };
  const testimony = s.reports.filter(r => r.shift === s.shift);
  const concealedSighting = testimony[0]?.redacted;
  const correctedObservation = testimony[1]?.redacted;
  const latest = ['dress', 'badge', 'teeth'][s.shift];
  const found = s.evidence.includes(latest);
  const sighting = observedSighting(s);
  if (s.question === 0) return {
    prompt: s.departure === 'compelled' ? 'Your relief says you went down the ladder without answering him. Why did you enter the field?' : s.entered ? 'Your log shows you left the tower. What prompted you to investigate?' : 'Before we close the shift log, what did you observe in the northeast corner?',
    context: s.departure === 'compelled' ? 'Your hands still ache from the ladder. He waits for an explanation you do not have.' : 'He adjusts the microphone. Close enough to catch your breathing.',
    options: [
      { id: 'truth', label: s.departure === 'compelled' ? `I saw ${sighting}. I remember deciding to stay. Then I was on the ladder.` : s.entered ? `I saw ${sighting}. I went into the field to investigate.` : `I saw ${sighting}. I stayed at my post.`, honesty: 1, trust: -1 },
      { id: 'comply', label: s.entered ? 'I was checking the perimeter, sir.' : 'Routine crop movement. Nothing further.', honesty: -1, trust: 1 }
    ]
  };
  if (s.question === 1) {
    const fieldNote=s.fieldEvents.journal.find(j=>encounterById(j.id).night===s.shift);
    const followup = concealedSighting
      ? s.entered ? 'A perimeter check, then. Did you find anything that needs to go in the report?' : 'Routine movement. Did you see anything from the tower that would require a closer inspection?'
      : s.departure === 'compelled' ? 'I will record that you went in to investigate. What were you able to establish?' : s.entered ? 'You went in to investigate. What were you able to establish?' : 'You stayed in the tower. What could you establish from there?';
    const background = ['We have no other report of anyone entering the field tonight.', 'The recovery team sent to that corner has not returned.', 'Another recovery team is overdue. We need to account for those lights.'][s.shift];
    return { prompt: `${followup} ${background}`,
      context: found ? `From your notebook: ${EVIDENCE[latest].text}` : s.entered ? 'The notebook has no entry for the northeast corner.' : 'From the tower, you could not see what happened between the rows.',
      options: [
        { id: 'evidence', label: found ? ['I found white fabric in the corner. A stalk had grown through it.', 'I found a recovery team badge. Something shaped like an ear of corn was growing through the clip.', 'I found an ear of corn with teeth where the kernels should be.'][s.shift] : s.entered ? 'I cannot say what happened there. I did not recover anything from the corner.' : 'I cannot say. I did not reach the corner.', honesty: 1, trust: found ? -1 : 0 },
        ...(fieldNote?[{id:'field-notes',label:encounterById(fieldNote.id).report,honesty:1,trust:-1}]:[]),
        { id: 'redact', label: 'Nothing outside the expected growth pattern.', honesty: -1, trust: 1 }
      ] };
  }
  const response = correctedObservation
    ? 'Then I will record no unusual findings.'
    : found ? 'I have noted your description. It will be reviewed separately.' : 'Then the record will show that you could not establish what happened in the corner.';
  if (s.shift < 2) return {
    prompt: `${response} The report for signature describes routine crop movement and recommends continuing the watch. Will you sign it?`,
    context: 'He turns the report toward you. The pen is already uncapped.',
    options: [
      { id: 'question', label: s.evidence.includes('ledger') ? 'Before I sign: I found a treatment ledger in the pump house. The application amounts keep increasing. What are you putting on this crop?' : s.evidence.includes('sample') ? 'Before I sign: I found a sealed sample beside the treatment drums. Something inside it was moving. What is the treatment supposed to do?' : 'I cannot approve this as routine. If the crop has to be kept inside a perimeter, why are we continuing the watch instead of closing the field?', honesty: 1, trust: -1 },
      { id: 'sign', label: 'I will sign the report and return to the watchtower.', honesty: -1, trust: 1 }
    ]
  };
  return { prompt: `${response} I am authorizing another search of the northeast corner. Will you assist the team, or sign the report and return to your post?`, context: 'He unfolds a field map over the report. Three names are penciled along its edge.', options: [
    { id: 'expose', label: 'No more teams. I will take my evidence outside the department.', detail: 'Requires 3 exhibits, including the application record or sealed sample.', disabled: s.evidence.length < 3 || !s.evidence.some(e => ['ledger', 'sample'].includes(e)) },
    { id: 'guide', label: s.searched.some(place => /^shift-/.test(place)) ? 'I have been inside the field. I will lead the team to the northeast corner.' : 'I will go in with the team and help search the northeast corner.' },
    { id: 'sign', label: 'I will sign the report and return to the watchtower.' }
  ] };
}

export function answer(s, id) {
  if (s.phase !== 'debrief') return false;
  if (s.question === 3) {
    if (id !== 'return' || s.shift >= 2) return false;
    nextShift(s);
    return true;
  }
  const q = getQuestion(s), option = q.options.find(o => o.id === id && !o.disabled);
  if (!option) return false;
  s.honesty += option.honesty || 0; s.trust += option.trust || 0;
  s.reports.push({ shift: s.shift, question: q.prompt, answer: option.label, redacted: ['redact', 'comply', 'sign'].includes(id) });
  if (s.question === 2 && id === 'question' && s.shift < 2) {
    s.reports.at(-1).supervisorReply = s.evidence.some(e => ['ledger', 'sample'].includes(e))
      ? 'Do you need to know that to do your job? Watch the corn. Shoot any that try to escape. Return to your post.'
      : 'Closing the field is not your decision. Watch the corn. Shoot any that try to escape. Return to your post.';
    s.question = 3;
    return true;
  }
  s.question++;
  if (s.question === 3) {
    if (s.shift === 2) {
      if (id === 'guide') startGuide(s);
      else finish(s, id === 'expose' ? 'witness' : s.honesty >= 2 ? 'dissent' : 'compliance');
    }
    else nextShift(s);
  }
  return true;
}
function nextShift(s) {
  s.shift++; s.phase = 'briefing'; s.exposure = Math.max(0, s.exposure - 12);
}
export const ENDINGS = {
  consumption: { code: '07', title: 'Nothing wasted.', stamp: 'SPECIMEN INGESTED', text: 'The first bite is sweet. You finish the ear before you notice the boiling has stopped. Something fine catches between your teeth. When you pull it free, the pain comes from beneath your tongue. Your radio calls you back to the tower. You try to answer, but your mouth is full of warm soil. Outside, the rows lean toward the pump house.', last: 'For the first time tonight, you are no longer hungry.' },
  witness: { code: '01', title: 'An unofficial record.', stamp: 'DISTRIBUTION UNAUTHORIZED', text: 'The photographs and application records reach someone outside the department. The field is closed pending an inquiry. For a week, no one calls you. Then a farmer three counties away sends a photograph of his drainage ditch.', last: 'You keep the original report.' },
  guide: { code: '02', title: 'You remember where.', stamp: 'RECOVERY PENDING', text: 'They follow you between the rows. You know each turn before you take it. Behind you, someone asks why the path is so warm. At the northeast corner, the corn makes room.', last: 'This makes three, sir.' },
  compliance: { code: '03', title: 'Within acceptable limits.', stamp: 'REPORT APPROVED', text: 'The corrections are filed. The next treatment is authorized. From the tower, the road looks narrower than it did yesterday. Your replacement asks if the corn has always grown on both sides.', last: 'You watch the corn grow.' },
  dissent: { code: '04', title: 'Unfit for field duty.', stamp: 'TESTIMONY DISPUTED', text: 'Your final report is approved. The earlier objections are attached to your medical evaluation. They take your badge and issue a transfer. From the bus window, field after field passes in the dark.', last: 'You cannot see where this one ends.' },
  breach: { code: '05', title: 'Beyond the perimeter.', stamp: 'CONTAINMENT LOST', text: 'The sixth movement crosses the road. Dispatch tells you to stay on the line. From somewhere beyond the station comes the sound of stalks brushing together. There are no fields on that side.', last: '[static]' },
  assimilation: { code: '06', title: 'Expected growth.', stamp: 'PERSONNEL UNACCOUNTED FOR', text: 'You stop to catch your breath. The rows stop with you. Somewhere a radio calls your number, then calls it again. You understand at last why the field has been so patient.', last: 'Nothing here is wasted.' }
};
export function getEnding(s) {
  return s.ending === 'guide' && s.guide ? { ...ENDINGS.guide, ...guideDisposition(s) } : ENDINGS[s.ending];
}
function finish(s, ending) { s.phase = 'ending'; s.ending = ending; s.targets = [];s.compulsionNotice=false;s.fieldEvents.pending=null;s.fieldEvents.journey=null; }

export function serialize(s) { return JSON.stringify(s); }
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || ![1,SAVE_VERSION].includes(s.version) || !(s.version === 1 ? ['standard','story'] : ['story','hard']).includes(s.mode) || !['briefing','tower','decision','field','debrief','guide','ending'].includes(s.phase)) return null;
    if (!Number.isInteger(s.shift) || s.shift < 0 || s.shift > 2 || !Number.isInteger(s.question) || s.question < 0 || s.question > 3) return null;
    for (const key of ['time','rounds','reserve','reload','kills','shots','breaches','exposure','trust','honesty','rng','nextSpawn','nextId','fieldSteps']) if (!Number.isFinite(s[key])) return null;
    if (s.time < 0 || s.time > SHIFT_LENGTH + 1 || s.rounds < 0 || s.rounds > 6 || s.reserve < 0 || s.exposure < 0 || s.exposure > 100) return null;
    for (const key of ['evidence','reports','log','targets','searched','visited','inspected']) if (!Array.isArray(s[key]) || s[key].length > 200) return null;
    if (!s.evidence.every(e => Object.hasOwn(EVIDENCE,e))) return null;
    if (!s.player || !Number.isInteger(s.player.x) || !Number.isInteger(s.player.y) || s.player.x < 0 || s.player.x > 10 || s.player.y < 0 || s.player.y > 8) return null;
    migrateFieldEvents(s);
    if(!validFieldEvents(s))return null;
    if (!s.targets.every(t => Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.speed) && Number.isFinite(t.wobble) && [-1,1].includes(t.direction) && ['corn','person'].includes(t.kind))) return null;
    if (!s.targets.every(t=>(t.role===undefined||['dress','retrieval'].includes(t.role))&&(t.member===undefined||(Number.isInteger(t.member)&&t.member>=0&&t.member<3)))) return null;
    if (s.lightsOut===undefined)s.lightsOut=[];
    if (!Array.isArray(s.lightsOut)||s.lightsOut.length>3||new Set(s.lightsOut).size!==s.lightsOut.length||!s.lightsOut.every(i=>Number.isInteger(i)&&i>=0&&i<3))return null;
    // Both former intensities continue as Story, with the former Standard balance.
    // Upgrade existing easy-mode crops once; preserve positions and earned progress.
    if (s.version === 1) {
      if (s.mode === 'story') for (const target of s.targets) if (target.kind === 'corn') target.speed /= .58;
      s.mode = 'story';
      s.version = SAVE_VERSION;
    }
    if (!s.log.every(l => typeof l.message === 'string') || !s.reports.every(r => typeof r.question === 'string' && typeof r.answer === 'string')) return null;
    if (s.phase === 'ending' && !Object.hasOwn(ENDINGS,s.ending)) return null;
    if (s.phase === 'debrief' && s.question === 3 && (s.shift >= 2 || typeof s.reports.at(-1)?.supervisorReply !== 'string')) return null;
    if (s.phase === 'guide' || s.guide) {
      const g=s.guide;
      if (!g || typeof g.message !== 'string' || !['search','escape'].includes(g.stage) || !['x','y','angle','steps','time','fired'].every(k => Number.isFinite(g[k]))) return null;
      if (g.x<1 || g.x>=12 || g.y<1 || g.y>=12 || g.steps<0 || g.time<0 || g.fired<0 || g.fired>6) return null;
      if (!Array.isArray(g.clues) || g.clues.length>3 || !g.clues.every((id,i)=>id===['boot','radio','corner'][i])) return null;
      if (!Array.isArray(g.team) || g.team.length>3 || !g.team.every(t=>Number.isInteger(t.id)&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.distance)&&['running','shot','escaped'].includes(t.status))) return null;
      if (g.stage==='escape' && (g.team.length!==3 || g.clues.length!==3)) return null;
    }
    // Saves from the removed interstitial now resume directly on the map.
    if (s.phase === 'decision') { s.incident = true; s.targets = []; enterField(s); }
    else if (s.departure === undefined) s.departure = s.entered ? (s.time >= SHIFT_LENGTH ? 'compelled' : 'chosen') : null;
    if (![null, 'chosen', 'compelled'].includes(s.departure)) return null;
    if (s.compulsionNotice === undefined) s.compulsionNotice = false;
    if (typeof s.compulsionNotice !== 'boolean') return null;
    if (typeof s.runId !== 'string') s.runId = `legacy-${s.rng}`;
    // Older saves used discovery titles as log receipts, revealing them outside the exhibit.
    const oldReceipts = new Set(Object.values(EVIDENCE).map(e => `${e.title} entered in your private notebook.`));
    s.log = s.log.map(entry => oldReceipts.has(entry.message)
      ? { ...entry, message: 'Private observation saved. Open your notebook to read it.' }
      : entry);
    return s;
  } catch { return null; }
}
