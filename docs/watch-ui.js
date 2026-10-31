import { RELOAD_DURATION, RELOAD_WINDOW_MIN, RELOAD_WINDOW_MAX, watchSummary } from './watch-play.js';

const $ = id => document.getElementById(id);
const BEST_KEY = `debrief-watch-bests-v1:${new URL('.', location.href).pathname}`;
let bests = {};
try {
  const stored = JSON.parse(localStorage.getItem(BEST_KEY));
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [key, score] of Object.entries(stored)) {
      if (/^(story|hard)-[0-2]$/.test(key) && Number.isSafeInteger(score) && score >= 0) bests[key] = score;
    }
  }
} catch { /* The watch remains playable without storage. */ }

export function bestWatch(s) { return bests[`${s.mode}-${s.shift}`] || 0; }

export function updateWatchUI(s, paused = false) {
  const active = s.phase === 'tower', w = s.watch;
  $('watch-scoreboard').hidden = !active;
  $('watch-radio').hidden = !active || paused;
  $('watch-record').hidden = !w || !w.shots;
  if (!w) return;
  if (!active && s.phase !== 'briefing' && w.score > bestWatch(s)) {
    bests[`${s.mode}-${s.shift}`] = w.score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch {}
  }
  if (!active) return;

  $('watch-score').textContent = String(w.score).padStart(4, '0');
  $('watch-scoreboard').classList.toggle('has-streak', w.streak >= 3);
  $('hud-ammo').textContent = `${s.rounds} / 6`;
  $('hud-ammo').setAttribute('aria-label', `${s.rounds} rounds loaded. ${s.reserve} in reserve.`);
  $('watch-rounds').innerHTML = Array.from({length:6}, (_, i) => `<i${i >= s.rounds ? ' class="spent"' : ''}></i>`).join('') + `<small>${s.reserve} reserve</small>`;

  updateReloadUI(s, paused);

  const flareTime = Math.max(0, w.flareUntil - s.time);
  $('hud-flare').disabled = paused || w.flares <= 0 || flareTime > 0;
  $('hud-flare').innerHTML = flareTime > 0 ? `◇ Burning · ${flareTime.toFixed(1)}s` : `◇ Flare · ${w.flares} <kbd>F</kbd>`;
  $('hud-flare').setAttribute('aria-label', `Emergency flare. ${w.flares} remaining. Slows all crops for four and a half seconds.`);

  const feedback = w.feedback;
  const fresh = feedback && s.time - feedback.time < 2.4;
  const crops = s.targets.filter(t => t.kind === 'corn');
  const danger = crops.some(t => (t.direction < 0 ? t.x < 195 : t.x > 765));
  const message = fresh ? feedback.text : danger ? 'At the fence. Contain them before they cross.' : crops.length >= 3 ? 'Multiple movements. A flare will buy you time.' : crops.some(t => t.variant === 'husk') ? 'Thick husk. Two hits to contain it.' : crops.some(t => t.variant === 'runner') ? 'Runner in the rows. Take it before it reaches the road.' : s.time < 8 ? 'Click / tap corn to fire. X aims. Space fires.' : !crops.length ? 'Perimeter quiet. A good time to reload.' : 'Keep your shots clean. Misses break your streak.';
  $('watch-radio-text').textContent = message;
  $('watch-radio').dataset.tone = fresh ? feedback.tone : danger ? 'alert' : 'normal';
}

export function watchRecord(s) { return { ...watchSummary(s), best: bestWatch(s) }; }

export function updateReloadUI(s, paused = false) {
  const w = s.watch;
  if (!w || s.phase !== 'tower') return;
  const reloading = s.reload > 0;
  const sweet = reloading && s.reload >= RELOAD_WINDOW_MIN && s.reload <= RELOAD_WINDOW_MAX && !w.reloadAttempted;
  const button = $('hud-reload');
  button.disabled = paused || (reloading ? w.reloadAttempted : s.rounds === 6 || s.reserve === 0);
  button.classList.toggle('needs-reload', !reloading && !button.disabled && s.rounds === 0);
  button.classList.toggle('reload-sweet', sweet);
  const label = `${reloading ? sweet ? 'Lock it in!' : w.reloadAttempted ? 'Reloading…' : '↻ Reloading' : '↻ Reload'} <kbd>R</kbd>`;
  if(button.innerHTML !== label) button.innerHTML = label;
  button.setAttribute('aria-label', reloading ? sweet ? 'Press reload now for a fast reload' : 'Reloading. Press again when the marker reaches gold for a fast reload.' : `Reload rifle. ${s.rounds} rounds loaded, ${s.reserve} in reserve.`);
  $('reload-timing').hidden = !reloading;
  $('reload-timing').classList.toggle('attempted', w.reloadAttempted);
  $('reload-timing').style.setProperty('--window-start', `${(1 - RELOAD_WINDOW_MAX / RELOAD_DURATION) * 100}%`);
  $('reload-timing').style.setProperty('--window-width', `${(RELOAD_WINDOW_MAX - RELOAD_WINDOW_MIN) / RELOAD_DURATION * 100}%`);
  $('reload-cursor').style.left = `${Math.max(0, Math.min(100, (1 - s.reload / RELOAD_DURATION) * 100))}%`;

}
