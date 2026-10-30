import { restore, serialize, ENDINGS } from './engine.js';

export const MAX_PROGRESS_BYTES = 512 * 1024;
const COOKIE = 'debrief_install_v1';
// Keep the entire handoff below typical request-header limits, including cookies
// for other projects on the same host. Never silently drop archived assignments.
const COOKIE_LIMIT = 6000;
const CHUNK_SIZE = 3000;

export function validateHistory(value) {
  if (!value || !Array.isArray(value.collected) || !Array.isArray(value.runs) || value.runs.length > 30) throw Error('Invalid ending collection.');
  if (!value.collected.every(id => Object.hasOwn(ENDINGS, id))) throw Error('Unknown ending.');
  for (const run of value.runs) {
    if (!run || !Object.hasOwn(ENDINGS, run.ending) || !['id', 'title', 'text', 'last', 'date'].every(key => typeof run[key] === 'string') || !Number.isFinite(Date.parse(run.date))) throw Error('Invalid completed game.');
    if (run.stamp !== undefined && typeof run.stamp !== 'string') throw Error('Invalid outcome.');
    if (!Array.isArray(run.reports) || run.reports.length > 200 || !run.reports.every(report => report && typeof report.question === 'string' && typeof report.answer === 'string')) throw Error('Invalid transcript.');
  }
  return { collected: [...new Set(value.collected)], runs: value.runs };
}

export function progressSnapshot(save, history) {
  const snapshot = { format: 'debrief-progress', version: 1, save: save ? restore(serialize(save)) : null, history: validateHistory(history) };
  if (save && !snapshot.save) throw Error('The saved game could not be read.');
  if (!snapshot.save && !snapshot.history.collected.length && !snapshot.history.runs.length) throw Error('No progress to transfer yet.');
  return snapshot;
}

async function readLimited(stream) {
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PROGRESS_BYTES) throw Error('Progress is too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function encodeProgress(snapshot) {
  let bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.length > MAX_PROGRESS_BYTES) throw Error('Progress is too large.');
  let prefix = 'DB0.';
  if (typeof CompressionStream !== 'undefined') {
    bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
    prefix = 'DB1.';
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return prefix + btoa(binary);
}

export async function decodeProgress(code) {
  if (typeof code !== 'string' || code.length > MAX_PROGRESS_BYTES * 2) throw Error('Invalid progress code.');
  code = code.trim();
  if (!/^DB[01]\.[A-Za-z0-9+/]+={0,2}$/.test(code)) throw Error('Invalid progress code.');
  let bytes = Uint8Array.from(atob(code.slice(4)), char => char.charCodeAt(0));
  if (code.startsWith('DB1.')) bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  if (bytes.length > MAX_PROGRESS_BYTES) throw Error('Progress is too large.');
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (value?.format !== 'debrief-progress' || value.version !== 1 || !Object.hasOwn(value, 'save')) throw Error('Unknown progress format.');
  return progressSnapshot(value.save, value.history);
}

export function mergeHistory(current, incoming) {
  const runs = new Map();
  // Keep local transcripts on duplicate IDs; transfer never erases earned endings.
  for (const run of [...current.runs, ...incoming.runs]) if (!runs.has(run.id)) runs.set(run.id, run);
  return {
    collected: [...new Set([...current.collected, ...incoming.collected])],
    runs: [...runs.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 30)
  };
}

export function storeProgress(storage, keys, snapshot, currentHistory) {
  const history = mergeHistory(currentHistory, snapshot.history);
  const before = [storage.getItem(keys.save), storage.getItem(keys.history)];
  try {
    storage.setItem(keys.history, JSON.stringify(history));
    if (snapshot.save) storage.setItem(keys.save, serialize(snapshot.save));
  } catch (error) {
    for (const [index, key] of [keys.save, keys.history].entries()) {
      try { before[index] === null ? storage.removeItem(key) : storage.setItem(key, before[index]); } catch {}
    }
    throw error;
  }
  return history;
}

function cookieOptions(path, age) { return `; Path=${path}; Max-Age=${age}; SameSite=Strict; Secure`; }
export function clearInstallHandoff(document, path) {
  for (const name of [COOKIE, `${COOKIE}_0`, `${COOKIE}_1`]) document.cookie = `${name}=${cookieOptions(path, 0)}`;
}
function readInstallCode(document) {
  const cookies = new Map(document.cookie.split(';').map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), part.slice(index + 1)];
  }));
  const meta = cookies.get(COOKIE);
  if (!/^[12]\.\d{1,4}$/.test(meta || '')) return null;
  const [count, length] = meta.split('.').map(Number);
  const code = Array.from({ length: count }, (_, index) => cookies.get(`${COOKIE}_${index}`) || '').join('');
  return code.length === length && length <= COOKIE_LIMIT ? code : null;
}

export class InstallHandoff {
  constructor(document, path, installed) { Object.assign(this, { document, path, installed, sequence: 0, last: '', pending: Promise.resolve(false) }); }
  update(save, history) {
    if (this.installed()) return Promise.resolve(false);
    let snapshot, raw;
    try { snapshot = progressSnapshot(save, history); raw = JSON.stringify(snapshot); } catch { raw = ''; }
    if (raw && raw === this.last) return this.pending;
    this.last = raw;
    const sequence = ++this.sequence;
    // A failed or oversized replacement must never leave an older snapshot ready.
    try { clearInstallHandoff(this.document, this.path); } catch { return Promise.resolve(false); }
    this.pending = (async () => {
      try {
        if (!snapshot) return false;
        const code = await encodeProgress(snapshot);
        if (sequence !== this.sequence || code.length > COOKIE_LIMIT) return false;
        const parts = Array.from({ length: Math.ceil(code.length / CHUNK_SIZE) }, (_, index) => code.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
        for (let index = 0; index < parts.length; index++) this.document.cookie = `${COOKIE}_${index}=${parts[index]}${cookieOptions(this.path, 604800)}`;
        this.document.cookie = `${COOKIE}=${parts.length}.${code.length}${cookieOptions(this.path, 604800)}`;
        if (readInstallCode(this.document) === code) return true;
        clearInstallHandoff(this.document, this.path);
      } catch { if (sequence === this.sequence) { try { clearInstallHandoff(this.document, this.path); } catch {} } }
      this.last = '';
      return false;
    })();
    return this.pending;
  }
}

export async function recoverInstallHandoff(document, path, storage, keys) {
  // The caller only invokes this in installed mode, before loading game state.
  // Any existing local data takes precedence, even if the copied cookie is newer.
  if (storage.getItem(keys.save) !== null || storage.getItem(keys.history) !== null) {
    clearInstallHandoff(document, path);
    return false;
  }
  const code = readInstallCode(document);
  if (!code) return false;
  try {
    const snapshot = await decodeProgress(code);
    storeProgress(storage, keys, snapshot, { collected: [], runs: [] });
    clearInstallHandoff(document, path);
    return true;
  } catch { return false; }
}
