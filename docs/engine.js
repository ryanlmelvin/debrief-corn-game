import { SIGHTING_TIME, sightingPeople, watchNight, personExitTime, observedSighting } from './watch-story.js';
import { startGuide, advanceGuide, guideDisposition, restoreGuideRoute } from './guide.js';
import { ENDING_SHARES } from './sharing.js';
import { ALTERNATE_ENDINGS, startResolution, validResolution, resolutionEnding } from './alternate-endings.js';
import { ROGUE_ENDINGS, rogueEnding } from './rogue-endings.js';
import { startRogue, advanceRogue, validRogue } from './rogue.js';
import { witnessRequirements, canTakeEvidenceOutside, retirePreparations } from './ending-requirements.js';
import { fieldStepCost } from './field.js';
import { EVIDENCE, evidenceForState, evidenceAtSite, freshEvidenceScenes, migrateEvidenceScenes, validEvidenceScenes } from './evidence-scenes.js';
import { freshSiteStories, siteScene, migrateSiteStories, validSiteStories } from './site-encounters.js';
import { freshFieldEvents, encounterAfterStep, resolveEncounter, dismissEncounter, migrateFieldEvents, validFieldEvents, encounterById, encounterForState } from './encounters.js';
import { RELOAD_DURATION, RELOAD_WINDOW_MIN, RELOAD_WINDOW_MAX, FLARE_DURATION, FLARE_SLOWDOWN, RUSH_DURATION, RUSH_BONUS, CROP_VARIANTS, freshWatch, watchFeedback, watchWave, bellStatus, migrateWatch, validWatch } from './watch-play.js';
export { bellStatus } from './watch-play.js';
// All simulation and story state lives here. Rendering and storage are separate.
export const SAVE_VERSION = 2;
export const SHIFT_LENGTH = 55;
export const COMPULSION_NOTICE = 'You could not resist the urge to investigate any longer.';
export const DATES = ['SEPTEMBER 30', 'OCTOBER 14', 'OCTOBER 29'];
export const REPORT_DATES = ['OCTOBER 01', 'OCTOBER 15', 'OCTOBER 30'];
export { EVIDENCE, evidenceForState } from './evidence-scenes.js';
const WATCH_ORDERS = ['Watch the corn. Shoot any that try to escape.', 'Remain in the watchtower.', 'Do not consume the crop.', 'Remember any irregularities for your debrief at the end of the night.'];
export const BRIEFINGS = [
  { title: 'Watch the corn.', text: 'Your post overlooks an experimental crop outside ██████, Illinois. The night shift is quiet. Usually.', orders: WATCH_ORDERS, note: 'Your relief comes at the end of the night.' },
  { title: 'Watch the corn.', text: 'You have been reassigned to the same post. The previous report has been filed.', orders: WATCH_ORDERS, note: '' },
  { title: 'Watch the corn.', text: 'The wind has dropped. You are due at the tower before dark.', orders: WATCH_ORDERS, note: 'The lights on the neighboring farm went out at 18:40.' }
];

export function createGame(mode = 'story', seed = Date.now()) {
  const s = { runId: String(seed), version: SAVE_VERSION, mode: mode === 'hard' ? 'hard' : 'story', rng: seed >>> 0 || 1, phase: 'briefing', shift: 0, time: 0,
    rounds: 6, reserve: 24, reload: 0, kills: 0, shots: 0, breaches: 0, exposure: 0,
    trust: 0, honesty: 0, evidence: [], evidenceScenes: freshEvidenceScenes(seed), reports: [], log: [], targets: [], nextSpawn: 3, nextId: 1,
    incident: false, lightsOut: [], entered: false, departure: null, compulsionNotice: false, searched: [], question: 0, ending: null, lastShot: null,
    player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null, fieldEvents: freshFieldEvents(seed), siteStories: freshSiteStories(seed), watch: freshWatch() };
  return s;
}
function random(s) { s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0; return s.rng / 4294967296; }
export function addLog(s, message, tone = 'normal') { s.log.unshift({ message, tone, at: Math.floor(s.time) }); s.log = s.log.slice(0, 20); }
export function startShift(s) {
  if (s.phase !== 'briefing') return false;
  s.fieldEvents.pending=null;s.fieldEvents.journey=null;
  s.watch = freshWatch(s.breaches);
  Object.assign(s, { phase: 'tower', time: 0, rounds: 6, reserve: 24, reload: 0, targets: [], nextSpawn: 3,
    incident: false, lightsOut: [], incidentPrompted: false, entered: false, departure: null, compulsionNotice: false, question: 0, player: { x: 1, y: 7 }, visited: ['1,7'], fieldSteps: 0, inspected: [], focused: null, lastShot: null });
  addLog(s, `Station 04. Shift ${s.shift + 1}. Perimeter check complete.`);
  return true;
}
function spawnCrop(s, variant) {
  const direction = random(s) < 0.5 ? -1 : 1;
  const x = 330 + random(s) * 300;
  const y = 360 + random(s) * 90;
  const speed = (17 + s.shift * 4 + random(s) * 9) * (s.mode === 'hard' ? 1.4 : 1) * CROP_VARIANTS[variant].speed;
  s.targets.push({ id: s.nextId++, x, y, direction, speed, kind: 'corn', wobble: random(s) * 6.28, variant, hp: CROP_VARIANTS[variant].hp });
  return s.targets.at(-1);
}
function spawn(s) {
  const index = s.watch.spawnCount++, wave = watchWave(s, index);
  if (!wave) return;
  for (const [i, variant] of wave.variants.entries()) {
    const target = spawnCrop(s, variant);
    target.direction = wave.side === 'both' ? (i % 2 ? 1 : -1) : wave.side === 'left' ? -1 : 1;
    if (wave.variants.length > 1) {
      target.x = 350 + i * 120 + target.x % 35;
      target.y = 375 + (i % 2) * 60;
    }
  }
  if (wave.variants.length > 1) {
    const side = wave.side === 'both' ? 'Both sides' : `${wave.side === 'left' ? 'Left' : 'Right'} fence`;
    addLog(s, `${wave.label}. ${wave.variants.length} movements toward ${wave.side === 'both' ? 'both fences' : `the ${wave.side} fence`}.`, 'alert');
    watchFeedback(s, `${wave.label} · ${side}`, 'alert');
  } else {
    const variant = wave.variants[0];
    const message = variant === 'runner' ? 'Runner in the rows. It is moving fast.' : variant === 'husk' ? 'Armored husk. Break the shell, then fire again.' : 'Movement in the rows. Confirm your target.';
    addLog(s, message, 'alert');
    if (index < 3) watchFeedback(s, variant === 'runner' ? 'RUNNER · Fast, one shot' : variant === 'husk' ? 'HUSK · Two shots' : 'STALKER · One shot', 'ready');
  }
}

function earnFlare(s) {
  if (s.watch.flares >= 2) return false;
  s.watch.flares++; s.watch.flaresEarned++;
  return true;
}
function loseRush(s, message = 'RUSH LOST · Contain the remaining crops') {
  if (s.watch.rush?.status !== 'active') return false;
  Object.assign(s.watch.rush, { status: 'lost', finishedAt: s.time });
  watchFeedback(s, message, 'alert');
  addLog(s, 'The bell challenge is lost. Any remaining crops still need to be contained.', 'alert');
  return true;
}
function checkRush(s) {
  const rush = s.watch.rush;
  if (rush?.status !== 'active') return;
  if (s.time >= rush.deadline) { loseRush(s, 'TIME UP · Contain the remaining crops'); return; }
  if (s.targets.some(t => rush.targetIds.includes(t.id))) return;
  Object.assign(rush, { status: 'won', finishedAt: s.time });
  s.watch.rushesWon++; s.watch.score += RUSH_BONUS; s.reserve += 6;
  const flareEarned = earnFlare(s);
  watchFeedback(s, `RUSH CLEARED · +${RUSH_BONUS} · +6 rounds${flareEarned ? ' · +1 flare' : ''}`, 'ready');
  addLog(s, `Bell challenge cleared. ${RUSH_BONUS} bonus points and six reserve rounds earned${flareEarned ? ', with a replacement flare' : ''}.`);
}
export function ringBell(s) {
  if (!bellStatus(s).available) return false;
  const id = ++s.watch.bellsUsed, targetIds = [];
  for (const [i, variant] of ['stalker','runner','husk'].entries()) {
    const target = spawnCrop(s, variant);
    Object.assign(target, { x: 350 + i * 130, y: i === 1 ? 435 : 375, direction: i === 1 ? -1 : 1, rushId: id });
    targetIds.push(target.id);
  }
  s.watch.rush = { id, targetIds, deadline: s.time + RUSH_DURATION, status: 'active', finishedAt: null };
  watchFeedback(s, 'BELL RUSH · Clear 3 marked crops in 10s', 'alert');
  addLog(s, 'You ring the station bell. Three marked crops answer. Clear all three in ten seconds for 600 points, six rounds, and a replacement flare.', 'alert');
  return true;
}
export function advance(s, dt) {
  if (s.phase === 'rogue') { advanceRogue(s, dt); return; }
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
        completeReload(s);
      }
    }
    if (s.time >= s.nextSpawn && s.time < (s.watch.waveVersion === 0 ? SHIFT_LENGTH - 13 : SHIFT_LENGTH)) {
      spawn(s);
      s.nextSpawn = watchWave(s)?.at ?? SHIFT_LENGTH + 1;
    }
    if (!s.incident && s.time >= SIGHTING_TIME) {
      s.incident = true;
      // Each visible worker is a real civilian, never a decorative crop target.
      s.targets.push(...sightingPeople(s.shift).map(person=>({...person,id:s.nextId++})));
      addLog(s, watchNight(s.shift).log, 'story');
      addLog(s, 'You look toward the tower latch, then back to the gap in the rows.', 'story');
    }
    for (const target of s.targets) {
      const slowed = target.kind === 'corn' ? Math.max(0, Math.min(step, s.watch.flareUntil - (s.time - step))) : 0;
      target.x += target.direction * target.speed * (step - slowed * (1 - FLARE_SLOWDOWN));
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
        s.watch.streak = 0;
        watchFeedback(s, 'BREACH · Chain broken', 'alert', target);
        addLog(s, 'Perimeter breach. Something reached the road.', 'alert');
        if (target.rushId === s.watch.rush?.id) loseRush(s, 'RUSH LOST · A marked crop escaped');
      }
    }
    s.targets = s.targets.filter(t => !t.gone);
    checkRush(s);
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
  if (s.phase !== 'tower' || s.rounds === 6 || s.reserve <= 0) return false;
  if (s.reload > 0) {
    if (s.watch.reloadAttempted) return false;
    s.watch.reloadAttempted = true;
    if (s.reload >= RELOAD_WINDOW_MIN && s.reload <= RELOAD_WINDOW_MAX) {
      completeReload(s); s.watch.fastReloads++;
      watchFeedback(s, 'QUICK RELOAD · Rifle ready', 'ready');
      return true;
    }
    watchFeedback(s, 'Keep loading · Rifle ready shortly', 'alert');
    return false;
  }
  s.reload = RELOAD_DURATION; s.watch.reloadAttempted = false;
  addLog(s, 'Reloading… Tap again in the marked band for a quick reload.'); return true;
}
function completeReload(s) {
  const n = Math.min(6 - s.rounds, s.reserve);
  s.rounds += n; s.reserve -= n; s.reload = 0;
  addLog(s, 'Rifle ready.');
}
export function flare(s) {
  if (s.phase !== 'tower' || s.watch.flares <= 0 || s.watch.flareUntil > s.time) return false;
  s.watch.flares--; s.watch.flareUntil = s.time + FLARE_DURATION;
  watchFeedback(s, 'FLARE UP · The crop recoils', 'ready');
  addLog(s, 'The flare burns over the rows. The crop slows in its light.');
  return true;
}
export function targetAt(s, x, y, padding = 0) {
  return [...s.targets].reverse().find(t => t.kind === 'corn' && ((x-t.x)/(24+padding))**2 + ((y-(t.y-34))/(45+padding))**2 <= 1);
}
export function shoot(s, x, y, padding = 0) {
  if (s.phase !== 'tower' || s.reload > 0) return 'blocked';
  if (!s.rounds) { addLog(s, 'Empty. Reload your rifle.', 'alert'); return 'empty'; }
  s.rounds--; s.shots++; s.watch.shots++;
  s.lastShot = { x, y, time: s.time, result: 'miss', points: 0, variant: null, streak: 0 };
  const target = targetAt(s, x, y, padding);
  if (!target) {
    s.watch.streak = 0; watchFeedback(s, 'MISS · Chain broken', 'alert', { x, y });
    return 'miss';
  }
  const variant = target.variant || 'stalker';
  Object.assign(s.lastShot, { targetId: target.id, target: { ...target } });
  s.watch.hits++;
  target.hp = (target.hp ?? 1) - 1;
  if (target.hp > 0) {
    Object.assign(s.lastShot, { result: 'armor', variant, streak: s.watch.streak });
    watchFeedback(s, 'SHELL BROKEN · Hit it again', 'armor', target);
    return 'armor';
  }
  s.targets = s.targets.filter(t => t.id !== target.id);
  s.kills++; s.watch.contained++; s.watch.streak++;
  s.watch.bestStreak = Math.max(s.watch.bestStreak, s.watch.streak);
  const points = CROP_VARIANTS[variant].points + Math.min(5, s.watch.streak - 1) * 25;
  s.watch.score += points;
  Object.assign(s.lastShot, { result: 'hit', points, variant, streak: s.watch.streak });
  watchFeedback(s, `+${points}${s.watch.streak > 1 ? ` · ${s.watch.streak} IN A ROW` : ' · CONTAINED'}`, 'hit', target);
  if (s.watch.streak % 5 === 0 && earnFlare(s)) {
    watchFeedback(s, `${s.watch.streak} IN A ROW · +1 FLARE`, 'ready', target);
    addLog(s, 'Five clean containments. A replacement flare is ready.');
  }
  checkRush(s);
  addLog(s, 'Mobile crop contained.'); return 'hit';
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
  loseRush(s, 'RUSH ABANDONED · Bonus lost');
  // Leaving early lets any specimens already loose escape an unattended post.
  if (s.phase === 'tower') {
    const loose = s.targets.filter(t => t.kind === 'corn').length;
    s.breaches += loose;
    if (loose) s.watch.streak = 0;
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
  if (s.exposure >= 100) startRogue(s, 'corn');
  else if(!nearbySite(s))encounterAfterStep(s);
  return true;
}
export function chooseFieldEncounter(s,id) {
  if(!resolveEncounter(s,id))return false;
  addLog(s,'An encounter between the rows is retained in your private notebook.','story');
  if(s.exposure>=100)startRogue(s,'corn');
  return true;
}
export function continueFieldEncounter(s) { return dismissEncounter(s); }
export function inspect(s) {
  if (s.phase !== 'field' || s.fieldEvents.pending) return null;
  const site = nearbySite(s);
  if (!site || site.id === 'tower' || s.inspected.includes(site.id)) return null;
  const id = evidenceAtSite(site.id, s.shift);
  if (!id) return null;
  s.inspected.push(site.id);
  if (!s.evidence.includes(id)) s.evidence.push(id);
  addLog(s, 'Private observation saved. Open your notebook to read it.', 'story');
  return id;
}
export function currentSiteScene(s) {
  if(s.phase!=='field'||s.fieldEvents.pending)return null;
  const site=nearbySite(s);
  return site&&s.inspected.includes(site.id)?siteScene(s,site.id):null;
}
export function canEatCrop(s) { return currentSiteScene(s)?.id==='cooking'; }
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
      context: found ? `From your notebook: ${evidenceForState(s,latest).text}` : s.entered ? 'The notebook has no entry for the northeast corner.' : 'From the tower, you could not see what happened between the rows.',
      options: [
        { id: 'evidence', label: found ? ['I found white fabric in the corner. A stalk had grown through it.', 'I found a recovery team badge. Something shaped like an ear of corn was growing through the clip.', 'I found an ear of corn with teeth where the kernels should be.'][s.shift] : s.entered ? 'I cannot say what happened there. I did not recover anything from the corner.' : 'I cannot say. I did not reach the corner.', honesty: 1, trust: found ? -1 : 0 },
        ...(fieldNote?[{id:'field-notes',label:encounterForState(s,fieldNote.id).report,honesty:1,trust:-1}]:[]),
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
    { id: 'expose', label: 'No more teams. I will take my evidence outside the department.', requirements: witnessRequirements(s), disabled: !canTakeEvidenceOutside(s) },
    { id: 'guide', label: s.searched.some(place => /^shift-/.test(place)) ? 'I have been inside the field. I will lead the team to the northeast corner.' : 'I will go in with the team and help search the northeast corner.' },
    { id: 'follow-lead', label: 'I need to do something first.' },
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
  if (id === 'follow-lead') return startResolution(s);
  s.honesty += option.honesty || 0; s.trust += option.trust || 0;
  s.reports.push({ shift: s.shift, choice: id, question: q.prompt, answer: option.label, redacted: ['redact', 'comply', 'sign'].includes(id) });
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
  guide_interrupted: { code: '09', title: 'I went off script.', stamp: 'RECORDING INTERRUPTED', transcript: true, text: '██████: I watch the corn grow. I shoot any that try to escape.\n\n[gunshot]\n\n[sounds of a struggle]\n\n[static]\n\n[static]\n\n[static]', last: '' },
  consumption: { code: '07', title: 'Nothing wasted.', stamp: 'SPECIMEN INGESTED', text: 'The first bite is sweet. You finish the ear before you notice the boiling has stopped. Something fine catches between your teeth. When you pull it free, the pain comes from beneath your tongue. Your radio calls you back to the tower. You try to answer, but your mouth is full of warm soil. Outside, the rows lean toward the pump house.', last: 'For the first time tonight, you are no longer hungry.' },
  witness: { code: '01', title: 'An unofficial record.', stamp: 'DISTRIBUTION UNAUTHORIZED', text: 'The photographs and application records reach someone outside the department. The field is closed pending an inquiry. For a week, no one calls you. Then a farmer three counties away sends a photograph of his drainage ditch.', last: 'You keep the original report.' },
  guide: { code: '02', title: ENDING_SHARES.guide.line, stamp: 'RECOVERY PENDING', text: 'They follow you between the rows. You know each turn before you take it. Behind you, someone asks why the path is so warm. At the northeast corner, the corn makes room.', last: 'This makes three, sir.' },
  guide_shot: { code: '10', title: ENDING_SHARES.guide_shot.line, stamp: 'PERIMETER SECURED', text: 'The department records three escaping specimens contained and no personnel incident. Your account remains on a tape marked for reuse. At the next shift, the rifle is waiting in the tower. Three lamps have been removed from the equipment shelf.', last: 'Watch the corn. Shoot any that try to escape.' },
  guide_arrested: { code: '08', title: ENDING_SHARES.guide_arrested.line, stamp: 'TAKEN INTO CUSTODY', text: 'Their account brings the police to the station. After the recorded interview, a deputy places you under arrest and takes your rifle, your badge, and the tape. The supervisor keeps the written orders.', last: 'For once, the record names the people who were there.' },
  compliance: { code: '03', title: 'Within acceptable limits.', stamp: 'REPORT APPROVED', text: 'The corrections are filed. The next treatment is authorized. From the tower, the road looks narrower than it did yesterday. Your replacement asks if the corn has always grown on both sides.', last: 'You watch the corn grow.' },
  dissent: { code: '04', title: 'Unfit for field duty.', stamp: 'TESTIMONY DISPUTED', text: 'Your final report is approved. The earlier objections are attached to your medical evaluation. They take your badge and issue a transfer. From the bus window, field after field passes in the dark.', last: 'You cannot see where this one ends.' },
  breach: { code: '05', title: 'Beyond the perimeter.', stamp: 'CONTAINMENT LOST', text: 'The sixth movement crosses the road. Dispatch tells you to stay on the line. From somewhere beyond the station comes the sound of stalks brushing together. There are no fields on that side.', last: '[static]' },
  assimilation: { code: '06', title: 'Expected growth.', stamp: 'PERSONNEL UNACCOUNTED FOR', text: 'You stop to catch your breath. The rows stop with you. Somewhere a radio calls your number, then calls it again. You understand at last why the field has been so patient.', last: 'Nothing here is wasted.' },
  ...ALTERNATE_ENDINGS,
  ...ROGUE_ENDINGS
};
for (const [id, card] of Object.entries(ENDING_SHARES)) ENDINGS[id].title = card.line;
export function endingId(s) {
  if (s.ending !== 'guide' || !s.guide) return s.ending;
  const outcome = s.guide.outcome;
  if (outcome === 'secured') return 'guide_shot';
  if (outcome === 'arrested') return 'guide_arrested';
  if (s.guide.team?.some(person => person.status === 'shot')) return s.guide.team.every(person => person.status === 'shot') ? 'guide_shot' : 'guide_arrested';
  return 'guide';
}
export function getEnding(s) {
  if (!Object.hasOwn(ENDINGS,s.ending)) return undefined;
  return s.ending === 'guide' && s.guide ? { ...ENDINGS[endingId(s)], ...guideDisposition(s), title: ENDINGS[endingId(s)].title } : { ...ENDINGS[s.ending], ...resolutionEnding(s), ...rogueEnding(s) };
}
function finish(s, ending) { loseRush(s);s.phase = 'ending'; s.ending = ending; s.targets = [];s.compulsionNotice=false;s.fieldEvents.pending=null;s.fieldEvents.journey=null; }

export function serialize(s) { return JSON.stringify(s); }
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || ![1,SAVE_VERSION].includes(s.version) || !(s.version === 1 ? ['standard','story'] : ['story','hard']).includes(s.mode) || !['briefing','tower','decision','field','debrief','resolution','rogue','guide','ending'].includes(s.phase)) return null;
    // Keep practice provenance through every save/restore path. A mini game
    // cannot resume as a different route or as a normal story assignment.
    if (s.practice !== undefined) {
      if (!['watch', 'corn', 'broadcast', 'flood', 'dungeon'].includes(s.practice)) return null;
      if (s.practice === 'watch') {
        if (s.rogue !== undefined || !['tower', 'field', 'ending'].includes(s.phase) || s.phase === 'ending' && s.ending !== 'breach') return null;
      } else if (s.rogue?.route !== s.practice || !['rogue', 'ending'].includes(s.phase)) return null;
    }
    if (!Number.isInteger(s.shift) || s.shift < 0 || s.shift > 2 || !Number.isInteger(s.question) || s.question < 0 || s.question > 3) return null;
    for (const key of ['time','rounds','reserve','reload','kills','shots','breaches','exposure','trust','honesty','rng','nextSpawn','nextId','fieldSteps']) if (!Number.isFinite(s[key])) return null;
    if (s.time < 0 || s.time > SHIFT_LENGTH + 1 || s.rounds < 0 || s.rounds > 6 || s.reserve < 0 || s.exposure < 0 || s.exposure > 100) return null;
    for (const key of ['evidence','reports','log','targets','searched','visited','inspected']) if (!Array.isArray(s[key]) || s[key].length > 200) return null;
    if (!s.evidence.every(e => Object.hasOwn(EVIDENCE,e))) return null;
    if (!s.player || !Number.isInteger(s.player.x) || !Number.isInteger(s.player.y) || s.player.x < 0 || s.player.x > 10 || s.player.y < 0 || s.player.y > 8) return null;
    migrateFieldEvents(s);
    if(!validFieldEvents(s))return null;
    migrateEvidenceScenes(s);
    if(!validEvidenceScenes(s))return null;
    migrateSiteStories(s);
    if(!validSiteStories(s))return null;
    if (!s.targets.every(t => Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.speed) && Number.isFinite(t.wobble) && [-1,1].includes(t.direction) && ['corn','person'].includes(t.kind))) return null;
    if (!s.targets.every(t=>(t.role===undefined||['dress','retrieval'].includes(t.role))&&(t.member===undefined||(Number.isInteger(t.member)&&t.member>=0&&t.member<3)))) return null;
    migrateWatch(s);
    if (!validWatch(s)) return null;
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
    if (!retirePreparations(s)) return null;
    if (!validResolution(s)) return null;
    if (!validRogue(s)) return null;
    if (s.phase === 'ending' && !Object.hasOwn(ENDINGS,s.ending)) return null;
    if (s.ending === 'guide_interrupted' && (s.phase !== 'ending' || !s.guide)) return null;
    if (s.phase === 'debrief' && s.question === 3 && (s.shift >= 2 || typeof s.reports.at(-1)?.supervisorReply !== 'string')) return null;
    if (s.phase === 'guide' || s.guide) {
      const g=s.guide;
      if (!g || typeof g.message !== 'string' || !['search','escape','debrief'].includes(g.stage) || !['x','y','angle','steps','time','fired'].every(k => Number.isFinite(g[k]))) return null;
      if (g.x<1 || g.x>=12 || g.y<1 || g.y>=12 || g.steps<0 || g.time<0 || !Number.isInteger(g.fired) || g.fired<0 || g.fired>6) return null;
      if (!Array.isArray(g.clues) || g.clues.length>3 || !g.clues.every((id,i)=>id===['boot','radio','corner'][i])) return null;
      if (!Array.isArray(g.team) || g.team.length>3 || !g.team.every(t=>Number.isInteger(t.id)&&t.id>=1&&t.id<=3&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.distance)&&['running','shot','escaped'].includes(t.status))) return null;
      if (new Set(g.team.map(t=>t.id)).size!==g.team.length) return null;
      if (['escape','debrief'].includes(g.stage) && (g.team.length!==3 || g.clues.length!==3)) return null;
      if (!restoreGuideRoute(s)) return null;
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
