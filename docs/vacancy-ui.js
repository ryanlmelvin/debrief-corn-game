import { vacancyStatus } from './vacancy.js';
import { VacancyHand } from './vacancy-hand.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const cardsFor = view => view.hand;

function headingMarkup(view) {
  return `<div class="vacancy-file-heading"><span>FILE ${view.round} / ${view.totalRounds}</span><h2 id="vacancy-title" tabindex="-1">${escape(view.title)}</h2></div><button type="button" class="vacancy-help" data-vacancy-help aria-label="How to play">?</button>`;
}

function reportMarkup(view, approved = view.stage === 'complete') {
  return `<div class="vacancy-report-paper ${approved ? 'is-approved' : ''}"><span class="vacancy-approval-label">APPROVAL</span><strong class="vacancy-approval">${view.progress}<small> / ${view.goal}</small></strong><progress value="${Math.min(view.goal, view.progress)}" max="${view.goal}" aria-label="Report approval">${view.progress} / ${view.goal}</progress>${approved ? `<span class="vacancy-approved-stamp" role="status" aria-label="File ${view.round} approved">APPROVED</span>` : ''}</div>`;
}

function supervisorMarkup(view) {
  return `<div class="vacancy-opponent-status"><span>${escape(view.supervisor || 'SUPERVISOR')}</span><div class="vacancy-scrutiny ${view.scrutiny >= view.scrutinyLimit - 2 ? 'is-disputed' : ''}"><span>SCRUTINY <strong>${view.scrutiny} / ${view.scrutinyLimit}</strong></span><meter min="0" max="${view.scrutinyLimit}" low="${Math.floor(view.scrutinyLimit / 2)}" high="${view.scrutinyLimit - 1}" optimum="0" value="${view.scrutiny}" aria-label="Scrutiny carries across all three files. ${view.scrutinyLimit} ends the interview.">${view.scrutiny}</meter></div></div>`;
}

function selectorsMarkup(cards, selectedId, disabled) {
  return cards.map(card => `<button type="button" data-vacancy-select="${escape(card.id)}" aria-pressed="${card.id === selectedId}" ${disabled ? 'disabled' : ''}>${escape(card.title)}</button>`).join('');
}

function memoMarkup(card, disabled) {
  if (!card) return '';
  const quote = card.quote || card.description;
  return `<article class="vacancy-memo vacancy-memo-${escape(card.kind)}" role="dialog" aria-modal="false" aria-labelledby="vacancy-memo-title">
    <button type="button" class="vacancy-paper-close" data-vacancy-dismiss aria-label="Back to your hand">×</button>
    <p class="vacancy-memo-source">${escape(card.source)}</p><h3 id="vacancy-memo-title" tabindex="-1">${escape(card.title)}</h3>
    <p class="vacancy-memo-quote" tabindex="0">${escape(quote)}</p>
    <div class="vacancy-memo-footer"><p class="vacancy-card-effect">${escape(card.effect || card.description).replaceAll(' · ', '<br>')}</p><button type="button" class="primary" data-vacancy-play data-action="resolution-game" data-value="play:${escape(card.id)}" aria-label="Add to file: ${escape(card.title)}" ${disabled || !card.playable ? 'disabled' : ''}>Add to file</button></div>
  </article>`;
}

function helpMarkup(view) {
  return `<article class="vacancy-memo vacancy-rules" role="dialog" aria-modal="false" aria-labelledby="vacancy-rules-title"><button type="button" class="vacancy-paper-close" data-vacancy-dismiss aria-label="Back to your hand">×</button><p class="vacancy-memo-source">STATION PROCEDURE</p><h3 id="vacancy-rules-title" tabindex="-1">Close three files.</h3><div class="vacancy-rules-copy"><p>Reach each file’s approval target. Scrutiny carries over; ${view.scrutinyLimit} ends the interview.</p><p>Tap a paper to read it, then add it to the file.</p></div><button type="button" class="primary" data-vacancy-dismiss>Back to my hand</button></article>`;
}

/** Only the arena's small text regions change. The hand canvas persists. */
export function vacancyMarkup(view, disabled = false, selectedId = null) {
  const cards = cardsFor(view), card = cards.find(entry => entry.id === selectedId);
  const feedback = view.message || '';
  return `<section class="vacancy-game" data-stage="${escape(view.stage)}" aria-labelledby="vacancy-title">
    <header class="vacancy-heading">${headingMarkup(view)}</header>
    <div class="vacancy-arena">
      <div class="vacancy-report" data-vacancy-report>${reportMarkup(view)}</div>
      <div class="vacancy-opponent"><div data-vacancy-supervisor>${supervisorMarkup(view)}</div></div>
      <p class="sr-only" data-vacancy-feedback role="status" aria-live="polite" aria-atomic="true">${escape(feedback)}</p>
    </div>
    <div class="vacancy-hand-area">
      <div class="vacancy-hand-surface"><canvas class="vacancy-hand-canvas" aria-hidden="true"></canvas></div>
      <div class="vacancy-card-selectors" data-vacancy-selectors role="group" aria-label="Select a card">${selectorsMarkup(cards, selectedId, disabled)}</div>
      <button type="button" class="vacancy-hand-previous" data-vacancy-step="previous" aria-label="Inspect previous card" ${disabled || !cards.length ? 'disabled' : ''}>‹</button><button type="button" class="vacancy-hand-next" data-vacancy-step="next" aria-label="Inspect next card" ${disabled || !cards.length ? 'disabled' : ''}>›</button>
    </div>
    <div class="vacancy-inspector" data-vacancy-inspector ${card ? '' : 'hidden'}>${memoMarkup(card, disabled)}</div>
    <p class="sr-only" data-vacancy-selection-announcement role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;
}

export class VacancyUI {
  constructor(root, { onPresentationEnd = () => {} } = {}) {
    this.root = root; this.lastKey = ''; this.lastRound = null; this.lastStage = null;
    this.selectedId = null; this.view = null; this.disabled = false; this.hand = null; this.helpOpen = false; this.lastSeed = null; this.lastHistoryLength = 0; this.flights = new Set();
    this.phase = null; this.presentationTimer = null; this.latest = null; this.onPresentationEnd = onPresentationEnd;
    this.onClick = event => {
      if (!this.view) return;
      if (this.presenting) return;
      if (event.target.closest('[data-vacancy-dismiss]')) { this.closeInspector(); return; }
      if (event.target.closest('[data-vacancy-help]')) { this.helpOpen = true; this.updateInspector(); this.root.querySelector('#vacancy-rules-title')?.focus({ preventScroll: true }); return; }
      if (this.disabled) return;
      const select = event.target.closest('[data-vacancy-select]'), step = event.target.closest('[data-vacancy-step]');
      if (select && !select.disabled) this.select(select.dataset.vacancySelect);
      else if (step && !step.disabled) {
        const cards = cardsFor(this.view), index = cards.findIndex(card => card.id === this.selectedId);
        const next = step.dataset.vacancyStep === 'next';
        const target = index < 0 ? next ? 0 : cards.length - 1 : (index + (next ? 1 : -1) + cards.length) % cards.length;
        this.select(cards[target]?.id);
      }
    };
    this.onKeydown = event => { if (event.key === 'Escape' && (this.selectedId || this.helpOpen)) { event.preventDefault(); event.stopPropagation(); this.closeInspector(); } };
    root.addEventListener('click', this.onClick); root.addEventListener('keydown', this.onKeydown);
  }

  get presenting() { return this.phase !== null; }
  get isPresenting() { return this.presenting; }
  get blocked() { return this.disabled || this.presenting || this.view?.stage !== 'play'; }
  get reducedMotion() { return this.root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false; }

  cancelPresentation() {
    if (this.presentationTimer) clearTimeout(this.presentationTimer.id);
    this.presentationTimer = null; this.phase = null;
  }

  schedulePresentation(duration, done) {
    if (this.presentationTimer) clearTimeout(this.presentationTimer.id);
    this.presentationTimer = { id: null, remaining: duration, started: null, done };
    this.resumePresentationTimer();
  }

  resumePresentationTimer() {
    const timer = this.presentationTimer;
    if (!timer || this.disabled || timer.id !== null) return;
    timer.started = Date.now();
    timer.id = setTimeout(() => {
      if (this.presentationTimer !== timer) return;
      this.presentationTimer = null; timer.done();
    }, timer.remaining);
  }

  setPaused(paused) {
    this.disabled = !!paused;
    const timer = this.presentationTimer;
    if (paused && timer && timer.id !== null) {
      clearTimeout(timer.id); timer.id = null;
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.started));
    } else if (!paused) this.resumePresentationTimer();
    this.root.querySelector('.vacancy-game')?.classList.toggle('vacancy-presentation-paused', this.disabled);
  }

  reset() {
    this.cancelPresentation(); this.latest = null;
    for (const flight of this.flights) { clearTimeout(flight.timer); flight.node.remove(); } this.flights.clear();
    this.hand?.dispose(); this.hand = null; this.lastKey = ''; this.lastRound = null; this.lastStage = null;
    this.selectedId = null; this.view = null; this.helpOpen = false; this.lastSeed = null; this.lastHistoryLength = 0; this.root.innerHTML = '';
  }

  dispose() { this.reset(); this.root.removeEventListener('click', this.onClick); this.root.removeEventListener('keydown', this.onKeydown); }

  closeInspector() {
    const wasInside = this.root.querySelector('[data-vacancy-inspector]')?.contains(this.root.ownerDocument.activeElement);
    if (this.selectedId) this.flyPaper('return');
    this.selectedId = null; this.helpOpen = false; this.updateSelection();
    if (wasInside) this.root.querySelector('[data-vacancy-step="next"]')?.focus({ preventScroll: true });
  }

  select(id) {
    if (this.blocked || !cardsFor(this.view).some(card => card.id === id)) return;
    this.selectedId = id; this.helpOpen = false; this.updateSelection();
    const card = cardsFor(this.view).find(entry => entry.id === id);
    this.root.querySelector('[data-vacancy-selection-announcement]').textContent = `${card.title}. ${card.effect}`;
    (this.root.querySelector('[data-vacancy-play]:not(:disabled)') || this.root.querySelector('.vacancy-paper-close'))?.focus({ preventScroll: true });
  }

  flyPaper(direction) {
    if (this.root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const paper = this.root.querySelector('[data-vacancy-inspector] .vacancy-memo');
    if (!paper) return;
    const target = this.root.querySelector(direction === 'play' ? '.vacancy-report' : '.vacancy-hand-surface');
    const frame = this.root.getBoundingClientRect(), from = paper.getBoundingClientRect(), to = target.getBoundingClientRect();
    const node = paper.cloneNode(true);
    node.inert = true; node.setAttribute('aria-hidden', 'true'); node.removeAttribute('aria-labelledby');
    for (const element of node.querySelectorAll('[id]')) element.removeAttribute('id');
    node.classList.add('vacancy-paper-flight', `vacancy-paper-${direction}`);
    Object.assign(node.style, { left: `${from.left - frame.left}px`, top: `${from.top - frame.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    node.style.setProperty('--flight-x', `${to.left + to.width / 2 - from.left - from.width / 2}px`);
    node.style.setProperty('--flight-y', `${to.top + to.height / 2 - from.top - from.height / 2}px`);
    this.root.querySelector('.vacancy-game').append(node);
    const flight = { node, timer: null };
    flight.timer = setTimeout(() => { node.remove(); this.flights.delete(flight); }, 380);
    this.flights.add(flight);
  }

  updateInspector() {
    const panel = this.root.querySelector('[data-vacancy-inspector]');
    const card = cardsFor(this.view).find(entry => entry.id === this.selectedId);
    panel.hidden = !this.helpOpen && !card;
    panel.innerHTML = this.helpOpen ? helpMarkup(this.view) : memoMarkup(card, this.blocked);
    this.root.querySelector('.vacancy-game').classList.toggle('vacancy-inspecting', !panel.hidden);
  }

  updateSelection() {
    const { view } = this, disabled = this.blocked, cards = cardsFor(view);
    this.updateInspector();
    for (const button of this.root.querySelectorAll('[data-vacancy-select]')) { button.setAttribute('aria-pressed', String(button.dataset.vacancySelect === this.selectedId)); button.disabled = disabled; }
    for (const button of this.root.querySelectorAll('[data-vacancy-step]')) button.disabled = disabled || !cards.length;
    this.hand?.render(cards, this.selectedId, disabled, !this.helpOpen ? this.selectedId : null);
    this.root.querySelector('.vacancy-game').classList.toggle('vacancy-hand-unavailable', !!this.hand?.failed);
  }

  showView(view, { transition = false, addedSelectedCard = false } = {}) {
    const focused = this.root.ownerDocument.activeElement, hadFocus = this.root.contains(focused);
    const wasPlay = hadFocus && focused?.hasAttribute('data-vacancy-play'), focusValue = hadFocus ? focused?.dataset?.value : null;
    const focusSelect = hadFocus ? focused?.dataset?.vacancySelect : null;
    this.view = view;
    const disabled = this.blocked;
    const cards = cardsFor(view);
    if (transition || addedSelectedCard || !cards.some(card => card.id === this.selectedId)) this.selectedId = null;
    if (transition) this.helpOpen = false;
    if (!this.root.querySelector('.vacancy-game')) {
      this.root.innerHTML = vacancyMarkup(view, disabled, this.selectedId);
      this.hand = new VacancyHand(this.root.querySelector('.vacancy-hand-canvas'), { onSelect: id => this.select(id), onUnavailable: () => this.root.querySelector('.vacancy-game')?.classList.add('vacancy-hand-unavailable') });
    } else {
      this.root.querySelector('.vacancy-game').dataset.stage = view.stage;
      this.root.querySelector('.vacancy-heading').innerHTML = headingMarkup(view);
      this.root.querySelector('[data-vacancy-report]').innerHTML = reportMarkup(view, this.phase === 'approval' || view.stage === 'complete');
      this.root.querySelector('[data-vacancy-supervisor]').innerHTML = supervisorMarkup(view);
      const feedback = this.root.querySelector('[data-vacancy-feedback]');
      feedback.textContent = view.message || '';
      this.root.querySelector('[data-vacancy-selectors]').innerHTML = selectorsMarkup(cards, this.selectedId, disabled);
    }
    const scene = this.root.querySelector('.vacancy-game');
    scene.classList.toggle('vacancy-approving', this.phase === 'approval');
    scene.classList.toggle('vacancy-dealing', this.phase === 'deal');
    scene.classList.toggle('vacancy-presentation-paused', this.disabled);
    scene.setAttribute('aria-busy', String(this.presenting));
    this.root.querySelector('[data-vacancy-help]').disabled = disabled;
    this.updateSelection();
    if (transition || addedSelectedCard) this.root.querySelector('[data-vacancy-selection-announcement]').textContent = '';
    if (hadFocus) {
      const target = transition ? this.root.querySelector('#vacancy-title') : wasPlay ? this.root.querySelector('[data-vacancy-step="next"]') : focusSelect ? [...this.root.querySelectorAll('[data-vacancy-select]')].find(button => button.dataset.vacancySelect === focusSelect) : focusValue ? [...this.root.querySelectorAll('button[data-value]')].find(button => button.dataset.value === focusValue) : null;
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  finishPresentation() {
    this.cancelPresentation();
    if (this.latest) this.showView(this.latest.view, { transition: true });
    this.onPresentationEnd();
  }

  dealCurrentHand() {
    const duration = this.hand?.deal() || 0;
    if (duration > 0) this.schedulePresentation(duration, () => this.finishPresentation());
    else this.finishPresentation();
  }

  approveFile(next) {
    this.phase = 'approval';
    const playedId = next.lastAction?.startsWith('play:') ? next.lastAction.slice(5) : null;
    // The engine has already closed this file. Keep its identity on the desk
    // until the stamp lands, then reveal the next engine snapshot.
    const approved = { ...this.view, progress: Math.max(this.view.goal, this.view.progress), scrutiny: next.view.scrutiny,
      hand: this.view.hand.filter(card => card.id !== playedId), message: `File ${this.view.round} approved.` };
    this.showView(approved, { transition: true });
    const dismissal = this.hand?.dismiss() || 0;
    if (!dismissal) this.hand?.render([], null, true);
    this.schedulePresentation(this.reducedMotion ? 600 : 800, () => {
      if (this.latest.view.stage !== 'play') { this.finishPresentation(); return; }
      this.phase = 'deal';
      this.showView(this.latest.view, { transition: true });
      this.dealCurrentHand();
    });
  }

  render(state, disabled = false) {
    const view = vacancyStatus(state);
    if (!view) { this.reset(); this.root.hidden = true; return; }
    this.root.hidden = false;
    const next = { view, seed: state.seed, historyLength: state.history.length, lastAction: state.history.at(-1) };
    const newRun = this.lastSeed !== null && this.lastSeed !== state.seed;
    if (newRun) this.reset();
    this.latest = next;
    this.setPaused(disabled);
    const key = JSON.stringify([view, disabled, state.seed]);
    if (key === this.lastKey && this.root.querySelector('.vacancy-game')) return;
    const firstRender = !this.view;
    const changedFile = this.view && (this.view.stage !== view.stage || this.view.round !== view.round);
    const freshPlay = this.lastSeed === state.seed && next.historyLength > this.lastHistoryLength;
    const closedFile = this.view?.stage === 'play' && freshPlay && (view.round > this.view.round || view.stage === 'complete');
    const addedSelectedCard = freshPlay && this.selectedId && next.lastAction === `play:${this.selectedId}`;
    this.lastKey = key; this.lastRound = view.round; this.lastStage = view.stage; this.lastSeed = state.seed; this.lastHistoryLength = next.historyLength;
    if (this.presenting) return;
    if (addedSelectedCard) this.flyPaper('play');
    if (closedFile) { this.approveFile(next); return; }
    const initialDeal = firstRender && view.stage === 'play' && next.historyLength === 0;
    if (initialDeal) this.phase = 'deal';
    this.showView(view, { transition: changedFile || newRun, addedSelectedCard });
    if (initialDeal) this.dealCurrentHand();
  }
}
