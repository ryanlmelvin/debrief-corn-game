import { encodeProgress } from './progress.js';

export async function prepareBackup(snapshot, date = new Date()) {
  const code = await encodeProgress(snapshot);
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return new File([code], `debrief-progress-${stamp}.txt`, { type: 'text/plain' });
}

export function backupMethod(file, environment = globalThis) {
  if (typeof environment.showSaveFilePicker === 'function') return 'picker';
  try {
    if (typeof environment.navigator?.share === 'function' && environment.navigator.canShare?.({ files: [file] })) return 'share';
  } catch {}
  return 'download';
}

export function downloadBackup(file, environment = globalThis) {
  const url = environment.URL.createObjectURL(file);
  const link = environment.document.createElement('a');
  link.href = url;
  link.download = file.name;
  environment.document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    environment.setTimeout(() => environment.URL.revokeObjectURL(url), 60000);
  }
}

// Prepare the file before the click: pickers and iOS sharing must start during
// the user gesture, without waiting for compression or another asynchronous job.
export async function saveBackup(file, environment = globalThis) {
  const method = backupMethod(file, environment);
  if (method === 'download') {
    downloadBackup(file, environment);
    return 'downloaded';
  }
  if (method === 'share') {
    try {
      await environment.navigator.share({ files: [file] });
      // The OS may resolve as soon as its share UI opens. Never call this saved.
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'canceled';
      throw error;
    }
  }
  let handle;
  try {
    handle = await environment.showSaveFilePicker({
      id: 'debrief-backup', suggestedName: file.name,
      types: [{ description: 'Debrief progress backup', accept: { 'text/plain': ['.txt'] } }]
    });
  } catch (error) {
    if (error.name === 'AbortError') return 'canceled';
    throw error;
  }
  const stream = await handle.createWritable();
  try {
    await stream.write(file);
    await stream.close();
  } catch (error) {
    try { await stream.abort(); } catch {}
    throw error;
  }
  return 'saved';
}
