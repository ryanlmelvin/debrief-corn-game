import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, inspect, ENDINGS, getEnding, endingId } from '../docs/engine.js';
import { MINI_GAMES, createMiniGame, getMiniGameUnlocks, normalizeMiniGameUnlocks } from '../docs/mini-games.js';
import { startRogue, chooseRogue } from '../docs/rogue.js';
const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('let history='),source.indexOf('let saved=readSave();'));
function archive(storage=new Map(),saved=null){
  const elements=new Map();
  const context=vm.createContext({HISTORY_KEY:'archive',ENDINGS,getEnding,endingId,MINI_GAMES,getMiniGameUnlocks,normalizeMiniGameUnlocks,game:null,dungeonPreview:false,readSave:()=>saved,installHandoff:{update(){}},
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

test('real practice endings never earn collection badges or transcripts, then an ordinary run earns normally',()=>{
  const a=archive(),practice=createMiniGame('dungeon','story',101);
  if(practice.rogue.stage==='intro')assert.equal(chooseRogue(practice,'begin'),true);
  for(let turn=0;practice.phase==='rogue'&&turn<100;turn++)assert.equal(chooseRogue(practice,'wait'),true);
  assert.equal(practice.phase,'ending');
  assert.equal(endingId(practice),'dungeon_lost');
  a.context.game=practice;a.run('archiveRun();archiveRun();archiveRun();');
  assert.equal(a.run('history.runs.length'),0);
  assert.equal(a.run('history.collected.length'),0);
  assert.equal(a.storage.size,0,'practice must not write the story archive');

  const ordinary=createGame('story',102);
  Object.assign(ordinary,{phase:'field',entered:true,departure:'chosen',player:{x:7,y:5}});
  assert.ok(inspect(ordinary));
  assert.equal(startRogue(ordinary,'dungeon'),true);
  assert.equal(chooseRogue(ordinary,'begin'),true);
  for(let turn=0;ordinary.phase==='rogue'&&turn<100;turn++)assert.equal(chooseRogue(ordinary,'wait'),true);
  assert.equal(endingId(ordinary),'dungeon_lost');
  a.context.game=ordinary;a.run('archiveRun();archiveRun();');
  assert.equal(a.run('history.runs.length'),1);
  assert.equal(a.run('history.collected.length'),1);
  assert.equal(a.run('history.runs[0].id'),ordinary.runId);
  assert.equal(a.run('history.collected[0]'),'dungeon_lost');
  const stored=a.storage.get('archive');
  a.context.game=practice;a.run('archiveRun();archiveRun();');
  assert.equal(a.storage.get('archive'),stored,'later practice cannot replace an earned transcript');
  const resumed=archive(a.storage);
  assert.equal(resumed.run('history.runs.length'),1);
  assert.equal(resumed.run('history.runs[0].id'),ordinary.runId);
});

test('mini-game access survives archive writes independently of collected endings',()=>{
  const stored={collected:[],runs:[],miniGames:['dungeon']};
  const a=archive(new Map([['archive',JSON.stringify(stored)]]));
  assert.deepEqual([...a.run('history.miniGames')],['dungeon']);
  const ordinary=createGame('story',103);Object.assign(ordinary,{phase:'ending',ending:'compliance'});
  a.context.game=ordinary;a.run('archiveRun()');
  assert.ok(JSON.parse(a.storage.get('archive')).miniGames.includes('dungeon'));
  assert.deepEqual([...a.run('history.collected')],['compliance']);
  const resumed=archive(a.storage);
  assert.ok(resumed.run('history.miniGames.includes("dungeon")'));
});

test('startup recovers reached mini games from the active story without requiring an ending',()=>{
  const ordinary=createGame('story',104);
  Object.assign(ordinary,{phase:'field',entered:true,departure:'chosen',player:{x:7,y:5}});
  assert.ok(inspect(ordinary));assert.equal(startRogue(ordinary,'dungeon'),true);
  const introductory=archive(new Map(),ordinary);
  assert.equal(introductory.run('history.miniGames.includes("dungeon")'),false);
  assert.equal(chooseRogue(ordinary,'begin'),true);
  const started=archive(new Map(),ordinary);
  assert.equal(started.run('history.miniGames.includes("dungeon")'),true);
  assert.deepEqual([...started.run('history.collected')],[]);
  assert.ok(JSON.parse(started.storage.get('archive')).miniGames.includes('dungeon'));
});

test('legacy loss transcripts recover the mini game but collection badges alone do not',()=>{
  const ordinary=createGame('story',105);
  Object.assign(ordinary,{phase:'field',entered:true,departure:'chosen',player:{x:7,y:5}});
  inspect(ordinary);startRogue(ordinary,'dungeon');chooseRogue(ordinary,'begin');
  for(let turn=0;ordinary.phase==='rogue'&&turn<100;turn++)chooseRogue(ordinary,'wait');
  assert.equal(ordinary.ending,'dungeon_lost');
  const a=archive();a.context.game=ordinary;a.run('archiveRun()');
  const legacy=JSON.parse(a.storage.get('archive'));delete legacy.miniGames;
  const resumed=archive(new Map([['archive',JSON.stringify(legacy)]]));
  assert.equal(resumed.run('history.miniGames.includes("dungeon")'),true);
  assert.ok(JSON.parse(resumed.storage.get('archive')).miniGames.includes('dungeon'));

  const badgesOnly=archive(new Map([['archive',JSON.stringify({collected:['dungeon_escape'],runs:[]})]]));
  assert.equal(badgesOnly.run('history.miniGames.includes("dungeon")'),false,'ending collection is not proof that this browser reached the mini game');
});

test('stored unlock IDs are sanitized and practice saves cannot backfill access',()=>{
  const a=archive(new Map([['archive',JSON.stringify({collected:[],runs:[],miniGames:['flood','unknown','flood','__proto__',42]})]]));
  assert.deepEqual([...a.run('history.miniGames')],['flood']);
  const practice=archive(new Map(),createMiniGame('dungeon','story',106));
  assert.deepEqual([...practice.run('history.miniGames')],[]);
  assert.equal(practice.storage.size,0);
});
