// Tower-only mastery and supplies. None of these scores change the story endings.
export const RELOAD_DURATION = 1.65;
export const RELOAD_WINDOW_MIN = .45;
export const RELOAD_WINDOW_MAX = .85;
export const FLARE_DURATION = 4.5;
export const FLARE_SLOWDOWN = .15;
export const CROP_VARIANTS = {
  stalker: { speed: 1, hp: 1, points: 100 },
  runner: { speed: 1.6, hp: 1, points: 150 },
  husk: { speed: .78, hp: 2, points: 200 }
};

export function freshWatch(breaches = 0) {
  return { score: 0, streak: 0, bestStreak: 0, hits: 0, shots: 0, contained: 0,
    breachesAtStart: breaches, flares: 2, flareUntil: 0, reloadAttempted: false,
    fastReloads: 0, feedback: null, spawnCount: 0 };
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
    contained: w.contained, breaches, fastReloads: w.fastReloads };
}

export function migrateWatch(s) {
  if (s.watch === undefined) {
    s.watch = freshWatch(s.breaches);
    const interval = (5.8 - s.shift * .65) * (s.mode === 'hard' ? .75 : 1);
    s.watch.spawnCount = Math.max(0, Math.round((s.nextSpawn - 3) / interval));
  }
  for (const target of s.targets) if (target.kind === 'corn') {
    if (target.variant === undefined) target.variant = 'stalker';
    if (target.hp === undefined) target.hp = 1;
  }
}

export function validWatch(s) {
  const w = s.watch;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  for (const key of ['score','streak','bestStreak','hits','shots','contained','breachesAtStart','flares','fastReloads','spawnCount']) {
    if (!Number.isSafeInteger(w[key]) || w[key] < 0 || w[key] > 1000000) return false;
  }
  if (w.flares > 2 || w.hits > w.shots || w.contained > w.hits || w.streak > w.bestStreak || w.bestStreak > w.contained || w.breachesAtStart > s.breaches) return false;
  if (!Number.isFinite(w.flareUntil) || w.flareUntil < 0 || w.flareUntil > s.time + FLARE_DURATION + .001 || typeof w.reloadAttempted !== 'boolean') return false;
  const f = w.feedback;
  if (f !== null && (!f || typeof f.text !== 'string' || f.text.length > 200 || !['hit','alert','ready','armor'].includes(f.tone) || !Number.isFinite(f.time) || f.time < 0 || f.time > s.time || (f.x !== undefined && !Number.isFinite(f.x)) || (f.y !== undefined && !Number.isFinite(f.y)))) return false;
  return s.targets.every(t => t.kind !== 'corn' || (Object.hasOwn(CROP_VARIANTS, t.variant) && Number.isInteger(t.hp) && t.hp >= 1 && t.hp <= CROP_VARIANTS[t.variant].hp));
}
