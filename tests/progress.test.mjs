import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createGame, startShift, advance, restore, ENDINGS } from '../docs/engine.js';
import { InstallHandoff, recoverInstallHandoff, progressSnapshot, encodeProgress, decodeProgress, storeProgress, MAX_PROGRESS_BYTES } from '../docs/progress.js';

const path='/debrief-corn-game/',keys={save:`debrief-save-v1:${path}`,history:`debrief-history-v1:${path}`};
const empty=()=>({collected:[],runs:[]});
function archive(id='first',ending='guide') {
  return {collected:[ending],runs:[{...ENDINGS[ending],id,ending,date:'2026-10-30T12:00:00Z',stamp:'PERSONNEL INCIDENT',reports:[{shift:2,question:'What did you see?',answer:'Three lights. — 灯'}]}]};
}
function storage() {
  const items=new Map();
  return {items,getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
}
function cookieJar(initial='') {
  const cookies=new Map(initial?initial.split('; ').map(part=>{const i=part.indexOf('=');return [part.slice(0,i),part.slice(i+1)];}):[]);
  return {cookies,get cookie(){return [...cookies].map(([key,value])=>`${key}=${value}`).join('; ');},set cookie(value){
    assert.ok(value.includes(`Path=${path};`));
    assert.ok(value.includes('Secure'));
    const pair=value.split(';')[0],i=pair.indexOf('='),key=pair.slice(0,i);
    if(value.includes('Max-Age=0;'))cookies.delete(key);else cookies.set(key,pair.slice(i+1));
  }};
}

test('a progress code round-trips an active shift, Unicode transcripts, and guide outcome stamps',async()=>{
  const game=createGame('hard',37);startShift(game);advance(game,17);
  const snapshot=progressSnapshot(game,archive());
  const restored=await decodeProgress(await encodeProgress(snapshot));
  assert.deepEqual(restored,snapshot);
  assert.equal(restored.history.runs[0].stamp,'PERSONNEL INCIDENT');
  assert.equal(restored.save.targets.length,game.targets.length);
});

test('Safari cookie-only installation restores into an isolated app exactly once',async()=>{
  const browser=cookieJar(),handoff=new InstallHandoff(browser,path,()=>false);
  const game=createGame('story',91);startShift(game);advance(game,14);
  assert.equal(await handoff.update(game,archive()),true);
  assert.ok(browser.cookie.length<6200);
  // Safari copies cookies, but none of the browser localStorage entries.
  const app=cookieJar(browser.cookie),local=storage();
  assert.equal(await recoverInstallHandoff(app,path,local,keys),true);
  assert.deepEqual(restore(local.getItem(keys.save)),game);
  assert.deepEqual(JSON.parse(local.getItem(keys.history)),archive());
  assert.equal(app.cookie,'');
  assert.equal(await recoverInstallHandoff(app,path,local,keys),false);
  assert.notEqual(browser.cookie,'');
});

test('automatic handoff never overwrites an existing app save or records',async()=>{
  const browser=cookieJar();await new InstallHandoff(browser,path,()=>false).update(createGame('story',1),archive());
  for(const key of [keys.save,keys.history]){
    const app=cookieJar(browser.cookie),local=storage();local.setItem(key,'existing local data');
    assert.equal(await recoverInstallHandoff(app,path,local,keys),false);
    assert.equal(local.getItem(key),'existing local data');
    assert.equal(local.items.size,1);
    assert.equal(app.cookie,'');
  }
});

test('records without a current shift transfer and installed apps do not seed stale handoffs',async()=>{
  const browser=cookieJar();
  assert.equal(await new InstallHandoff(browser,path,()=>false).update(null,archive()),true);
  const app=cookieJar(browser.cookie),local=storage();
  assert.equal(await recoverInstallHandoff(app,path,local,keys),true);
  assert.equal(local.getItem(keys.save),null);
  assert.equal(JSON.parse(local.getItem(keys.history)).runs.length,1);
  assert.equal(await new InstallHandoff(app,path,()=>true).update(createGame(),archive()),false);
  assert.equal(app.cookie,'');
});

test('rapid saves leave the latest snapshot and incomplete cookies never restore',async()=>{
  const browser=cookieJar(),handoff=new InstallHandoff(browser,path,()=>false);
  const first=handoff.update(createGame('story',1),empty());
  const last=handoff.update(createGame('hard',2),empty());
  await Promise.all([first,last]);
  const local=storage(),app=cookieJar(browser.cookie);
  assert.equal(await recoverInstallHandoff(app,path,local,keys),true);
  assert.equal(restore(local.getItem(keys.save)).runId,'2');
  browser.cookies.delete('debrief_install_v1_0');
  const untouched=storage();
  assert.equal(await recoverInstallHandoff(browser,path,untouched,keys),false);
  assert.equal(untouched.items.size,0);
});

test('large archives use manual transfer intact and clear stale automatic snapshots',async()=>{
  const browser=cookieJar(),handoff=new InstallHandoff(browser,path,()=>false),records=archive();
  await handoff.update(createGame(),records);
  for(let i=1;i<30;i++)records.runs.push({...records.runs[0],id:`run-${i}`,reports:[{question:'Remember?',answer:randomBytes(600).toString('base64')}]});
  assert.equal(await handoff.update(createGame(),records),false);
  assert.equal(browser.cookie,'');
  assert.deepEqual((await decodeProgress(await encodeProgress(progressSnapshot(null,records)))).history,records);
});

test('blocked cookies and unavailable local storage do not report success or destroy the handoff',async()=>{
  const blocked={get cookie(){return '';},set cookie(_){}};
  assert.equal(await new InstallHandoff(blocked,path,()=>false).update(createGame(),empty()),false);
  const jar=cookieJar();await new InstallHandoff(jar,path,()=>false).update(createGame(),empty());
  const original=jar.cookie,local=storage();local.setItem=()=>{throw Error('Storage blocked');};
  assert.equal(await recoverInstallHandoff(jar,path,local,keys),false);
  assert.equal(jar.cookie,original);
  assert.equal(local.items.size,0);
});

test('manual restore merges endings and records, deduplicates, and preserves a shift for archive-only transfers',()=>{
  const local=storage(),game=createGame('hard',42),current=archive('local','dissent');
  local.setItem(keys.save,JSON.stringify(game));
  const snapshot=progressSnapshot(null,archive());
  let combined=storeProgress(local,keys,snapshot,current);
  combined=storeProgress(local,keys,snapshot,combined);
  assert.deepEqual(combined.collected,['dissent','guide']);
  assert.equal(combined.runs.length,2);
  assert.deepEqual(restore(local.getItem(keys.save)),game);
});

test('failed manual save rolls back the shift and archive',()=>{
  const local=storage(),oldSave=JSON.stringify(createGame('story',1)),oldHistory=JSON.stringify(archive('old'));
  local.setItem(keys.save,oldSave);local.setItem(keys.history,oldHistory);
  const put=local.setItem;let failed=false;
  local.setItem=(key,value)=>{if(key===keys.save&&!failed){failed=true;throw Error('Quota');}put(key,value);};
  assert.throws(()=>storeProgress(local,keys,progressSnapshot(createGame('hard',2),archive('new')),JSON.parse(oldHistory)));
  assert.equal(local.getItem(keys.save),oldSave);
  assert.equal(local.getItem(keys.history),oldHistory);
});

test('invalid, truncated, unsupported, and oversized transfers are rejected before writing',async()=>{
  const valid=await encodeProgress(progressSnapshot(createGame(),empty()));
  for(const code of ['',valid.slice(0,-8),'DB1.not-a-code',`DB0.${btoa('{"format":"another-game","version":1}')}`])await assert.rejects(decodeProgress(code));
  const bad=progressSnapshot(createGame(),empty());bad.save.phase='impossible';
  await assert.rejects(decodeProgress(await encodeProgress(bad)));
  const invalidArchive=progressSnapshot(null,archive());invalidArchive.history.runs[0].reports=[null];
  await assert.rejects(decodeProgress(await encodeProgress(invalidArchive)));
  const inflated=new TextEncoder().encode('x'.repeat(MAX_PROGRESS_BYTES+1));
  const compressed=new Uint8Array(await new Response(new Blob([inflated]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await assert.rejects(decodeProgress('DB1.'+btoa(String.fromCharCode(...compressed))));
});

test('uncompressed fallback codes remain readable when compression is unavailable',async()=>{
  const snapshot=progressSnapshot(createGame(),archive());
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  const code='DB0.'+btoa(String.fromCharCode(...bytes));
  assert.deepEqual(await decodeProgress(code),snapshot);
});
