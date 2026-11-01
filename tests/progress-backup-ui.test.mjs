import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createGame, restore, serialize } from '../docs/engine.js';
import { progressSnapshot, encodeProgress, decodeProgress, storeProgress, MAX_PROGRESS_BYTES } from '../docs/progress.js';
import { prepareBackup } from '../docs/progress-backup.js';

const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function showProgressTransfer('),app.indexOf("$('move-progress').addEventListener"));
const settle=async h=>{await Promise.all(h.pending);await Promise.resolve();};
function harness({empty=false,method='share',saveResult='shared'}={}){
  const original=empty?null:createGame('story',10);
  const values=new Map(original?[['save',serialize(original)]]:[]),writes=[];
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);writes.push(key);},removeItem:key=>values.delete(key)};
  let elements={},markup='';
  const pending=[],track=fn=>(...args)=>{const work=fn(...args);pending.push(work);return work;};
  const context={game:null,history:{collected:[],runs:[],miniGames:[]},save(){},archiveRun(){},progressSnapshot,encodeProgress:track(encodeProgress),decodeProgress,storeProgress,MAX_PROGRESS_BYTES,prepareBackup:track(prepareBackup),
    backupMethod:()=>method,async saveBackup(file){context.exported=file;if(saveResult instanceof Error)throw saveResult;return saveResult;},downloadBackup(file){context.downloaded=file;},
    $:id=>elements[id]??null,paper:(title,html)=>({title,html}),
    showModal(kind,{title,html}){
      for(const element of Object.values(elements))element.isConnected=false;
      elements={};markup=html;context.title=title;context.modalKind=kind;
      for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))elements[match[1]]={isConnected:true,disabled:match[0].includes(' disabled'),hidden:match[0].includes(' hidden'),value:'',files:[],textContent:'',addEventListener(name,fn){this[name]=fn;},focus(){},select(){}};
    },navigator:{clipboard:{async writeText(code){context.copied=code;}}},pager:{refresh(){},go(){},pages:[]},esc:String,
    localStorage:storage,progressKeys:{save:'save',history:'history'},readSave:()=>restore(storage.getItem('save')),MINI_GAME_KEY:'practice',storyBeforePractice:null,practiceReturnToGame:false,practiceReturnPaused:false,
    updateHistoryCount(){},saved:original,begin(){context.game=context.readSave();},closeModal(){},installHandoff:{update(){}},toast(message){context.notice=message;}
  };
  // The persistent resume control exists outside of modal content.
  const resume={};context.$=id=>id==='resume'?resume:elements[id]??null;
  vm.runInNewContext(source,context);
  context.showProgressTransfer();
  return {context,values,writes,pending,get elements(){return elements;},get markup(){return markup;}};
}

test('a fresh device can restore while export stays disabled and codes are a separate screen',async()=>{
  const h=harness({empty:true});await settle(h);
  assert.equal(h.elements['download-progress'].disabled,true);
  assert.equal(h.elements['open-progress'].disabled,false);
  assert.equal(h.elements['progress-code'],undefined);
  assert.match(h.elements['progress-export-status'].textContent,/No saved progress/);
  h.elements['progress-code-options'].click();
  assert.ok(h.elements['progress-code']);
  assert.equal(h.elements['copy-progress'].disabled,true);
  h.elements['progress-files'].click();
  assert.ok(h.elements['open-progress']);
  assert.deepEqual(h.writes,[]);
});

test('native backup result wording does not mistake sharing or downloading for confirmed saving',async()=>{
  for(const [result,expected] of [['shared',/Finish saving/],['saved',/Backup saved/],['downloaded',/Download requested/],['canceled',/Backup canceled/],[new Error('Blocked'),/could not be saved/]]){
    const h=harness({saveResult:result});await settle(h);
    assert.equal(h.elements['download-progress'].disabled,false);
    await h.elements['download-progress'].click();
    assert.match(h.elements['progress-export-status'].textContent,expected);
    assert.equal(h.elements['download-progress'].disabled,false);
    assert.deepEqual((await decodeProgress(await h.context.exported.text())).save,h.context.readSave());
    h.elements['download-progress-copy'].click();
    assert.equal(h.context.downloaded,h.context.exported);
    assert.deepEqual(h.writes,[]);
  }
});

test('copy/paste transfer still works and restoring requires confirmation before replacing a game',async()=>{
  const h=harness();await settle(h);h.elements['progress-code-options'].click();await settle(h);
  await h.elements['copy-progress'].click();
  assert.deepEqual((await decodeProgress(h.context.copied)).save,h.context.readSave());
  const incoming=progressSnapshot(createGame('hard',99),{collected:['dissent'],runs:[],miniGames:[]});
  h.elements['progress-code'].value=await encodeProgress(incoming);
  await h.elements['restore-progress'].click();
  assert.equal(h.context.modalKind,'progress-confirm');
  assert.match(h.markup,/replaces the current saved game/);
  assert.deepEqual(h.writes,[]);
  h.elements['confirm-progress'].click();
  assert.deepEqual(h.context.readSave(),incoming.save);
  assert.ok(h.context.history.collected.includes('dissent'));
  assert.match(h.context.notice,/Progress restored/);
});

test('file restore rejects bad and oversized backups, and cancellation leaves local progress intact',async()=>{
  const h=harness();await settle(h);const before=new Map(h.values);
  h.elements['progress-file'].files=[{size:MAX_PROGRESS_BYTES*2+1,text(){assert.fail('Oversized file must not be read');}}];
  await h.elements['progress-file'].change();
  assert.match(h.elements['progress-import-status'].textContent,/too large/);
  h.elements['progress-file'].files=[new File(['not progress'],'bad.txt')];
  await h.elements['progress-file'].change();
  assert.match(h.elements['progress-import-status'].textContent,/could not be read/);
  const incoming=progressSnapshot(createGame('hard',99),{collected:[],runs:[],miniGames:[]});
  h.elements['progress-file'].files=[await prepareBackup(incoming)];
  await h.elements['progress-file'].change();
  assert.equal(h.context.modalKind,'progress-confirm');
  h.elements['cancel-progress'].click();
  assert.equal(h.context.modalKind,'progress');
  assert.deepEqual(h.values,before);
  assert.deepEqual(h.writes,[]);
});
