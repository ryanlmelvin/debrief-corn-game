// Tower-only mastery and supplies. None of these scores change the story endings.
export const RELOAD_DURATION = 1.65;
export const RELOAD_WINDOW_MIN = .45;
export const RELOAD_WINDOW_MAX = .85;
export const FLARE_DURATION = 4.5;
export const FLARE_SLOWDOWN = .15;
export const RUSH_DURATION = 10;
export const RUSH_BONUS = 600;
export const CROP_VARIANTS = {
  stalker: { speed: 1, hp: 1, points: 100 },
  runner: { speed: 1.6, hp: 1, points: 150 },
  husk: { speed: .78, hp: 2, points: 200 }
};

export function freshWatch(breaches = 0) {
  return { score: 0, streak: 0, bestStreak: 0, hits: 0, shots: 0, contained: 0,
    breachesAtStart: breaches, flares: 2, flareUntil: 0, reloadAttempted: false,
    fastReloads: 0, feedback: null, spawnCount: 0, waveVersion: 1,
    bellsUsed: 0, rushesWon: 0, flaresEarned: 0, rush: null };
}

// Preview and simulation share this pure plan. Looking ahead never consumes RNG.
function waveSeed(s, index) {
  let hash = 2166136261;
  for (const char of `${s.runId}:${s.shift}:${index}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function watchWave(s, index = s.watch.spawnCount) {
  const interval = (5.8 - s.shift * .65) * (s.mode === 'hard' ? .75 : 1);
  const seed = waveSeed(s, index), side = seed % 2 ? 'left' : 'right';
  if (s.watch.waveVersion === 0) {
    const variant = ['stalker','runner','husk','stalker'][index % 4];
    return { at: 3 + index * interval, label: index % 4 === 3 ? 'SPLIT SURGE' : variant.toUpperCase(), side: index % 4 === 3 ? 'both' : side, variants: index % 4 === 3 ? ['stalker','runner'] : [variant] };
  }
  if (index < 3) return { at: 3 + index * interval, label: ['STALKER','RUNNER','HUSK'][index], side, variants: [['stalker'],['runner'],['husk']][index] };
  if (index === 3) return { at: 3 + index * interval, label: 'SPLIT SURGE', side: 'both', variants: ['stalker','runner'] };
  if (index > 7) return null;
  const hard = s.mode === 'hard';
  const at = index === 7 ? 41 : (hard ? [19.5,26,33] : [25,30.5,36])[index - 4] - s.shift * .5;
  if (index === 7) return { at, label: 'LAST STAND', side: 'both', variants: ['stalker','runner','husk'] };
  const patterns = [
    { label: 'RUNNER PACK', variants: ['runner','runner'] },
    { label: 'HUSK ESCORT', variants: ['husk','stalker'] },
    { label: 'CROSSBREAK', variants: ['runner','husk'] }
  ];
  const pattern = patterns[(index - 4 + waveSeed(s, 4) % 3) % 3];
  return { at, ...pattern, side: pattern.label === 'CROSSBREAK' ? 'both' : side,
    variants: [...pattern.variants, ...(hard && index !== 5 ? ['stalker'] : [])] };
}

export function nextWave(s) {
  if (s.phase !== 'tower' || !s.watch || s.nextSpawn >= (s.watch.waveVersion === 0 ? 42 : 55)) return null;
  const wave = watchWave(s);
  return wave ? { label: wave.label, side: wave.side, seconds: Math.max(0, s.nextSpawn - s.time) } : null;
}

export function bellStatus(s) {
  const w = s?.watch, rush = w?.rush, active = rush?.status === 'active';
  const uses = w?.bellsUsed || 0, remaining = Math.max(0, 2 - uses);
  const left = active ? s.targets.filter(t => rush.targetIds.includes(t.id)).length : 0;
  const seconds = active ? Math.max(0, rush.deadline - s.time) : 0;
  const reason = s?.phase !== 'tower' ? 'Available from the watchtower'
    : active ? 'Clear the marked crops'
    : !remaining ? 'Both calls used tonight'
    : s.time > 39 ? 'Too late to call another rush'
    : s.rounds + s.reserve < 4 ? 'Need at least 4 rounds'
    : 'Call 3 crops. Clear them in 10 seconds for supplies.';
  return { available: s?.phase === 'tower' && !active && remaining > 0 && s.time <= 39 && s.rounds + s.reserve >= 4,
    reason, remaining, active, seconds, left, uses };
}

export function watchFeedback(s, text, tone = 'ready', point = null) {
  s.watch.feedback = { text, tone, time: s.time, ...(point ? { x: point.x, y: point.y } : {}) };
}

export function watchSummary(s) {
  const w = s.watch || freshWatch(s.breaches);
  const breaches = Math.max(0, s.breaches - w.breachesAtStart);
  const accuracy = w.shots ? Math.round(w.hits / w.shots * 100) : 0;
  const grade = !w.contained ? 'UNRATED'
    : !breaches && accuracy === 100 && s.time >= 54.9 ? 'FLAWLESS'
    : !breaches && accuracy >= 80 ? 'SHARPSHOOTER'
    : !breaches ? 'HELD THE LINE'
    : breaches <= 2 ? 'CLOSE CALL' : 'PERIMETER LOST';
  return { score: w.score, grade, accuracy, bestStreak: w.bestStreak,
    contained: w.contained, breaches, fastReloads: w.fastReloads,
    bellsUsed: w.bellsUsed, rushesWon: w.rushesWon, flaresEarned: w.flaresEarned };
}

export function migrateWatch(s) {
  if (s.watch === undefined) {
    s.watch = freshWatch(s.breaches);
    s.watch.waveVersion = 0;
    const interval = (5.8 - s.shift * .65) * (s.mode === 'hard' ? .75 : 1);
    s.watch.spawnCount = Math.max(0, Math.round((s.nextSpawn - 3) / interval));
  }
  if (s.watch && typeof s.watch === 'object' && !Array.isArray(s.watch)) {
    // Continue an older in-progress watch on its original schedule.
    if (s.watch.waveVersion === undefined) s.watch.waveVersion = 0;
    for (const key of ['bellsUsed','rushesWon','flaresEarned']) if (s.watch[key] === undefined) s.watch[key] = 0;
    if (s.watch.rush === undefined) s.watch.rush = null;
  }
  for (const target of s.targets) if (target.kind === 'corn') {
    if (target.variant === undefined) target.variant = 'stalker';
    if (target.hp === undefined) target.hp = 1;
  }
}

export function validWatch(s) {
  const w = s.watch;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  for (const key of ['score','streak','bestStreak','hits','shots','contained','breachesAtStart','flares','fastReloads','spawnCount','bellsUsed','rushesWon','flaresEarned']) {
    if (!Number.isSafeInteger(w[key]) || w[key] < 0 || w[key] > 1000000) return false;
  }
  if (w.flares > 2 || w.hits > w.shots || w.contained > w.hits || w.streak > w.bestStreak || w.bestStreak > w.contained || w.breachesAtStart > s.breaches) return false;
  if (![0,1].includes(w.waveVersion) || w.bellsUsed > 2 || w.rushesWon > w.bellsUsed || w.flaresEarned > Math.floor(w.contained / 5) + w.rushesWon) return false;
  const rush = w.rush;
  if (rush === null) { if (w.bellsUsed || w.rushesWon) return false; }
  else {
    if (!rush || typeof rush !== 'object' || rush.id !== w.bellsUsed || ![1,2].includes(rush.id) || !['active','won','lost'].includes(rush.status)) return false;
    if (!Array.isArray(rush.targetIds) || rush.targetIds.length !== 3 || new Set(rush.targetIds).size !== 3 || !rush.targetIds.every(id => Number.isSafeInteger(id) && id > 0 && id < s.nextId)) return false;
    if (!Number.isFinite(rush.deadline) || rush.deadline < RUSH_DURATION || rush.deadline > 49 || rush.deadline > s.time + RUSH_DURATION + .001) return false;
    const live = s.targets.filter(t => rush.targetIds.includes(t.id));
    if (!live.every(t => t.kind === 'corn' && t.rushId === rush.id)) return false;
    if (rush.status === 'active') {
      if (s.phase !== 'tower' || rush.finishedAt !== null || rush.deadline <= s.time || !live.length || w.rushesWon >= w.bellsUsed) return false;
    } else if (!Number.isFinite(rush.finishedAt) || rush.finishedAt < rush.deadline - RUSH_DURATION || rush.finishedAt > s.time || (rush.status === 'won' && (live.length || rush.finishedAt > rush.deadline || !w.rushesWon))) return false;
  }
  if (!Number.isFinite(w.flareUntil) || w.flareUntil < 0 || w.flareUntil > s.time + FLARE_DURATION + .001 || typeof w.reloadAttempted !== 'boolean') return false;
  const f = w.feedback;
  if (f !== null && (!f || typeof f.text !== 'string' || f.text.length > 200 || !['hit','alert','ready','armor'].includes(f.tone) || !Number.isFinite(f.time) || f.time < 0 || f.time > s.time || (f.x !== undefined && !Number.isFinite(f.x)) || (f.y !== undefined && !Number.isFinite(f.y)))) return false;
  return s.targets.every(t => (t.rushId === undefined || (t.kind === 'corn' && Number.isInteger(t.rushId) && t.rushId >= 1 && t.rushId <= w.bellsUsed)) &&
    (t.kind !== 'corn' || (Object.hasOwn(CROP_VARIANTS, t.variant) && Number.isInteger(t.hp) && t.hp >= 1 && t.hp <= CROP_VARIANTS[t.variant].hp)));
}
