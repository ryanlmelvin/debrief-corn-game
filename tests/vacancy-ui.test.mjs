import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancy, vacancyAction, vacancyStatus } from '../docs/vacancy.js';
import { VacancyUI, vacancyMarkup } from '../docs/vacancy-ui.js';

function interview() {
  return createVacancy({ runId: 'ui-fixture', evidence: ['badge'], reports: [
    { shift: 0, choice: 'sign', answer: 'I will sign <img src=x onerror="alert(1)"> & return.' },
    { shift: 0, choice: 'redact', answer: 'Nothing outside the expected growth pattern.' }
  ] });
}
const buttons = markup => [...markup.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
const gameControls = markup => buttons(markup).filter(button => /data-action="resolution-game"/.test(button));
const enlargedPaper = markup => markup.match(/<article class="vacancy-memo\b[\s\S]*?<\/article>/)?.[0];
const add = (state, id) => assert.equal(vacancyAction(state, `play:${id}`), true);
function closeFirstFile(state) {
  add(state, 'answer-0-sign');
  add(state, 'answer-1-redact');
  add(state, 'evidence-badge');
  return state;
}

test('the arena starts with a closed hand and no extra turn or submission controls', () => {
  const state = interview(), before = structuredClone(state), view = vacancyStatus(state), markup = vacancyMarkup(view);
  assert.equal((markup.match(/SUPERVISOR/g) || []).length, 1);
  assert.equal((markup.match(/<canvas class="vacancy-hand-canvas"/g) || []).length, 1);
  assert.match(markup, /data-vacancy-inspector hidden/);
  assert.match(markup, /data-vacancy-help aria-label="How to play"/);
  assert.doesNotMatch(markup, /Submit report|ACTIONS LEFT|TURN |Turn complete|Choose a procedure|class="vacancy-memo-quote"|class="vacancy-card-effect"/);
  assert.equal(enlargedPaper(markup), undefined);
  assert.equal((markup.match(/data-vacancy-select=/g) || []).length, view.hand.length, 'Every paper remains selectable without WebGL');
  assert.equal(gameControls(markup).length, 0, 'Inspect a paper before adding it to the file');
  assert.deepEqual(state, before);
});

test('the enlarged paper contains its full escaped source and one Add to file action', () => {
  const state = interview(), view = vacancyStatus(state), markup = vacancyMarkup(view, false, 'answer-0-sign');
  const paper = enlargedPaper(markup);
  assert.ok(paper);
  assert.match(paper, /role="dialog" aria-modal="false"/);
  assert.match(paper, /Your debrief · Shift 1/);
  assert.match(paper, /I will sign &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; return\./);
  assert.doesNotMatch(markup, /<img|<script/);
  assert.match(paper, /class="vacancy-memo-quote" tabindex="0"/);
  assert.match(paper, /\+3 approval<br>\+3 scrutiny/);
  assert.match(paper, /data-value="play:answer-0-sign"/);
  assert.match(paper, /aria-label="Add to file: Prior Approval"/);
  assert.match(paper, />Add to file<\/button>/);
  assert.match(paper, /data-vacancy-dismiss aria-label="Back to your hand"/);
  assert.equal((markup.match(/class="vacancy-card-effect"/g) || []).length, 1);
  assert.equal((markup.match(/class="vacancy-memo-quote"/g) || []).length, 1);
  assert.equal(gameControls(markup).length, 1);
});

test('paused paper controls are disabled while dismissal stays available', () => {
  const view = vacancyStatus(interview()), markup = vacancyMarkup(view, true, 'answer-0-sign');
  assert.equal(gameControls(markup).length, 1);
  assert.ok(gameControls(markup).every(button => /\bdisabled\b/.test(button)));
  assert.ok(buttons(markup).filter(button => /data-vacancy-select=|data-vacancy-step=/.test(button)).every(button => /\bdisabled\b/.test(button)));
  assert.ok(buttons(markup).filter(button => /data-vacancy-dismiss/.test(button)).every(button => !/\bdisabled\b/.test(button)));
});

test('a third paper stays playable and meeting the target automatically opens the next file', () => {
  const state = interview();
  add(state, 'answer-0-sign');
  add(state, 'answer-1-redact');
  const beforeThird = vacancyStatus(state);
  assert.equal(beforeThird.round, 1);
  const markup = vacancyMarkup(beforeThird, false, 'evidence-badge');
  assert.match(enlargedPaper(markup), />Add to file<\/button>/);
  assert.doesNotMatch(gameControls(markup)[0], /\bdisabled\b/);
  assert.doesNotMatch(markup, /Turn complete|Submit report|ACTIONS LEFT/);
  add(state, 'evidence-badge');
  const next = vacancyStatus(state), nextMarkup = vacancyMarkup(next);
  assert.equal(next.stage, 'play');
  assert.equal(next.round, 2);
  assert.equal(next.progress, 0);
  assert.equal(next.scrutiny, 3, 'Scrutiny carries into the new file');
  assert.match(nextMarkup, /FILE 2 \/ 3/);
  assert.match(nextMarkup, /SCRUTINY <strong>3 \/ 7/);
  assert.doesNotMatch(nextMarkup, /Submit report|Choose a procedure|Keep procedure|data-value="draft:/);
  assert.equal(gameControls(nextMarkup).length, 0);
});

test('earned procedures enter the next hand without a separate choice screen', () => {
  const state = closeFirstFile(interview()), view = vacancyStatus(state);
  assert.ok(view.hand.some(card => card.id === 'procedure-scope'));
  const open = vacancyMarkup(view, false, 'procedure-scope'), paper = enlargedPaper(open);
  assert.match(paper, /Learned from the supervisor/);
  assert.match(paper, /data-value="play:procedure-scope"/);
  assert.match(paper, /aria-label="Add to file: Narrow Scope"/);
  assert.match(paper, />Add to file<\/button>/);
  assert.doesNotMatch(open, /Keep procedure|data-value="draft:|data-value="end-turn"/);
  assert.equal(gameControls(open).length, 1);
});

test('selection changes the readable paper without modifying the run', () => {
  const state = interview(), before = structuredClone(state), view = vacancyStatus(state);
  const evidence = enlargedPaper(vacancyMarkup(view, false, 'evidence-badge'));
  const answer = enlargedPaper(vacancyMarkup(view, false, 'answer-1-redact'));
  assert.match(evidence, /EXHIBIT 04 · The northeast corner/);
  assert.match(evidence, /The photograph on the badge is intact/);
  assert.match(evidence, /data-value="play:evidence-badge"/);
  assert.match(answer, /Nothing outside the expected growth pattern/);
  assert.match(answer, /data-value="play:answer-1-redact"/);
  assert.deepEqual(state, before);
});

test('scrutiny shows the shared limit and effects stay on the selected paper', () => {
  const state = interview(), before = structuredClone(state);
  const closed = vacancyMarkup(vacancyStatus(state));
  assert.match(closed, /SCRUTINY <strong>0 \/ 7/);
  assert.match(closed, /Scrutiny carries across all three files\. 7 ends the interview/);
  assert.doesNotMatch(closed, /less to approve|vacancy-intent|On submit|On your next submission|\+3 scrutiny/);
  const open = vacancyMarkup(vacancyStatus(state), false, 'evidence-badge');
  assert.match(enlargedPaper(open), /\+4 approval<br>\+3 scrutiny/);
  assert.equal((open.match(/\+3 scrutiny/g) || []).length, 1);
  assert.deepEqual(state, before);
  add(state, 'evidence-badge');
  assert.match(vacancyMarkup(vacancyStatus(state)), /SCRUTINY <strong>3 \/ 7/);
});

test('Reclassify names the bonus as approval and the next evidence paper includes it', () => {
  const state = interview();
  const before = vacancyStatus(state);
  const support = enlargedPaper(vacancyMarkup(before, false, 'answer-1-redact'));
  assert.match(support, /\+1 approval<br>-4 scrutiny<br>next evidence: \+2 approval/);
  assert.equal((support.match(/next evidence: \+2 approval/g) || []).length, 1);
  const evidenceBefore = enlargedPaper(vacancyMarkup(before, false, 'evidence-badge'));
  assert.match(evidenceBefore, /\+4 approval<br>\+3 scrutiny/);
  add(state, 'answer-1-redact');
  const evidenceAfter = enlargedPaper(vacancyMarkup(vacancyStatus(state), false, 'evidence-badge'));
  assert.match(evidenceAfter, /\+6 approval<br>\+3 scrutiny/);
});

// Exercise the presentation controller with real game transitions. The small
// paint/hand doubles avoid requiring WebGL to test timing and input locks.
function presentationUI({ reducedMotion = false } = {}) {
  let mounted = false, ended = 0, deals = 0, dismissals = 0, disposed = 0;
  const scene = { classList: { toggle() {} } };
  const root = {
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: reducedMotion }) } },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => mounted ? scene : null,
    set innerHTML(value) { mounted = !!value; }
  };
  class PresentationUI extends VacancyUI {
    frames = [];
    played = [];
    showView(view) {
      this.view = view; this.selectedId = null; this.helpOpen = false;
      root.innerHTML = 'mounted';
      this.hand ??= {
        render() {}, dispose() { disposed++; },
        deal() { deals++; return reducedMotion ? 0 : 740; },
        dismiss() { dismissals++; return reducedMotion ? 0 : 300; }
      };
      this.frames.push({ view: structuredClone(view), phase: this.phase, blocked: this.blocked });
    }
    flyPaper(direction) { this.played.push(direction); }
  }
  return {
    ui: new PresentationUI(root, { onPresentationEnd: () => ended++ }),
    stats: () => ({ ended, deals, dismissals, disposed })
  };
}

test('a fresh hand deals once; repeated render and pause do not replay it', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), before = structuredClone(state), { ui, stats } = presentationUI();
  ui.render(state);
  assert.equal(ui.presenting, true);
  assert.equal(ui.blocked, true);
  ui.select('evidence-badge');
  assert.equal(ui.selectedId, null);
  t.mock.timers.tick(300);
  ui.render(state, true);
  t.mock.timers.tick(1000);
  assert.equal(ui.presenting, true, 'Pause preserves the unfinished deal hold');
  ui.render(state, false);
  t.mock.timers.tick(439);
  assert.equal(ui.presenting, true);
  t.mock.timers.tick(1);
  assert.equal(ui.presenting, false);
  assert.equal(ui.blocked, false);
  ui.render(state); ui.render(state, true); ui.render(state);
  assert.deepEqual(stats(), { ended: 1, deals: 1, dismissals: 0, disposed: 0 });
  assert.deepEqual(state, before, 'Presentation never modifies the game clock or state');
  ui.dispose();
});

test('approval holds the completed file, dismisses its hand, then deals the next file', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), { ui, stats } = presentationUI();
  add(state, 'answer-0-sign'); add(state, 'answer-1-redact');
  ui.render(state);
  assert.equal(ui.presenting, false, 'Restoring an existing file does not replay its deal');
  ui.selectedId = 'evidence-badge';
  add(state, 'evidence-badge');
  const completedState = structuredClone(state);
  ui.render(state);
  assert.equal(ui.phase, 'approval');
  assert.equal(ui.view.round, 1, 'The completed file remains on the desk');
  assert.equal(ui.view.progress, ui.view.goal);
  assert.equal(ui.selectedId, null);
  assert.deepEqual(ui.played, ['play']);
  assert.equal(ui.view.hand.some(card => card.id === 'evidence-badge'), false);
  ui.render(state); ui.render(state);
  t.mock.timers.tick(799);
  assert.equal(ui.view.round, 1);
  t.mock.timers.tick(1);
  assert.equal(ui.phase, 'deal');
  assert.equal(ui.view.round, 2);
  assert.equal(ui.view.progress, 0);
  assert.equal(ui.blocked, true);
  t.mock.timers.tick(740);
  assert.equal(ui.presenting, false);
  assert.equal(ui.blocked, false);
  assert.deepEqual(stats(), { ended: 1, deals: 1, dismissals: 1, disposed: 0 });
  assert.deepEqual(state, completedState);
  ui.dispose();
});

test('reduced motion keeps a readable approval hold and skips the deal animation', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), { ui, stats } = presentationUI({ reducedMotion: true });
  add(state, 'answer-0-sign'); add(state, 'answer-1-redact'); ui.render(state);
  add(state, 'evidence-badge'); ui.render(state);
  t.mock.timers.tick(200); ui.render(state, true);
  t.mock.timers.tick(1000);
  assert.equal(ui.phase, 'approval');
  ui.render(state); t.mock.timers.tick(399);
  assert.equal(ui.view.round, 1);
  t.mock.timers.tick(1);
  assert.equal(ui.view.round, 2);
  assert.equal(ui.presenting, false);
  assert.equal(stats().ended, 1);
  ui.dispose();
});

test('the final approval finishes before notifying the ending presenter', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), { ui, stats } = presentationUI();
  for (const id of ['answer-0-sign', 'answer-1-redact', 'evidence-badge', 'procedure-scope', 'answer-0-sign', 'answer-1-redact', 'evidence-badge', 'procedure-scope', 'answer-0-sign', 'answer-1-redact', 'procedure-precedent']) add(state, id);
  assert.equal(state.stage, 'play');
  ui.render(state); add(state, 'evidence-badge'); ui.render(state);
  assert.equal(state.stage, 'complete');
  assert.equal(ui.view.stage, 'play');
  assert.equal(ui.view.round, 3);
  assert.equal(ui.presenting, true);
  assert.equal(stats().ended, 0);
  t.mock.timers.tick(800);
  assert.equal(ui.view.stage, 'complete');
  assert.equal(ui.presenting, false);
  assert.equal(stats().ended, 1);
  assert.equal(stats().deals, 0, 'There is no fourth hand');
  assert.match(vacancyMarkup(ui.view), /class="vacancy-approved-stamp" role="status" aria-label="File 3 approved">APPROVED/);
  ui.render(state);
  assert.equal(stats().ended, 1);
  ui.dispose();
});

test('a risky card that ends the interview never displays an approval stamp', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), { ui, stats } = presentationUI();
  add(state, 'answer-0-sign'); add(state, 'evidence-badge');
  assert.equal(state.scrutiny, 6);
  ui.render(state); add(state, 'answer-0-sign'); ui.render(state);
  assert.equal(ui.view.stage, 'failed');
  assert.equal(ui.presenting, false);
  assert.doesNotMatch(vacancyMarkup(ui.view), /vacancy-approved-stamp/);
  t.mock.timers.tick(2000);
  assert.equal(stats().ended, 0);
  ui.dispose();
});

test('leaving during approval cancels pending presentation and callbacks', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const state = interview(), { ui, stats } = presentationUI();
  add(state, 'answer-0-sign'); add(state, 'answer-1-redact'); ui.render(state);
  add(state, 'evidence-badge'); ui.render(state);
  ui.dispose(); t.mock.timers.tick(3000);
  assert.equal(ui.presenting, false);
  assert.equal(stats().ended, 0);
  assert.equal(stats().deals, 0);
  assert.equal(stats().disposed, 1);
});
