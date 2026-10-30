import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startShift, advance, shoot, reload, flare, enterField, restore, serialize, SHIFT_LENGTH } from '../docs/engine.js';
import { CROP_VARIANTS, FLARE_DURATION, FLARE_SLOWDOWN, RELOAD_DURATION, RELOAD_WINDOW_MIN, RELOAD_WINDOW_MAX, watchSummary } from '../docs/watch-play.js';

function watch(mode = 'story', shift = 0, seed = 42) {
  const s = createGame(mode, seed); s.shift = shift; startShift(s); return s;
}
function crop(s, variant = 'stalker', x = 480) {
  const t = { id: s.nextId++, kind: 'corn', x, y: 400, speed: 20, direction: 1, wobble: 0, variant, hp: CROP_VARIANTS[variant].hp };
  s.targets.push(t); return t;
}
const hit = (s, t) => shoot(s, t.x, t.y - 34);

test('the teaching crop preserves original balance, followed by a runner, husk and split surge', () => {
  const s = watch();
  advance(s, 3.1);
  assert.equal(s.targets[0].variant, 'stalker');
  assert.equal(s.targets[0].speed, 19.002988393884152);
  assert.equal(s.nextSpawn, 8.8);
  advance(s, 5.8); assert.equal(s.targets.at(-1).variant, 'runner');
  advance(s, 5.8); assert.equal(s.targets.at(-1).variant, 'husk');
  assert.equal(s.targets.at(-1).hp, 2);
  advance(s, 5.8);
  assert.deepEqual(s.targets.slice(-2).map(t => t.variant), ['stalker','runner']);
  assert.equal(s.targets.at(-1).direction, -s.targets.at(-2).direction);
  assert.equal(s.watch.spawnCount, 4);
});

test('husks need two accurate shots and preserve the containment chain through the first hit', () => {
  const s = watch(), plain = crop(s), runner = crop(s, 'runner', 580), husk = crop(s, 'husk', 680);
  assert.equal(hit(s, plain), 'hit'); assert.equal(s.lastShot.points, 100);
  assert.equal(hit(s, runner), 'hit'); assert.equal(s.lastShot.points, 175);
  assert.equal(hit(s, husk), 'armor');
  assert.equal(husk.hp, 1); assert.equal(s.watch.streak, 2); assert.equal(s.kills, 2);
  assert.equal(s.lastShot.result, 'armor'); assert.equal(s.lastShot.variant, 'husk');
  assert.equal(s.lastShot.points, 0); assert.match(s.watch.feedback.text, /SHELL BROKEN/);
  assert.equal(hit(s, husk), 'hit');
  assert.equal(s.lastShot.points, 250); assert.equal(s.watch.score, 525);
  assert.equal(s.watch.hits, 4); assert.equal(s.watch.shots, 4);
  assert.equal(s.watch.contained, 3); assert.equal(s.watch.bestStreak, 3);
  assert.equal(watchSummary(s).accuracy, 100);
});

test('misses and road breaches break the chain without erasing earned score or best streak', () => {
  const s = watch(); hit(s, crop(s)); hit(s, crop(s));
  assert.equal(s.watch.streak, 2); assert.equal(s.watch.score, 225);
  assert.equal(shoot(s, 0, 0), 'miss'); assert.equal(s.watch.streak, 0);
  assert.equal(s.watch.bestStreak, 2); assert.equal(s.watch.score, 225);
  hit(s, crop(s)); assert.equal(s.lastShot.points, 100);
  crop(s, 'stalker', 895); advance(s, .1);
  assert.equal(s.watch.streak, 0); assert.equal(watchSummary(s).breaches, 1);
  assert.match(s.watch.feedback.text, /BREACH/);
});

test('abandoning loose crops breaks the chain and counts only this watch in its summary', () => {
  const s = watch(); s.breaches = 2; s.watch.breachesAtStart = 2; s.incident = true;
  hit(s, crop(s)); crop(s);
  assert.equal(enterField(s), true);
  assert.equal(s.watch.streak, 0); assert.equal(watchSummary(s).breaches, 1);
  assert.equal(flare(s), false); assert.equal(reload(s), false);
});

test('flares slow only corn for exactly their duration, with two non-overlapping uses', () => {
  const s = watch(), target = crop(s); s.nextSpawn = 100;
  const human = { id: s.nextId++, kind: 'person', x: 600, y: 331, direction: 1, speed: 2, wobble: 0, role: 'dress', member: 0 };
  s.targets.push(human);
  assert.equal(flare(s), true); assert.equal(s.watch.flares, 1);
  assert.equal(flare(s), false); assert.equal(s.watch.flares, 1);
  advance(s, FLARE_DURATION + 1);
  assert.ok(Math.abs(target.x - (480 + 20 * FLARE_DURATION * FLARE_SLOWDOWN + 20)) < 1e-7);
  assert.ok(Math.abs(human.x - (600 + 2 * (FLARE_DURATION + 1))) < 1e-7);
  assert.ok(Math.abs(s.time - (FLARE_DURATION + 1)) < 1e-7);
  assert.equal(flare(s), true); assert.equal(s.watch.flares, 0);
  advance(s, FLARE_DURATION + .1); assert.equal(flare(s), false);
});

test('flares preserve human lights and compulsion timing', () => {
  const s = watch('story', 2), normal = watch('story', 2);
  for (const game of [s, normal]) { game.nextSpawn = 100; advance(game, 16); }
  flare(s);
  for (const game of [s, normal]) advance(game, 10.2);
  assert.deepEqual(s.lightsOut, [0,1,2]); assert.deepEqual(s.lightsOut, normal.lightsOut);
  assert.equal(s.targets.filter(t => t.kind === 'person').length, 0);
  for (const game of [s, normal]) advance(game, SHIFT_LENGTH - game.time + .1);
  assert.equal(s.phase, 'field'); assert.equal(s.departure, 'compelled');
  assert.equal(s.compulsionNotice, true); assert.equal(s.time, normal.time);
});

test('quick reload accepts the full window and transfers only the missing rounds', () => {
  for (const remaining of [RELOAD_WINDOW_MIN, .65, RELOAD_WINDOW_MAX]) {
    const s = watch(); shoot(s, 0, 0); shoot(s, 0, 0);
    assert.equal(reload(s), true); assert.equal(s.reload, RELOAD_DURATION);
    s.reload = remaining;
    assert.equal(reload(s), true); assert.equal(s.reload, 0);
    assert.equal(s.rounds, 6); assert.equal(s.reserve, 22); assert.equal(s.watch.fastReloads, 1);
    assert.equal(reload(s), false); assert.match(s.watch.feedback.text, /QUICK RELOAD/);
  }
});

test('an early or late reload attempt keeps the ordinary duration, with no repeated attempts', () => {
  for (const remaining of [RELOAD_WINDOW_MAX + .01, RELOAD_WINDOW_MIN - .01]) {
    const s = watch(); shoot(s, 0, 0); reload(s); s.reload = remaining;
    assert.equal(reload(s), false); assert.equal(s.reload, remaining);
    assert.equal(s.watch.reloadAttempted, true);
    assert.equal(reload(s), false); assert.equal(s.watch.fastReloads, 0);
    advance(s, remaining + .01);
    assert.equal(s.rounds, 6); assert.equal(s.reserve, 23); assert.equal(s.reload, 0);
    shoot(s, 0, 0); reload(s); assert.equal(s.watch.reloadAttempted, false);
  }
});

test('new watch stats and supplies reset while campaign counters persist', () => {
  const s = watch(); hit(s, crop(s)); flare(s); s.phase = 'briefing'; s.breaches = 2;
  startShift(s);
  assert.equal(s.kills, 1); assert.equal(s.shots, 1);
  assert.equal(s.watch.contained, 0); assert.equal(s.watch.score, 0);
  assert.equal(s.watch.flares, 2); assert.equal(s.watch.flareUntil, 0);
  assert.equal(s.watch.breachesAtStart, 2); assert.equal(watchSummary(s).breaches, 0);
});

test('live flare, broken husk and reload attempts survive saving exactly', () => {
  const s = watch(); hit(s, crop(s, 'husk')); flare(s); reload(s); reload(s);
  assert.deepEqual(restore(serialize(s)), s);
  const resumed = restore(serialize(s)); advance(resumed, 2);
  assert.equal(resumed.rounds, 6); assert.equal(resumed.targets[0].hp, 1);
  assert.equal(resumed.watch.flares, 1); assert.equal(flare(resumed), false);
});

test('legacy saves acquire safe defaults without altering progress or existing crop difficulty', () => {
  const s = watch(); advance(s, 4); s.exposure = 17;
  delete s.watch;
  for (const t of s.targets) { delete t.hp; delete t.variant; }
  const resumed = restore(serialize(s));
  assert.ok(resumed); assert.equal(resumed.exposure, 17); assert.equal(resumed.watch.flares, 2);
  assert.equal(resumed.watch.spawnCount, 1); assert.equal(resumed.watch.score, 0);
  assert.equal(resumed.targets[0].hp, 1); assert.equal(resumed.targets[0].variant, 'stalker');
  assert.equal(resumed.targets[0].speed, s.targets[0].speed);
  assert.equal(hit(resumed, resumed.targets[0]), 'hit');
});

test('malformed watch state and impossible crop health are rejected', () => {
  const s = watch(); crop(s);
  for (const patch of [{ flares: 3 }, { shots: -1 }, { hits: 1 }, { streak: 2 }, { flareUntil: 999 }, { reloadAttempted: 1 }, { spawnCount: .5 }, { feedback: { text: 'x', tone: 'hit', time: -1 } }]) {
    const bad = structuredClone(s); Object.assign(bad.watch, patch);
    assert.equal(restore(serialize(bad)), null, JSON.stringify(patch));
  }
  for (const patch of [{ hp: 0 }, { hp: 2 }, { variant: 'unknown' }, { hp: '1' }]) {
    const bad = structuredClone(s); Object.assign(bad.targets[0], patch);
    assert.equal(restore(serialize(bad)), null, JSON.stringify(patch));
  }
});

test('all variants and surges can be contained on every night and difficulty with ammunition to spare', () => {
  for (const mode of ['story','hard']) for (let shift = 0; shift < 3; shift++) for (const seed of [1,42,123,2026,98765]) {
    const s = watch(mode, shift, seed);
    while (s.phase === 'tower') {
      advance(s, .5);
      for (const t of [...s.targets]) if (t.kind === 'corn') hit(s, t);
      if (s.rounds < 2 && s.reload === 0) reload(s);
    }
    assert.equal(s.phase, 'field', `${mode}, night ${shift + 1}, seed ${seed}`);
    assert.equal(s.breaches, 0); assert.ok(s.watch.shots <= 25);
    assert.ok(s.rounds + s.reserve >= 5);
    assert.equal(watchSummary(s).grade, 'FLAWLESS');
    assert.equal(watchSummary(s).accuracy, 100);
  }
});
