import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const updateCode = app.slice(app.indexOf("if ('serviceWorker' in navigator"), app.indexOf('\nfunction frame'));
function harness(waiting = true) {
  const events = {}, workerEvents = {}, calls = [];
  const buttons = { 'update-game': { hidden: true }, 'dialog-update': { hidden: true }, 'dialog-content': {} };
  const worker = { postMessage: message => calls.push(message.type) };
  const reg = { waiting: waiting ? worker : null, update: async () => calls.push('check'), addEventListener: (name, fn) => { workerEvents[name] = fn; } };
  const serviceWorker = { controller: {}, register: async () => reg, addEventListener: (name, fn) => { events[name] = fn; } };
  const document = { hidden: false, addEventListener: (name, fn) => { events[name] = fn; }, querySelectorAll: () => Object.values(buttons).slice(0, 2) };
  const context = { navigator: { serviceWorker }, document, location: { protocol: 'https:', reload: () => calls.push('reload') }, $: id => buttons[id], save: () => calls.push('save'), syncAudio() {}, toast() {}, paused: false, setInterval() {}, MutationObserver: class { observe() {} } };
  vm.runInNewContext(updateCode, context);
  return { buttons, calls, events, workerEvents, reg, worker };
}

test('waiting update offers a button, saves before activation, and reloads once', async () => {
  const h = harness();
  await Promise.resolve();
  assert.equal(h.buttons['update-game'].hidden, false);
  assert.equal(h.buttons['dialog-update'].hidden, false);
  h.events.click({ target: { closest: () => true } });
  h.events.click({ target: { closest: () => true } });
  assert.deepEqual(h.calls.slice(-2), ['save', 'SKIP_WAITING']);
  assert.equal(h.buttons['update-game'].disabled, true);
  h.events.controllerchange();
  h.events.controllerchange();
  assert.deepEqual(h.calls.slice(-2), ['save', 'reload']);
  assert.equal(h.calls.filter(c => c === 'reload').length, 1);
});

test('button appears when a new worker finishes installing', async () => {
  const h = harness(false);
  await Promise.resolve();
  assert.equal(h.buttons['update-game'].hidden, true);
  let onState;
  h.reg.installing = { addEventListener: (name, fn) => { onState = fn; } };
  h.workerEvents.updatefound();
  h.reg.waiting = h.worker;
  onState({ target: { state: 'installed' } });
  assert.equal(h.buttons['update-game'].hidden, false);
});

test('service worker activates on the explicit update message', async () => {
  const events = {}, calls = [];
  vm.runInNewContext(readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8'), {
    URL, self: { location: { hostname: 'example.com', href: 'https://example.com/game/sw.js' }, addEventListener: (name, fn) => { events[name] = fn; }, skipWaiting: async () => calls.push('activate') }
  });
  events.message({ data: { type: 'unrelated' } });
  assert.equal(calls.length, 0);
  events.message({ data: { type: 'SKIP_WAITING' }, waitUntil: promise => promise });
  assert.deepEqual(calls, ['activate']);
});
