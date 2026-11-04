import { resolutionGameActive } from './resolution-games.js';
import { RescueUI } from './rescue-ui.js';
import { TransmissionUI } from './transmission-ui.js';
import { VacancyUI } from './vacancy-ui.js';

export class ResolutionGamesUI {
  constructor(root, { onPresentationEnd = () => {} } = {}) { this.root = root; this.kind = null; this.ui = null; this.runId = null; this.onPresentationEnd = onPresentationEnd; }
  get presenting() { return this.kind === 'vacancy' && !!this.ui?.presenting; }
  render(s, disabled = false) {
    const active = resolutionGameActive(s);
    const finishing = this.kind === 'vacancy' && this.runId === s?.runId && s?.phase === 'resolution' && s.resolution?.activity?.kind === 'vacancy' && s.resolution.activity.state.stage === 'complete';
    if (!active && !finishing) {
      this.root.hidden = true;
      if (this.presenting) { this.ui.dispose(); this.ui = null; this.kind = null; this.runId = null; }
      return;
    }
    this.root.hidden = false;
    const kind = s.resolution.activity.kind;
    if (kind !== this.kind) {
      this.ui?.dispose?.();
      this.kind = kind;
      this.root.innerHTML = '<div class="resolution-game-board"></div><div class="resolution-game-exit"><button class="secondary" data-action="resolution-answer" data-value="back">Leave and answer the supervisor</button></div>';
      const GameUI = kind === 'rescue' ? RescueUI : kind === 'vacancy' ? VacancyUI : TransmissionUI;
      this.ui = new GameUI(this.root.querySelector('.resolution-game-board'), { onPresentationEnd: this.onPresentationEnd });
    }
    this.runId = s.runId;
    const back = this.root.querySelector('.resolution-game-exit');
    back.hidden = !!s.practice;
    back.querySelector('button').disabled = disabled;
    this.ui.render(s.resolution.activity.state, disabled, s.exposure);
    this.root.hidden = !active && !this.presenting;
  }
}
