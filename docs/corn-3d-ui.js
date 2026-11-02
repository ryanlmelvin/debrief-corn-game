import { bindCornControls } from './corn-controls.js';

const loadCornWorld = async canvas => {
  const { createCornWorld } = await import('./corn-world.js');
  return createCornWorld(canvas);
};

// Presentation and input only. The main app owns the game clock and saves.
// Keep the existing board visible until WebGL is ready, and retain it on error.
export class Corn3DUI {
  constructor({ root, canvas, surface, buttons, fallback, onMove,
    loadWorld = loadCornWorld, bindControls = bindCornControls,
    now = () => performance.now() }) {
    Object.assign(this, { root, canvas, surface, fallback, onMove, now });
    this.game = null; this.paused = true; this.loading = true; this.disposed = false;
    this.world = null; this.lastFrame = null; this.crossing = null;
    this.doc = root.ownerDocument;
    this.win = this.doc?.defaultView;
    this.controls = bindControls({ canvas: surface, buttons,
      isEnabled: () => this.enabled,
      move: (dx, dy) => this.enabled ? onMove(dx, dy) : false
    });
    this.resize = () => { this.release(); this.world?.resize(); };
    this.contextLost = event => { event.preventDefault(); this.useFallback(); };
    this.win?.addEventListener('resize', this.resize);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    const Observer = this.win?.ResizeObserver;
    if (Observer) { this.observer = new Observer(this.resize); this.observer.observe(surface); }
    this.ready = Promise.resolve().then(() => loadWorld(canvas)).then(world => {
      if (this.disposed || !this.loading) { world.dispose(); return; }
      this.world = world;
      canvas.hidden = false;
      world.resize();
      if (this.game) world.render(this.game, 0, { paused: true });
      this.loading = false;
      fallback.hidden = true;
      root.classList.add('corn-3d-ready');
    }).catch(() => { if (!this.disposed) this.useFallback(); });
  }

  get enabled() {
    return !this.disposed && !this.loading && !this.paused && !this.root.hidden &&
      !this.doc?.hidden && this.game?.phase === 'rogue' &&
      this.game.rogue?.route === 'corn' && this.game.rogue.stage === 'play';
  }

  release() { this.controls?.release(); }

  useFallback() {
    this.release();
    this.loading = false;
    this.world?.dispose(); this.world = null;
    this.canvas.hidden = true;
    this.fallback.hidden = false;
    this.root.classList.remove('corn-3d-ready');
    this.root.classList.add('corn-3d-fallback-active');
  }

  render(game, paused = false) {
    if (this.disposed) return;
    const crossing = `${game.runId}:${game.rogue.crossing || 0}`;
    if (crossing !== this.crossing || paused || this.doc?.hidden) this.release();
    this.crossing = crossing;
    this.game = game;
    this.paused = paused;
    const time = this.now(), dt = this.lastFrame === null ? 0 : Math.min(.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    if (this.world) {
      try { this.world.render(game, dt, { paused: !this.enabled }); }
      catch { this.useFallback(); }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loading = false;
    this.controls.destroy();
    this.observer?.disconnect();
    this.win?.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.world?.dispose(); this.world = null;
    this.root.classList.remove('corn-3d-ready', 'corn-3d-fallback-active');
  }
}
