import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, ENDINGS, getEnding, endingId } from '../docs/engine.js';
const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('let history='),source.indexOf('let saved=readSave();'));
function archive(storage=new Map()){
  const elements=new Map();
  const context=vm.createContext({HISTORY_KEY:'archive',ENDINGS,getEnding,endingId,game:null,installHandoff:{update(){}},
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

test('guide outcome stamps survive archiving so all-three and partial shootings share differently',()=>{
  const a=archive();
  for(const shots of [0,1,2,3]){
    const game=createGame('story',shots+1);
    Object.assign(game,{phase:'ending',ending:'guide',guide:{team:Array.from({length:3},(_,i)=>({status:i<shots?'shot':'escaped'}))}});
    a.context.game=game;a.run('archiveRun();archiveRun();');
  }
  const resumed=archive(a.storage);
  assert.equal(resumed.run('history.runs.length'),4);
  assert.equal(resumed.run('history.collected.length'),3);
  assert.equal(resumed.run('history.runs[0].ending'),'guide_shot');
  assert.equal(resumed.run('history.runs[1].ending'),'guide_arrested');
  assert.equal(resumed.run('history.runs[3].ending'),'guide');
  assert.equal(resumed.run('history.runs[0].stamp'),'PERIMETER SECURED');
  assert.equal(resumed.run('history.runs[1].stamp'),'PERSONNEL INCIDENT');
  assert.equal(resumed.run('history.runs[2].stamp'),'PERSONNEL INCIDENT');
  assert.equal(resumed.run('history.runs[3].stamp'),'RECOVERY INCOMPLETE');
});

test('resuming an older archived ending fills in its outcome without duplicating the run',()=>{
  const a=archive();
  const game=createGame('story',17);
  Object.assign(game,{phase:'ending',ending:'guide',guide:{team:Array.from({length:3},()=>({status:'shot'}))}});
  a.context.game=game;a.run('archiveRun();delete history.runs[0].stamp;archiveRun();');
  const resumed=archive(a.storage);
  assert.equal(resumed.run('history.runs.length'),1);
  assert.equal(resumed.run('history.runs[0].stamp'),'PERIMETER SECURED');
  assert.equal(resumed.run('history.collected.length'),1);
});

test('an interrupted interview remains a distinct ending alongside the recovery result',()=>{
  const a=archive();
  const ordinary=createGame('story',41);
  Object.assign(ordinary,{phase:'ending',ending:'guide_shot',reports:[{shift:2,kind:'recovery',question:'Confirm the report?',answer:'No.'}]});
  a.context.game=ordinary;a.run('archiveRun();');
  const interrupted=createGame('story',42);
  Object.assign(interrupted,{phase:'ending',ending:'guide_interrupted',reports:[{shift:2,kind:'recovery',question:'Tell me what happened.',answer:'Grab the rifle and try to shoot the interviewer.'}]});
  a.context.game=interrupted;a.run('archiveRun();archiveRun();');
  const resumed=archive(a.storage);
  assert.equal(resumed.run('history.runs.length'),2);
  assert.equal(resumed.run('history.collected.length'),2);
  assert.equal(resumed.run('history.runs[0].ending'),'guide_interrupted');
  assert.equal(resumed.run('history.runs[0].stamp'),'RECORDING INTERRUPTED');
  assert.equal(resumed.run('history.runs[0].reports[0].answer'),'Grab the rifle and try to shoot the interviewer.');
  assert.equal(resumed.run('history.runs[1].ending'),'guide_shot');
});
