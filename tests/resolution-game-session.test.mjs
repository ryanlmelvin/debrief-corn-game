import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { advance, serialize } from '../docs/engine.js';
import { createMiniGame, miniGameComplete } from '../docs/mini-games.js';
import { resolutionGameAction, resolutionGameActive, releaseResolutionGame } from '../docs/resolution-games.js';
import { rescueStatus } from '../docs/rescue.js';

const source = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');

function nearLastGrip() {
  const game = createMiniGame('rescue', 'story', 42);
  const status = () => rescueStatus(game.resolution.activity.state);
  while (!status().aligned) assert.equal(resolutionGameAction(game, 'later'), true);
  assert.equal(resolutionGameAction(game, 'align'), true);
  for (let frame = 0; frame < 5000; frame++) {
    const view = status();
    if (view.pulls === 3 && view.progress > .98) return game;
    if (view.needsRelease) resolutionGameAction(game, 'release');
    else if (view.canPull && !view.warning) resolutionGameAction(game, 'pull');
    advance(game, .02);
  }
  assert.fail('the real rescue inputs must reach the final grip');
}

test('practice completion opens its result even when the final grip lands between UI refreshes', () => {
  const game = nearLastGrip(), updates = [], renderFrames = [];
  const context = vm.createContext({
    game, paused: false, dialog: { open: false }, menuOpen: () => false, document: { hidden: false },
    lastFrame: 1000, lastUI: 1040, lastSave: 1040,
    advance, miniGameComplete, resolutionGameActive,
    renderer: { draw() {} }, resolutionUI: { render() {} }, rogueUI: { render() {} },
    updateUI() { updates.push({ complete: miniGameComplete(game), phase: game.phase }); },
    save() {}, requestAnimationFrame(callback) { renderFrames.push(callback); }
  });
  vm.runInContext(source.slice(source.indexOf('function frame(now) {')), context);
  assert.equal(miniGameComplete(game), false);
  vm.runInContext('frame(1050)', context);
  assert.equal(miniGameComplete(game), true, 'this frame completes the activity through real pulling');
  // The next frame can no longer enter the normal practice simulation branch.
  // Completion must therefore schedule the result independently of its throttle.
  vm.runInContext('frame(1100)', context);
  assert.ok(updates.some(update => update.complete), 'the completed practice result must be rendered without another user action');
  assert.equal(game.ending, null);
});

test('pointer and keyboard releases use the real rescue action and cannot resume an abandoned hold', () => {
  const game = nearLastGrip(), listeners = new Map(), saves = [];
  const register = (surface, type, handler) => listeners.set(`${surface}:${type}`, handler);
  const root = { addEventListener(type, handler) { register('root', type, handler); } };
  const context = vm.createContext({
    game, paused: false, dialog: { open: false }, menuOpen: () => false,
    $: () => root, releaseResolutionGame, resolutionGameActive,
    save() { saves.push(serialize(game)); }, updateUI() {},
    document: { addEventListener(type, handler) { register('document', type, handler); } },
    window: { addEventListener(type, handler) { register('window', type, handler); } },
    act(action, value) { if (action === 'resolution-game') resolutionGameAction(game, value); }
  });
  const start = source.indexOf('let rescuePointer = null;');
  const end = source.indexOf("document.addEventListener('keydown',", start);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(game.resolution.activity.state.holding, true);
  listeners.get('document:keyup')({ key: ' ' });
  assert.equal(game.resolution.activity.state.holding, false);
  assert.equal(game.resolution.activity.state.progress, 0);
  advance(game, 20);
  assert.equal(game.resolution.activity.state.pulls, 3, 'time after releasing cannot finish a grip');
  const button = { disabled: false, focus() {}, setPointerCapture() {} };
  listeners.get('root:pointerdown')({ target: { closest: () => button }, pointerId: 7, preventDefault() {} });
  assert.equal(game.resolution.activity.state.holding, true);
  listeners.get('root:pointerup')({ pointerId: 8 });
  assert.equal(game.resolution.activity.state.holding, true, 'a different pointer cannot end the active gesture');
  listeners.get('root:pointercancel')({ pointerId: 7 });
  assert.equal(game.resolution.activity.state.holding, false);
  listeners.get('root:pointerdown')({ target: { closest: () => button }, pointerId: 9, preventDefault() {} });
  assert.equal(game.resolution.activity.state.holding, true);
  listeners.get('window:blur')();
  assert.equal(game.resolution.activity.state.holding, false);
  assert.equal(game.resolution.activity.state.pulls, 3);
  assert.ok(saves.length >= 3, 'released progress is persisted after each interrupted gesture');
});
