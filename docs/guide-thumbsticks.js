// Each stick owns one pointer so either thumb can move or lift independently.
export function stickVector(dx, dy, radius) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(radius) || radius <= 0) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy), deadZone = .12;
  const amount = Math.min(1, distance / radius);
  if (amount <= deadZone) return { x: 0, y: 0 };
  const strength = ((amount - deadZone) / (1 - deadZone)) ** 1.35;
  return { x: dx / distance * strength, y: dy / distance * strength };
}

export function bindThumbstick(element, { onChange, isEnabled = () => true }) {
  let pointer = null, center = null;
  function render(dx, dy) {
    element.style.setProperty('--thumb-x', `${dx}px`);
    element.style.setProperty('--thumb-y', `${dy}px`);
  }
  function update(event) {
    const dx = event.clientX - center.x, dy = event.clientY - center.y;
    const length = Math.hypot(dx, dy), limit = Math.min(1, center.radius / (length || 1));
    render(dx * limit, dy * limit);
    onChange(stickVector(dx, dy, center.radius));
  }
  function reset() {
    const previous = pointer;
    pointer = null; center = null;
    element.classList.remove('engaged');
    render(0, 0); onChange({ x: 0, y: 0 });
    if (previous !== null && element.hasPointerCapture(previous)) element.releasePointerCapture(previous);
  }
  function down(event) {
    if (!isEnabled() || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = element.getBoundingClientRect();
    pointer = event.pointerId;
    center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: Math.min(rect.width, rect.height) * .32 };
    element.classList.add('engaged');
    try { element.setPointerCapture(pointer); } catch { reset(); return; }
    update(event);
  }
  function move(event) {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); event.stopPropagation();
    if (!isEnabled()) { reset(); return; }
    update(event);
  }
  function up(event) {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); event.stopPropagation(); reset();
  }
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up };
  for (const [name, listener] of Object.entries(events)) element.addEventListener(name, listener);
  element.addEventListener('contextmenu', preventMenu);
  function preventMenu(event) { event.preventDefault(); }
  return {
    reset,
    destroy() {
      reset();
      for (const [name, listener] of Object.entries(events)) element.removeEventListener(name, listener);
      element.removeEventListener('contextmenu', preventMenu);
    }
  };
}
