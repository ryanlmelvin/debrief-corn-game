import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, ENDINGS, getEnding } from '../docs/engine.js';
const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('let history='),source.indexOf('let saved=readSave();'));
function archive(storage=new Map()){
  const elements=new Map();
  const context=vm.createContext({HISTORY_KEY:'archive',ENDINGS,getEnding,game:null,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    $:id=>{if(!elements.has(id))elements.set(id,{textContent:'',addEventListener(){}});return elements.get(id)},toast(){},esc:String,paper(){},showModal(){}});
  vm.runInContext(block,context);return {context,storage,run:code=>vm.runInContext(code,context)};
}
test('completed runs retain distinct transcripts, deduplicate resume, and survive a new session',()=>{
  const a=archive();
  for(const [seed,ending,answer] of [[1,'compliance','Nothing further.'],[2,'dissent','I object.']]){
    const s=createGame('story',seed);Object.assign(s,{phase:'ending',ending,reports:[{shift:0,question:'What happened?',answer}]});
    a.context.game=s;a.run('archiveRun();archiveRun();');
  }
  assert.equal(a.run('history.runs.length'),2);assert.equal(a.run('history.collected.length'),2);
  const resumed=archive(a.storage);
  assert.equal(resumed.run('history.runs[0].reports[0].answer'),'I object.');
  assert.equal(resumed.run('history.runs[1].reports[0].answer'),'Nothing further.');
  assert.equal(resumed.run('history.collected.length'),2);
});
test('archive caps transcripts while preserving all discovered ending badges',()=>{
  const a=archive();for(let i=0;i<35;i++){a.context.game={...createGame('story',i+1),phase:'ending',ending:Object.keys(ENDINGS)[i%6]};a.run('archiveRun()');}
  assert.equal(a.run('history.runs.length'),30);assert.equal(a.run('history.collected.length'),6);
});
test('uncompleted assignments are not recorded and a damaged archive does not block play',()=>{
  const a=archive(new Map([['archive','broken json']]));a.context.game=createGame();a.run('archiveRun()');assert.equal(a.run('history.runs.length'),0);
});
