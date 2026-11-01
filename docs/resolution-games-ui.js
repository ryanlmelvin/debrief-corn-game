import { resolutionGameActive } from './resolution-games.js';
import { RescueUI } from './rescue-ui.js';

export class ResolutionGamesUI {
  constructor(root) { this.root = root; this.kind = null; this.ui = null; }
  render(s, disabled = false) {
    const active = resolutionGameActive(s);
    this.root.hidden = !active;
    if (!active) return;
    const kind = s.resolution.activity.kind;
    if (kind !== this.kind) {
      this.kind = kind;
      this.root.innerHTML = '<div class="resolution-game-board"></div><div class="resolution-game-exit"><button class="secondary" data-action="resolution-answer" data-value="back">Leave and answer the supervisor</button></div>';
      this.ui = new RescueUI(this.root.querySelector('.resolution-game-board'));
    }
    const back = this.root.querySelector('.resolution-game-exit');
    back.hidden = !!s.practice;
    back.querySelector('button').disabled = disabled;
    this.ui.render(s.resolution.activity.state, disabled);
  }
}
