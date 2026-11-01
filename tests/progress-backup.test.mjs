import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../docs/engine.js';
import { decodeProgress, progressSnapshot } from '../docs/progress.js';
import { prepareBackup, backupMethod, saveBackup, downloadBackup } from '../docs/progress-backup.js';

const snapshot=()=>progressSnapshot(createGame('story',42),{collected:['dissent'],runs:[],miniGames:['watch']});
const abort=()=>Object.assign(new Error('Canceled'),{name:'AbortError'});
function downloadEnvironment(){
  const calls=[];
  const link={click(){calls.push(['click',this.download,this.href]);},remove(){calls.push(['remove']);}};
  return {calls,navigator:{},document:{body:{append(node){assert.equal(node,link);calls.push(['append']);}},createElement(tag){assert.equal(tag,'a');return link;}},URL:{createObjectURL(file){calls.push(['blob',file]);return 'blob:backup';},revokeObjectURL(url){calls.push(['revoke',url]);}},setTimeout(fn,ms){calls.push(['cleanup',ms]);this.cleanup=fn;}};
}

test('dated backups round trip the same portable progress without mutating the source',async()=>{
  const source=snapshot(),before=structuredClone(source);
  const file=await prepareBackup(source,new Date('2026-11-01T15:04:05.123Z'));
  assert.equal(file.name,'debrief-progress-2026-11-01T15-04-05-123Z.txt');
  assert.equal(file.type,'text/plain');
  assert.deepEqual(await decodeProgress(await file.text()),before);
  assert.deepEqual(source,before);
});

test('file sharing begins synchronously in the click gesture and is not reported as a saved file',async()=>{
  const file=await prepareBackup(snapshot());let shared;
  const environment={navigator:{canShare:({files})=>files[0]===file,share:options=>{shared=options;return Promise.resolve();}}};
  assert.equal(backupMethod(file,environment),'share');
  const pending=saveBackup(file,environment);
  assert.deepEqual(shared,{files:[file]});
  assert.equal(await pending,'shared');
});

test('unsupported file sharing downloads a complete backup and cleans up its temporary URL',async()=>{
  const file=await prepareBackup(snapshot());
  for(const navigator of [{},{share(){throw Error('No support');}},{share(){throw Error('Must not share');},canShare:()=>false},{share(){throw Error('Must not share');},canShare(){throw Error('Blocked');}}]){
    const environment=downloadEnvironment();environment.navigator=navigator;
    assert.equal(backupMethod(file,environment),'download');
    assert.equal(await saveBackup(file,environment),'downloaded');
    assert.deepEqual(environment.calls.map(c=>c[0]),['blob','append','click','remove','cleanup']);
    assert.deepEqual(environment.calls[2],['click',file.name,'blob:backup']);
    assert.equal(environment.calls[4][1],60000);
    environment.cleanup();
    assert.deepEqual(environment.calls.at(-1),['revoke','blob:backup']);
  }
});

test('canceling or rejecting sharing never triggers a download or claims success',async()=>{
  const file=await prepareBackup(snapshot());
  for(const error of [abort(),new Error('Sharing blocked')]){
    const environment=downloadEnvironment();
    environment.navigator={canShare:()=>true,share:()=>Promise.reject(error)};
    if(error.name==='AbortError')assert.equal(await saveBackup(file,environment),'canceled');
    else await assert.rejects(saveBackup(file,environment),/Sharing blocked/);
    assert.deepEqual(environment.calls,[]);
    // An explicit fresh Download click still works if the share sheet failed.
    downloadBackup(file,environment);
    assert.equal(environment.calls[2][0],'click');
  }
});

test('native saving starts in the gesture and reports success only after writing and closing',async()=>{
  const file=await prepareBackup(snapshot()),calls=[];let finish;
  const environment={navigator:{share(){assert.fail('Picker takes priority');},canShare:()=>true},showSaveFilePicker(options){
    calls.push(['picker',options]);
    return Promise.resolve({createWritable:async()=>({write:async value=>{calls.push(['write',value]);},close:()=>new Promise(resolve=>{finish=resolve;})})});
  }};
  let complete=false;
  const pending=saveBackup(file,environment).then(result=>{complete=true;return result;});
  assert.equal(calls[0][0],'picker');
  assert.equal(calls[0][1].suggestedName,file.name);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[1][1],file);
  assert.equal(complete,false);
  finish();
  assert.equal(await pending,'saved');
});

test('native cancellation stops saving and failed writes abort without falling through to sharing',async()=>{
  const file=await prepareBackup(snapshot());
  assert.equal(await saveBackup(file,{showSaveFilePicker:()=>Promise.reject(abort())}),'canceled');
  for(const stage of ['open','write','close']){
    let aborted=false;
    const stream={async write(){if(stage==='write')throw Error('Disk full');},async close(){if(stage==='close')throw Error('Disk full');},async abort(){aborted=true;}};
    const environment={showSaveFilePicker:async()=>({async createWritable(){if(stage==='open')throw Error('Permission denied');return stream;}})};
    await assert.rejects(saveBackup(file,environment),/Disk full|Permission denied/);
    assert.equal(aborted,stage!=='open');
  }
});
