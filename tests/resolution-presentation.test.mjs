import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, serialize, restore } from '../docs/engine.js';
import { createMiniGame, miniGameComplete, miniGameResult } from '../docs/mini-games.js';
import { startResolution, chooseResolution } from '../docs/alternate-endings.js';
import { resolutionGameActive, resolutionGameAction } from '../docs/resolution-games.js';
import { resolutionMarkup } from '../docs/resolution-ui.js';
import { VacancyUI } from '../docs/vacancy-ui.js';
import { solveResolutionGame } from './helpers/resolution-play.mjs';

const app = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const sceneCode = app.slice(app.indexOf('function sceneDialog()'), app.indexOf('function stat('));
const actionCode = app.slice(app.indexOf('function act('), app.indexOf("document.addEventListener('click',event=>{const button"));
const frameCode = app.slice(app.indexOf('function frame(now)'));
const wrapperCode = readFileSync(new URL('../docs/resolution-games-ui.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replace('export class ', 'class ');

function handover(practice) {
  const example = createMiniGame('vacancy', 'story', 409);
  if (practice) return example;
  const game = createGame('story', 91);
  Object.assign(game, { phase: 'debrief', shift: 2, question: 2, evidence: [...example.evidence],
    evidenceScenes: { ...example.evidenceScenes }, reports: example.reports.filter(report => !report.kind).map(report => ({ ...report })) });
  assert.equal(startResolution(game), true);
  for (const id of ['vacancy', 'vacancy-accept', 'vacancy-sign']) assert.equal(chooseResolution(game, id), true);
  return game;
}

function beforeFinalCard(practice) {
  const game = handover(practice), snapshots = [structuredClone(game)];
  solveResolutionGame(game, current => snapshots.push(structuredClone(current)));
  return { game: snapshots.at(-2), action: snapshots.at(-1).resolution.activity.state.history.at(-1) };
}

function presenter(game) {
  let mounted = false, completedPresentations = 0;
  const modals = [], saves = [], scene = { classList: { toggle() {} } };
  const board = { ownerDocument: { defaultView: { matchMedia: () => ({ matches: false }) } },
    addEventListener() {}, removeEventListener() {}, querySelector: () => mounted ? scene : null,
    set innerHTML(value) { mounted = !!value; } };
  const button = {}, exit = { querySelector: () => button };
  const root = { hidden: true, querySelector: selector => selector === '.resolution-game-board' ? board : exit };
  // Keep the actual presentation controller, wrapper, application dispatch, and
  // modal logic. Only painting/WebGL and unrelated application surfaces are doubled.
  class PaintOnlyVacancy extends VacancyUI {
    showView(view) {
      this.view = view; this.selectedId = null; this.helpOpen = false; board.innerHTML = 'mounted';
      this.hand ??= { render() {}, dispose() {}, dismiss: () => 300, deal: () => 740 };
    }
    flyPaper() {}
  }
  const context = vm.createContext({ game, root, VacancyUI: PaintOnlyVacancy, resolutionGameActive, resolutionGameAction,
    miniGameComplete, miniGameResult, resolutionMarkup, paused: false, dialog: { open: false }, menuOpen: () => false,
    document: { hidden: false }, modalKind: '', lastModalKey: '', lastFrame: 0, lastUI: 0, lastSave: 0,
    esc: String, miniGamePaper: (title, body) => `${title}${body}`, sightingPromptReady: () => false,
    guide3d: { update() {} }, renderer: { draw() {} }, $: () => ({ hidden: false }), advance() {}, requestAnimationFrame() {},
    showModal(kind, html) { modals.push({ kind, html }); context.dialog.open = true; },
    save() { saves.push(serialize(context.game)); },
    updateUI() { context.resolutionUI.render(context.game, context.paused || context.dialog.open || context.document.hidden); vm.runInContext('sceneDialog()', context); },
    onPresentationEnd() { completedPresentations++; context.updateUI(); }
  });
  vm.runInContext(wrapperCode + sceneCode + actionCode + frameCode, context);
  context.resolutionUI = vm.runInContext('new ResolutionGamesUI(root, { onPresentationEnd })', context);
  return { context, root, modals, saves, completed: () => completedPresentations, run: code => vm.runInContext(code, context) };
}

for (const practice of [false, true]) test(`final vacancy stamp remains visible before the ${practice ? 'practice result' : 'story decision'}`, t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { game, action } = beforeFinalCard(practice), h = presenter(game);
  h.context.updateUI();
  assert.equal(h.context.resolutionUI.presenting, false);
  h.context.action = action;
  h.run('act("resolution-game", action)');
  assert.equal(game.resolution.activity.state.stage, 'complete');
  assert.equal(resolutionGameActive(game), false);
  assert.equal(h.context.resolutionUI.presenting, true);
  assert.equal(h.root.hidden, false, 'the wrapper retains the completed board until its stamp finishes');
  assert.equal(h.modals.length, 0);
  const completeSave = serialize(game);
  assert.deepEqual(restore(completeSave), game, 'earned gameplay completion is saved before the animation ends');
  assert.ok(h.saves.includes(completeSave));
  h.run('sceneDialog(); act("resolution-game", action)');
  assert.equal(serialize(game), completeSave);
  assert.equal(h.modals.length, 0);
  t.mock.timers.tick(300);
  h.context.document.hidden = true; h.run('frame(1000)');
  t.mock.timers.tick(1000);
  assert.equal(h.context.resolutionUI.presenting, true, 'the frame loop pauses even an engine-complete practice presentation');
  assert.equal(h.modals.length, 0);
  h.context.document.hidden = false; h.run('frame(1100)');
  t.mock.timers.tick(499);
  assert.equal(h.modals.length, 0);
  t.mock.timers.tick(1);
  assert.equal(h.context.resolutionUI.presenting, false);
  assert.equal(h.root.hidden, true);
  assert.equal(h.completed(), 1);
  assert.equal(h.modals.length, 1);
  assert.equal(h.modals[0].kind, practice ? 'mini-result' : 'resolution');
  assert.match(h.modals[0].html, practice ? /Run complete/ : /vacancy-approve/);
  h.context.updateUI(); h.run('sceneDialog()'); t.mock.timers.tick(1000);
  assert.equal(h.completed(), 1, 'repeated renders cannot replay the final stamp');
  assert.equal(h.modals.length, 1);
  assert.equal(serialize(game), completeSave);
  h.context.resolutionUI.render(null);
});

test('the application ignores card actions during the first deal and accepts them afterward', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const game = handover(true), h = presenter(game), before = serialize(game);
  h.context.updateUI();
  h.context.action = `play:${game.resolution.activity.state.hand[0]}`;
  assert.equal(h.context.resolutionUI.presenting, true);
  h.run('act("resolution-game", action)');
  assert.equal(serialize(game), before);
  assert.equal(h.saves.length, 0);
  t.mock.timers.tick(740);
  assert.equal(h.context.resolutionUI.presenting, false);
  h.run('act("resolution-game", action)');
  assert.notEqual(serialize(game), before);
  assert.equal(game.resolution.activity.state.history.length, 1);
  h.context.resolutionUI.render(null);
});
