import * as THREE from './vendor/three/three.module.js';

const PAPER_WIDTH = 2;
const PAPER_HEIGHT = 2.95;
// Sideways tilt changes each paper's depth across its face. Leave enough room
// for those edges and the dossier thickness, not just the cards' centers.
const CARD_DEPTH_STEP = .2;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const DEAL_CARD_MS = 440;
const DEAL_STAGGER_MS = 75;
export const vacancyDealDuration = count => count > 0 ? DEAL_CARD_MS + (count - 1) * DEAL_STAGGER_MS : 0;

/** A paper arrives face down from the right, turns over, and settles in the fan. */
export function vacancyDealPose(target, index, elapsed, width) {
  const progress = Math.max(0, Math.min(1, (elapsed - index * DEAL_STAGGER_MS) / DEAL_CARD_MS));
  const amount = 1 - (1 - progress) ** 3;
  const mix = (from, to) => from + (to - from) * amount;
  return { x: mix(width / 2 + 1.4, target.x), y: mix(1.2, target.y) + Math.sin(progress * Math.PI) * .35,
    z: mix(.9 + index * .04, target.z), rotationX: mix(-.28, target.rotationX),
    rotationY: mix(Math.PI, target.rotationY), rotationZ: mix(-.32, target.rotationZ), scale: mix(.72, target.scale) };
}

function positionPaper(entry, pose) {
  entry.group.position.set(pose.x, pose.y, pose.z);
  entry.group.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
  entry.group.scale.setScalar(pose.scale);
}

/** Physical positions only. This view neither shuffles nor changes the deck. */
export function vacancyHandLayout(count, selectedIndex = -1, aspect = 1.6) {
  const size = Math.max(0, Math.min(10, Math.floor(finite(count, 0))));
  const ratio = Math.max(.3, Math.min(8, finite(aspect, 1.6)));
  const middle = (size - 1) / 2, spread = size > 5 ? .7 : Math.max(.86, Math.min(1.35, ratio * .38));
  const selectedLift = Math.max(.72, (size - 1) * CARD_DEPTH_STEP + .22);
  const cards = Array.from({ length: size }, (_, index) => {
      const side = index - middle, selected = index === selectedIndex;
      return { x: side * spread, y: -.13 - Math.abs(side) * .09 + (selected ? .37 : 0),
        z: index * CARD_DEPTH_STEP + (selected ? selectedLift : 0), rotationX: -.09,
        rotationY: -side * .035, rotationZ: -side * .105,
        scale: selected ? 1.035 : 1 };
    });
  // Include the outer cards' rotated corners and the dossier tabs when fitting
  // a short phone canvas. Selected cards remain inside the same safe bounds.
  const extent = card => Math.abs(card.x) + card.scale * (Math.abs(Math.cos(card.rotationZ)) + Math.abs(Math.sin(card.rotationZ)) * 1.7) + .14;
  const width = Math.max(3.1, ...cards.map(card => extent(card) * 2));
  const height = Math.max(4.2, width / ratio);
  return { width: height * ratio, height, cards };
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function lines(context, text, width, maximum = 20) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' '), result = [];
  let line = '';
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (line && context.measureText(joined).width > width) { result.push(line); line = word; }
    else line = joined;
  }
  if (line) result.push(line);
  if (result.length > maximum) {
    result.length = maximum;
    result[maximum - 1] = result[maximum - 1].replace(/[.,;:]?$/, '…');
  }
  return result;
}
function paintText(context, text, x, y, width, lineHeight, maximum) {
  const wrapped = lines(context, text, width, maximum);
  wrapped.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + wrapped.length * lineHeight;
}
function paperTexture(document, card) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Paper texture unavailable');
  const evidence = card.kind === 'evidence', procedure = card.kind === 'procedure';
  const background = evidence ? '#c5b17c' : procedure ? '#d5cfb5' : '#dedbc4';
  context.fillStyle = background; context.fillRect(0, 0, 512, 768);
  let seed = hash(`${card.id}:paper`);
  for (let n = 0; n < 1600; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = seed % 512; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    context.fillStyle = n % 3 ? 'rgba(47,43,26,.035)' : 'rgba(255,255,236,.16)';
    context.fillRect(x, seed % 768, 1 + seed % 3, 1);
  }
  if (evidence) {
    context.fillStyle = '#e1d9ba'; context.fillRect(21, 116, 470, 621);
    context.strokeStyle = '#9a8759'; context.lineWidth = 2; context.strokeRect(20, 115, 472, 623);
    context.fillStyle = '#51482e'; context.font = 'bold 18px monospace'; context.fillText('PRIVATE OBSERVATION', 29, 36);
  } else {
    context.strokeStyle = 'rgba(69,92,83,.14)'; context.lineWidth = 1;
    for (let y = 325; y < 730; y += 27) { context.beginPath(); context.moveTo(27, y); context.lineTo(486, y); context.stroke(); }
    context.strokeStyle = 'rgba(139,58,40,.25)'; context.beginPath(); context.moveTo(38, 114); context.lineTo(38, 739); context.stroke();
    context.fillStyle = '#4c503d'; context.font = 'bold 18px monospace'; context.fillText(procedure ? 'STATION DIRECTIVE' : 'DEBRIEF MEMORANDUM', 29, 36);
  }
  // The name sits above the overlap, where the hand can be read before a paper
  // is lifted. Full provenance remains on the document and in the HTML memo.
  context.fillStyle = '#273126'; context.font = 'bold 45px monospace';
  const titleEnd = paintText(context, card.title, 35, 100, 440, 48, 3);
  context.fillStyle = '#4d503c'; context.font = '17px monospace';
  const sourceEnd = paintText(context, card.source, 44, titleEnd + 12, 423, 21, 2);
  context.strokeStyle = '#7c7b5b'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(44, sourceEnd + 8); context.lineTo(466, sourceEnd + 8); context.stroke();
  context.fillStyle = '#4a4e3b'; context.font = '20px monospace';
  paintText(context, card.quote || card.description, 48, sourceEnd + 44, 410, 27, 8);
  context.fillStyle = evidence ? '#d5c99e' : '#d3cfb7'; context.fillRect(38, 614, 438, 114);
  context.strokeStyle = '#8d8260'; context.strokeRect(38, 614, 438, 114);
  context.fillStyle = '#333b2e'; context.font = 'bold 22px monospace';
  if (card.effect) {
    // Match the enlarged paper: each rule gets its own line, including the
    // approval unit on the next-evidence bonus.
    card.effect.split(' · ').forEach((effect, index) => paintText(context, effect, 52, 646 + index * 28, 411, 28, 1));
  } else paintText(context, card.description, 52, 646, 411, 28, 3);
  if (procedure) {
    context.save(); context.translate(397, 565); context.rotate(-.14);
    context.strokeStyle = '#884b38'; context.lineWidth = 3; context.strokeRect(-73, -22, 146, 43);
    context.fillStyle = '#884b38'; context.font = 'bold 20px monospace'; context.textAlign = 'center'; context.fillText('BY ORDER', 0, 6); context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function shadowTexture(document) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Paper shadow unavailable');
  context.clearRect(0, 0, 128, 192);
  context.shadowColor = 'rgba(0,0,0,.65)'; context.shadowBlur = 12; context.shadowOffsetY = 4;
  context.fillStyle = 'rgba(0,0,0,.38)'; context.fillRect(14, 14, 100, 157);
  return new THREE.CanvasTexture(canvas);
}

/** A fanned hand of physical office papers. HTML owns readable card details,
 * keyboard controls, and the deliberate Add to file button. This canvas selects. */
export class VacancyHand {
  constructor(canvas, { onSelect = () => {}, onUnavailable = () => {} } = {}) {
    this.canvas = canvas; this.onSelect = onSelect; this.onUnavailable = onUnavailable;
    this._failed = false; this.disposed = false; this.entries = []; this.cards = [];
    this.selectedId = null; this.focusedId = null; this.disabled = false; this.key = ''; this.frame = null;
    this.width = 0; this.height = 0; this.pointer = null; this.motion = null; this.resources = new Set();
    this.document = canvas.ownerDocument; this.window = this.document.defaultView;
    this.reducedMotion = this.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    this.down = event => {
      if (this._failed || this.disabled || this.motion || event.isPrimary === false || event.button !== 0) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    };
    this.move = event => {
      if (event.pointerId === this.pointer?.id && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 9) this.pointer.moved = true;
    };
    this.up = event => {
      const pointer = this.pointer; this.pointer = null;
      if (!pointer || pointer.id !== event.pointerId || pointer.moved || this.disabled || this.motion || this._failed || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 9) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.cursor.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      this.raycaster.setFromCamera(this.cursor, this.camera);
      const hit = this.raycaster.intersectObjects(this.entries.filter(entry => entry.group.visible).map(entry => entry.hit), false)[0];
      if (hit) this.onSelect(hit.object.userData.cardId);
    };
    this.cancel = () => { this.pointer = null; };
    this.contextLost = event => { event.preventDefault(); this.fail(); };
    this.resize = () => this.resizeView();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(2, this.window?.devicePixelRatio || 1));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .95;
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-4, 4, 2.1, -2.1, .1, 50);
      this.camera.position.set(0, 1.35, 10); this.camera.lookAt(0, 0, 0);
      this.scene.add(new THREE.AmbientLight(0xfff3d8, 2));
      const lamp = new THREE.DirectionalLight(0xffeed0, 2.3); lamp.position.set(-4, 7, 6); this.scene.add(lamp);
      const fill = new THREE.DirectionalLight(0xa4b49a, .55); fill.position.set(5, -2, 2); this.scene.add(fill);
      this.raycaster = new THREE.Raycaster(); this.cursor = new THREE.Vector2();
      this.sharedShadow = shadowTexture(this.document);
      canvas.style.touchAction = 'pan-y';
      canvas.addEventListener('pointerdown', this.down);
      canvas.addEventListener('pointermove', this.move);
      canvas.addEventListener('pointerup', this.up);
      canvas.addEventListener('pointercancel', this.cancel);
      canvas.addEventListener('pointerleave', this.cancel);
      canvas.addEventListener('webglcontextlost', this.contextLost);
      if (this.window?.ResizeObserver) { this.observer = new this.window.ResizeObserver(this.resize); this.observer.observe(canvas); }
      else this.window?.addEventListener('resize', this.resize);
      this.resizeView();
    } catch { this.fail(); }
  }
  get failed() { return this._failed; }
  fail() {
    if (this._failed || this.disposed) return;
    this._failed = true; this.stopAnimation();
    this.onUnavailable();
  }
  track(resource) { this.resources.add(resource); return resource; }
  clearCards() {
    this.stopAnimation();
    for (const entry of this.entries) this.scene.remove(entry.group);
    for (const resource of this.resources) resource.dispose();
    this.resources.clear(); this.entries = [];
  }
  makeCard(card, index) {
    const evidence = card.kind === 'evidence', group = new THREE.Group();
    const texture = this.track(paperTexture(this.document, card));
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const front = this.track(new THREE.MeshStandardMaterial({ map: texture, roughness: .97, metalness: 0 }));
    const edge = this.track(new THREE.MeshStandardMaterial({ color: evidence ? 0xb19a64 : 0xbdb99e, roughness: 1 }));
    const back = this.track(new THREE.MeshStandardMaterial({ color: evidence ? 0xc3ad74 : 0xd5d0b5, roughness: 1 }));
    const geometry = this.track(new THREE.BoxGeometry(PAPER_WIDTH, PAPER_HEIGHT, evidence ? .035 : .018));
    const hit = new THREE.Mesh(geometry, [edge, edge, edge, edge, front, back]);
    hit.userData.cardId = card.id; group.add(hit);
    const layerMaterial = this.track(new THREE.MeshStandardMaterial({ color: 0xd8d0b1, roughness: 1 }));
    for (let layer = 0; layer < (evidence ? 3 : 1); layer++) {
      const sheet = new THREE.Mesh(this.track(new THREE.BoxGeometry(PAPER_WIDTH - .035, PAPER_HEIGHT - .035, .009)), layerMaterial);
      sheet.position.set(.016 * (layer + 1), -.013 * (layer + 1), -.024 - layer * .011); group.add(sheet);
    }
    if (evidence) {
      const tab = new THREE.Mesh(this.track(new THREE.BoxGeometry(.68, .19, .028)), back);
      tab.position.set(.48, PAPER_HEIGHT / 2 + .065, -.012); group.add(tab);
    } else {
      const points = [[-.75,1.30,.045],[-.75,1.52,.045],[-.72,1.57,.045],[-.66,1.56,.045],[-.64,1.51,.045],[-.64,1.24,.045],[-.67,1.20,.045],[-.71,1.22,.045],[-.71,1.45,.045]].map(values => new THREE.Vector3(...values));
      const clip = new THREE.Mesh(this.track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .012, 5, false)), this.track(new THREE.MeshStandardMaterial({ color: 0x797d70, metalness: .65, roughness: .35 })));
      group.add(clip);
    }
    const shadow = new THREE.Mesh(this.track(new THREE.PlaneGeometry(PAPER_WIDTH + .42, PAPER_HEIGHT + .46)), this.track(new THREE.MeshBasicMaterial({ map: this.sharedShadow, transparent: true, depthWrite: false, opacity: .48 })));
    shadow.position.set(.07, -.08, -.09); group.add(shadow);
    this.scene.add(group);
    return { id: card.id, group, hit, front, index };
  }
  render(cards, selectedId, disabled = false, focusedId = null) {
    if (this._failed || this.disposed) return;
    const nextCards = Array.isArray(cards) ? cards.slice(0, 10) : [];
    const key = JSON.stringify(nextCards.map(card => [card.id, card.title, card.kind, card.source, card.effect, card.quote, card.description]));
    const changed = key !== this.key, selectionChanged = selectedId !== this.selectedId, disabledChanged = disabled !== this.disabled, focusChanged = focusedId !== this.focusedId;
    if (!changed && !selectionChanged && !disabledChanged && !focusChanged) return;
    try {
      if (changed) { this.clearCards(); this.cards = nextCards; this.entries = nextCards.map((card, index) => this.makeCard(card, index)); this.key = key; }
      this.selectedId = selectedId; this.focusedId = focusedId; this.disabled = !!disabled;
      this.canvas.style.cursor = this.disabled ? 'default' : 'pointer';
      for (const entry of this.entries) {
        // The enlarged HTML paper replaces this same card while it is read.
        // Preserve the fan's gap, and exclude the hidden mesh from raycasting.
        entry.group.visible = entry.id !== focusedId;
        entry.front.color.set(this.disabled ? 0xb5b5a9 : 0xffffff);
      }
      this.placeCards(selectionChanged && !changed && !this.reducedMotion);
    } catch { this.fail(); }
  }
  resizeView() {
    if (this._failed || this.disposed || !this.renderer) return;
    const bounds = this.canvas.getBoundingClientRect(), width = Math.round(bounds.width), height = Math.round(bounds.height);
    if (width < 1 || height < 1 || width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    try { this.renderer.setSize(width, height, false); if (!this.motion) this.placeCards(false); } catch { this.fail(); }
  }
  deal() {
    if (this._failed || this.disposed || !this.entries.length || !this.width || !this.height || this.reducedMotion || !this.window?.requestAnimationFrame) return 0;
    this.stopAnimation(); this.motion = 'deal'; this.pointer = null;
    const duration = vacancyDealDuration(this.entries.length), began = this.window.performance.now();
    const draw = elapsed => {
      const layout = vacancyHandLayout(this.entries.length, -1, this.width / this.height);
      this.camera.left = -layout.width / 2; this.camera.right = layout.width / 2;
      this.camera.top = layout.height / 2; this.camera.bottom = -layout.height / 2;
      this.camera.updateProjectionMatrix();
      this.entries.forEach((entry, index) => positionPaper(entry, vacancyDealPose(layout.cards[index], index, elapsed, layout.width)));
      this.renderer.render(this.scene, this.camera);
    };
    try { draw(0); } catch { this.fail(); return 0; }
    const frame = now => {
      if (this.disposed || this._failed) return;
      const elapsed = Math.min(duration, now - began);
      try { draw(elapsed); } catch { this.fail(); return; }
      if (elapsed < duration) this.frame = this.window.requestAnimationFrame(frame);
      else { this.frame = null; this.motion = null; }
    };
    this.frame = this.window.requestAnimationFrame(frame);
    return duration;
  }
  dismiss() {
    if (this._failed || this.disposed || !this.entries.length || !this.width || !this.height || this.reducedMotion || !this.window?.requestAnimationFrame) return 0;
    this.stopAnimation(); this.motion = 'dismiss'; this.pointer = null;
    const layout = vacancyHandLayout(this.entries.length, -1, this.width / this.height);
    const starts = this.entries.map(entry => ({ x: entry.group.position.x, y: entry.group.position.y, z: entry.group.position.z, rotationX: entry.group.rotation.x, rotationY: entry.group.rotation.y, rotationZ: entry.group.rotation.z, scale: entry.group.scale.x }));
    const duration = 300, began = this.window.performance.now();
    const frame = now => {
      if (this.disposed || this._failed) return;
      const progress = Math.min(1, (now - began) / duration), amount = progress * progress;
      this.entries.forEach((entry, index) => {
        const start = starts[index];
        positionPaper(entry, { ...start, x: start.x + (-layout.width / 2 - 2 - start.x) * amount,
          y: start.y + amount * 1.1, rotationZ: start.rotationZ + amount * .3, scale: start.scale * (1 - amount * .2) });
      });
      try { this.renderer.render(this.scene, this.camera); } catch { this.fail(); return; }
      if (progress < 1) this.frame = this.window.requestAnimationFrame(frame);
      else { this.frame = null; this.motion = null; }
    };
    this.frame = this.window.requestAnimationFrame(frame);
    return duration;
  }
  placeCards(animate) {
    if (!this.width || !this.height) return;
    this.stopAnimation();
    const layout = vacancyHandLayout(this.entries.length, this.entries.findIndex(entry => entry.id === this.selectedId), this.width / this.height);
    this.camera.left = -layout.width / 2; this.camera.right = layout.width / 2;
    this.camera.top = layout.height / 2; this.camera.bottom = -layout.height / 2;
    this.camera.updateProjectionMatrix();
    const starts = this.entries.map(entry => ({ position: entry.group.position.clone(), rotation: entry.group.rotation.clone(), scale: entry.group.scale.x }));
    const apply = amount => {
      this.entries.forEach((entry, index) => {
        const target = layout.cards[index], start = starts[index], group = entry.group;
        group.position.set(THREE.MathUtils.lerp(start.position.x, target.x, amount), THREE.MathUtils.lerp(start.position.y, target.y, amount), THREE.MathUtils.lerp(start.position.z, target.z, amount));
        group.rotation.set(THREE.MathUtils.lerp(start.rotation.x, target.rotationX, amount), THREE.MathUtils.lerp(start.rotation.y, target.rotationY, amount), THREE.MathUtils.lerp(start.rotation.z, target.rotationZ, amount));
        group.scale.setScalar(THREE.MathUtils.lerp(start.scale, target.scale, amount));
      });
      this.renderer.render(this.scene, this.camera);
    };
    if (!animate || !this.window?.requestAnimationFrame) { apply(1); return; }
    const began = this.window.performance.now();
    const frame = now => {
      if (this.disposed || this._failed) return;
      const progress = Math.min(1, (now - began) / 160);
      try { apply(1 - (1 - progress) ** 3); } catch { this.fail(); return; }
      if (progress < 1) this.frame = this.window.requestAnimationFrame(frame);
      else this.frame = null;
    };
    this.frame = this.window.requestAnimationFrame(frame);
  }
  stopAnimation() { if (this.frame !== null) this.window?.cancelAnimationFrame(this.frame); this.frame = null; this.motion = null; }
  dispose() {
    if (this.disposed) return;
    this.stopAnimation(); this.observer?.disconnect(); this.window?.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('pointerleave', this.cancel); this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    if (this.scene) this.clearCards();
    this.sharedShadow?.dispose(); this.renderer?.dispose(); this.disposed = true;
  }
}
