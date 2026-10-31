import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, advance, shoot, reload, flare, ringBell, bellStatus, enterField, restore, serialize, SHIFT_LENGTH } from '../docs/engine.js';
import { nextWave, watchWave, watchSummary, CROP_VARIANTS, RUSH_BONUS } from '../docs/watch-play.js';

function watch(mode = 'story', shift = 0, seed = 42) {
  const s = createGame(mode, seed); s.shift = shift; startShift(s); return s;
}
function crop(s, variant = 'stalker') {
  const target = { id: s.nextId++, kind: 'corn', x: 480, y: 400, speed: 0, direction: 1, wobble: 0, variant, hp: CROP_VARIANTS[variant].hp };
  s.targets.push(target); return target;
}
const hit = (s, t) => shoot(s, t.x, t.y - 34);
function clearRush(s) {
  for (const t of [...s.targets].filter(t => t.rushId === s.watch.rush.id)) while (s.targets.includes(t)) assert.ok(['hit','armor'].includes(hit(s, t)));
}

test('the bell summons a readable three-crop challenge without changing the natural wave schedule', () => {
  const s = watch(), natural = nextWave(s), before = s.nextSpawn;
  assert.deepEqual(bellStatus(s), { available: true, reason: 'Call 3 crops. Clear them in 10 seconds for supplies.', remaining: 2, active: false, seconds: 0, left: 0, uses: 0 });
  assert.equal(ringBell(s), true);
  assert.deepEqual(s.targets.map(t => [t.variant,t.hp,t.rushId]), [['stalker',1,1],['runner',1,1],['husk',2,1]]);
  assert.equal(new Set(s.targets.map(t => `${t.x},${t.y}`)).size, 3);
  assert.deepEqual(s.watch.rush, { id: 1, targetIds: s.targets.map(t => t.id), deadline: 10, status: 'active', finishedAt: null });
  assert.equal(s.watch.spawnCount, 0); assert.equal(s.nextSpawn, before); assert.deepEqual(nextWave(s), natural);
  assert.equal(bellStatus(s).left, 3); assert.equal(bellStatus(s).seconds, 10);
  assert.equal(bellStatus(s).available, false); assert.equal(ringBell(s), false);
});

test('clearing the rush grants supplies and its bonus exactly once, including across resume', () => {
  let s = watch(); s.nextSpawn = 100; flare(s); ringBell(s);
  const ordinary = crop(s); ordinary.x = 200;
  clearRush(s);
  assert.equal(s.watch.rush.status, 'won'); assert.equal(s.watch.rushesWon, 1);
  assert.equal(s.watch.score, 525 + RUSH_BONUS); assert.equal(s.reserve, 30);
  assert.equal(s.watch.flares, 2); assert.equal(s.watch.flaresEarned, 1);
  assert.ok(s.targets.includes(ordinary), 'The bonus only requires the marked targets.');
  const earned = [s.watch.score,s.reserve,s.watch.flares,s.watch.rushesWon];
  s = restore(serialize(s)); assert.ok(s); advance(s, 1);
  assert.deepEqual([s.watch.score,s.reserve,s.watch.flares,s.watch.rushesWon], earned);
  assert.equal(watchSummary(s).rushesWon, 1); assert.equal(watchSummary(s).bellsUsed, 1);
  assert.equal(watchSummary(s).flaresEarned, 1);
});

test('misses cost ammunition and streak but do not forfeit an active rush', () => {
  const s = watch(); s.nextSpawn = 100; ringBell(s);
  assert.equal(shoot(s, 0, 0), 'miss'); assert.equal(s.watch.rush.status, 'active');
  clearRush(s);
  assert.equal(s.watch.rush.status, 'won'); assert.equal(s.watch.shots, 5);
});

test('a rush timeout forfeits only its bonus and leaves every live target playable', () => {
  const s = watch(); s.nextSpawn = 100; ringBell(s);
  for (const t of s.targets) t.speed = 0;
  const ids = s.targets.map(t => t.id), ordinary = crop(s); ordinary.x = 200;
  advance(s, 10.1);
  assert.equal(s.watch.rush.status, 'lost'); assert.equal(s.watch.rushesWon, 0);
  assert.equal(s.reserve, 24); assert.equal(s.watch.score, 0);
  assert.ok(ids.every(id => s.targets.some(t => t.id === id))); assert.ok(s.targets.includes(ordinary));
  clearRush(s); assert.equal(s.watch.score, 525); assert.equal(s.watch.rushesWon, 0);
  assert.ok(restore(serialize(s)));
});

test('a marked escape immediately loses the challenge even if the others are contained', () => {
  const s = watch(); s.nextSpawn = 100; ringBell(s);
  const first = s.targets[0]; first.x = 895; first.direction = 1;
  advance(s, .1);
  assert.equal(s.breaches, 1); assert.equal(s.watch.rush.status, 'lost');
  clearRush(s);
  assert.equal(s.watch.rushesWon, 0); assert.equal(s.reserve, 24);
  assert.ok(restore(serialize(s)));
});

test('a second bell may follow a loss and old marked crops cannot fail the new challenge', () => {
  const s = watch(); s.nextSpawn = 100; ringBell(s);
  for (const t of s.targets) t.speed = 0;
  advance(s, 10.1);
  const old = s.targets[0]; old.x = 895; old.speed = 20;
  assert.equal(ringBell(s), true); advance(s, .1);
  assert.equal(s.watch.rush.id, 2); assert.equal(s.watch.rush.status, 'active');
  assert.equal(s.breaches, 1); assert.ok(restore(serialize(s)));
  clearRush(s); assert.equal(s.watch.rushesWon, 1);
  assert.equal(bellStatus(s).remaining, 0); assert.equal(ringBell(s), false);
});

test('bell eligibility enforces phase, ammunition, time and two-call limit without side effects', () => {
  for (const patch of [{ phase: 'briefing' },{ time: 39.01 },{ rounds: 1, reserve: 2 }]) {
    const s = Object.assign(watch(), patch), before = serialize(s);
    assert.equal(bellStatus(s).available, false); assert.equal(ringBell(s), false); assert.equal(serialize(s), before);
  }
  const last = watch(); last.time = 39; last.rounds = 0; last.reserve = 4;
  assert.equal(ringBell(last), true); assert.equal(last.watch.rush.deadline, 49);
  const s = watch(); s.nextSpawn = 100;
  ringBell(s); clearRush(s); reload(s); advance(s, 2); ringBell(s); clearRush(s);
  assert.equal(s.watch.bellsUsed, 2); assert.equal(s.watch.rushesWon, 2); assert.equal(ringBell(s), false);
  assert.equal(s.watch.flares, 2, 'Earned flares never exceed the equipment cap.');
});

test('five clean containments replenish a flare, require another full chain after a miss, and reset per night', () => {
  const s = watch(); s.nextSpawn = 100; flare(s);
  for (let i = 0; i < 5; i++) hit(s, crop(s));
  assert.equal(s.watch.flares, 2); assert.equal(s.watch.flaresEarned, 1);
  assert.equal(shoot(s, 0, 0), 'miss'); reload(s); advance(s, 5); flare(s);
  for (let i = 0; i < 4; i++) hit(s, crop(s));
  assert.equal(s.watch.flares, 1);
  hit(s, crop(s)); assert.equal(s.watch.flares, 2); assert.equal(s.watch.flaresEarned, 2);
  assert.ok(restore(serialize(s)));
  s.phase = 'briefing'; startShift(s);
  assert.equal(s.watch.flaresEarned, 0); assert.equal(s.watch.bellsUsed, 0); assert.equal(s.watch.rush, null);
});

test('leaving the tower abandons a rush and still counts unattended crops', () => {
  const s = watch(); s.time = 17; s.incident = true; s.nextSpawn = 100; ringBell(s);
  assert.equal(enterField(s), true); assert.equal(s.phase, 'field');
  assert.equal(s.watch.rush.status, 'lost'); assert.equal(s.breaches, 3);
  assert.equal(s.watch.rushesWon, 0); assert.ok(restore(serialize(s)));
});

test('active challenges, partial husks, natural previews and reloads survive saving exactly', () => {
  const s = watch('hard', 2, 847); ringBell(s); hit(s, s.targets.at(-1)); reload(s); advance(s, .2);
  const resumed = restore(serialize(s)); assert.deepEqual(resumed, s);
  assert.deepEqual(nextWave(resumed), nextWave(s)); assert.deepEqual(bellStatus(resumed), bellStatus(s));
  assert.equal(resumed.targets.at(-1).hp, 1);
  assert.ok(s.lastShot.target); assert.equal(s.lastShot.targetId, s.targets.at(-1).id);
});

test('legacy watches receive deterministic defaults and retain their existing spawn schedule', () => {
  const s = watch(); advance(s, 14);
  for (const key of ['waveVersion','bellsUsed','rushesWon','flaresEarned','rush']) delete s.watch[key];
  const resumed = restore(serialize(s)); assert.ok(resumed);
  assert.equal(resumed.watch.waveVersion, 0); assert.equal(resumed.nextSpawn, s.nextSpawn);
  assert.deepEqual(resumed.targets, s.targets); assert.equal(resumed.watch.bellsUsed, 0);
  assert.equal(resumed.watch.rushesWon, 0); assert.equal(resumed.watch.flaresEarned, 0); assert.equal(resumed.watch.rush, null);
  assert.deepEqual(restore(serialize(resumed)), resumed);
  resumed.phase = 'briefing'; startShift(resumed); assert.equal(resumed.watch.waveVersion, 1);
});

test('malformed challenge states and rewards cannot be restored', () => {
  const s = watch(); ringBell(s);
  for (const patch of [
    { bellsUsed: 3 },{ bellsUsed: 0 },{ rushesWon: 2 },{ flaresEarned: 1 },{ waveVersion: 9 },
    { rush: null },{ rush: { ...s.watch.rush, targetIds: [1,1,2] } },
    { rush: { ...s.watch.rush, targetIds: [1,2,999] } },{ rush: { ...s.watch.rush, deadline: 99 } },
    { rush: { ...s.watch.rush, status: 'won', finishedAt: 0 } },
    { rush: { ...s.watch.rush, finishedAt: 0 } },{ rush: { ...s.watch.rush, status: 'other' } }
  ]) {
    const bad = structuredClone(s); Object.assign(bad.watch, patch);
    assert.equal(restore(serialize(bad)), null, JSON.stringify(patch));
  }
  for (const marker of [0,2,'1']) {
    const bad = structuredClone(s); bad.targets[0].rushId = marker;
    assert.equal(restore(serialize(bad)), null);
  }
});

test('wave previews are read-only, match actual directions and finish with a late natural rush', () => {
  for (const mode of ['story','hard']) for (let shift = 0; shift < 3; shift++) {
    const s = watch(mode, shift), before = serialize(s);
    for (let i = 0; i < 10; i++) assert.deepEqual(nextWave(s), nextWave(s));
    assert.equal(serialize(s), before);
    const seen = [];
    while (s.phase === 'tower') {
      const pending = nextWave(s), wave = watchWave(s), count = s.watch.spawnCount, ids = new Set(s.targets.map(t => t.id));
      advance(s, .1);
      if (s.watch.spawnCount !== count) {
        const fresh = s.targets.filter(t => t.kind === 'corn' && !ids.has(t.id));
        assert.deepEqual(fresh.map(t => t.variant), wave.variants);
        assert.ok(fresh.every(t => pending.side === 'both' || t.direction === (pending.side === 'left' ? -1 : 1)));
        seen.push({ time: s.time, label: pending.label });
      }
      for (const t of [...s.targets]) if (t.kind === 'corn') hit(s, t);
      if (s.rounds < 2 && !s.reload) reload(s);
    }
    assert.equal(seen.length, 8); assert.equal(seen.at(-1).label, 'LAST STAND');
    assert.ok(seen.at(-1).time >= 40 && seen.at(-1).time <= 42);
    assert.equal(s.breaches, 0); assert.ok(s.watch.shots <= 25); assert.equal(nextWave(s), null);
  }
  const disabled = watch(); disabled.nextSpawn = 100;
  assert.equal(nextWave(disabled), null); advance(disabled, 10); assert.equal(disabled.watch.spawnCount, 0);
});

test('both bell challenges remain winnable on every night and intensity without changing relief or civilians', () => {
  for (const mode of ['story','hard']) for (let shift = 0; shift < 3; shift++) for (const seed of [1,42,847,2026]) {
    const s = watch(mode, shift, seed);
    while (s.phase === 'tower') {
      if ((s.watch.bellsUsed === 0 && s.time >= 4) || (s.watch.bellsUsed === 1 && s.time >= 25)) ringBell(s);
      advance(s, .1);
      for (const t of [...s.targets]) if (t.kind === 'corn') hit(s, t);
      if (s.rounds < 2 && !s.reload) reload(s);
    }
    assert.equal(s.phase, 'field', `${mode}, night ${shift + 1}, seed ${seed}`);
    assert.equal(s.watch.rushesWon, 2); assert.equal(s.breaches, 0);
    assert.equal(s.departure, 'compelled'); assert.equal(s.compulsionNotice, true);
    assert.ok(s.time >= SHIFT_LENGTH && s.time < SHIFT_LENGTH + .11);
    assert.equal(s.watch.hits, s.watch.shots); assert.ok(s.rounds + s.reserve > 0);
    if (shift === 2) assert.deepEqual(s.lightsOut, [0,1,2]);
    assert.ok(restore(serialize(s)));
  }
});
