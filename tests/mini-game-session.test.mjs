import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, restore, serialize, startShift, enterField, inspect } from '../docs/engine.js';
import { MINI_GAMES, createMiniGame, miniGameComplete, getMiniGameUnlocks, normalizeMiniGameUnlocks } from '../docs/mini-games.js';
import { startRogue, chooseRogue } from '../docs/rogue.js';

const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const saveCode=source.slice(source.indexOf('function save()'),source.indexOf('function toast('));
const unlockCode=source.slice(source.indexOf('function recordMiniGameUnlocks('),source.indexOf('\nif(!dungeonPreview)for('));
const sessionCode=source.slice(source.indexOf('function readMiniGame()'),source.indexOf('function begin('));
function harness(storage=new Map(), unlocked=MINI_GAMES.map(entry=>entry.id)) {
  const elements=new Map(), updates=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'story',hidden:false,textContent:'',focus(){},setAttribute(){}});
    return elements.get(id);
  };
  const history=JSON.parse(storage.get('history')||JSON.stringify({collected:[],runs:[],miniGames:unlocked}));
  const context=vm.createContext({storage,updates,restore,serialize,createMiniGame,MINI_GAMES,miniGameComplete,getMiniGameUnlocks,normalizeMiniGameUnlocks,game:null,saved:null,paused:false,dungeonPreview:false,miniGameUnlocksDirty:false,
    storyBeforePractice:null,practiceReturnToGame:false,practiceReturnPaused:false,SAVE_KEY:'story',MINI_GAME_KEY:'practice',HISTORY_KEY:'history',
    lastModalKey:'',lastControlsKey:'',storageWarned:false,$:element,canvas:element('canvas'),
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    installHandoff:{update:(...args)=>updates.push(args)},history,toast(){},esc:String,paper:(title,body)=>`<article>${title}${body}</article>`,
    showModal(kind,html){context.modal={kind,html};},
    document:{body:{classList:{remove(){}},dataset:{}}},dialog:{open:false},menuOpen:()=>false,
    fieldMap:{reset(){}},rogueUI:{render(){}},syncAudio(){},updateUI(){},
    readSave:()=>restore(storage.get('story')),
    begin(mode,fromSave,supplied){context.game=supplied;context.paused=false;vm.runInContext('save()',context);}
  });
  vm.runInContext(unlockCode+saveCode+sessionCode,context);
  return {context,storage,updates,run:code=>vm.runInContext(code,context)};
}

test('launch, switch, finish and retry practice never overwrite the suspended story or its handoff',()=>{
  const h=harness(), story=createGame('hard',731);startShift(story);
  story.time=7;story.rounds=2;story.reserve=17;
  h.context.game=story;h.context.paused=true;h.run('launchMiniGame("flood")');
  const original=serialize(story), calls=h.updates.length;
  assert.equal(h.storage.get('story'),original);
  assert.equal(h.context.saved,story);
  assert.equal(h.context.practiceReturnPaused,true);
  for(let i=0;i<3;i++)chooseRogue(h.context.game,'release');
  h.run('save();launchMiniGame("dungeon");save()');
  assert.equal(h.storage.get('story'),original);
  assert.equal(h.context.saved,story);
  assert.equal(h.updates.length,calls,'practice never changes the story installation snapshot');
  assert.equal(h.run('readMiniGame().game.practice'),'dungeon');
  h.run('returnToStory()');
  assert.equal(h.context.game,story);
  assert.equal(serialize(h.context.game),original);
  assert.equal(h.context.paused,true);
  assert.equal(h.storage.has('practice'),false);
});

test('reload resumes practice separately and returning restores the exact saved assignment',()=>{
  const h=harness(), story=createGame('story',732);startShift(story);
  h.context.game=story;h.run('launchMiniGame("flood")');
  chooseRogue(h.context.game,'tile-0');h.run('save()');
  const original=h.storage.get('story'), preview=serialize(h.context.game);
  const reloaded=harness(h.storage), resumed=reloaded.run('readMiniGame()');
  assert.equal(serialize(resumed.game),preview);
  reloaded.context.game=resumed.game;reloaded.context.practiceReturnToGame=resumed.returnToGame;
  reloaded.context.practiceReturnPaused=resumed.returnPaused;
  reloaded.run('returnToStory()');
  assert.equal(serialize(reloaded.context.game),original);
  assert.equal(reloaded.storage.get('story'),original);
});

test('practice from the title screen preserves an existing save and returns to the title screen',()=>{
  const story=createGame('story',733), h=harness(new Map([['story',serialize(story)]]));
  h.run('launchMiniGame("broadcast");save();returnToStory()');
  assert.equal(h.context.game,null);
  assert.equal(h.storage.get('story'),serialize(story));
  assert.equal(h.storage.has('practice'),false);
  assert.equal(h.updates.length,0);
});

test('a story object or damaged provenance in the practice slot cannot resume as practice',()=>{
  const h=harness();
  for(const game of [createGame('story',734),{...createMiniGame('dungeon'),practice:'watch'}]){
    h.storage.set('practice',JSON.stringify({game:serialize(game),returnToGame:true}));
    assert.equal(h.run('readMiniGame()'),null);
  }
});

test('completed practice cannot continue gameplay even if a dialog has been dismissed',()=>{
  const game=createMiniGame('watch','story',735);game.incident=true;enterField(game);
  assert.equal(miniGameComplete(game),true);
  const before=serialize(game), context=vm.createContext({game,miniGameComplete});
  const actionCode=source.slice(source.indexOf('function act('),source.indexOf("document.addEventListener('click',event=>{const button"));
  vm.runInContext(actionCode,context);
  for(const [action,value] of [['move','1,0'],['field-go',''],['rogue-start','corn'],['rogue-choice','begin'],['rogue-move','1,0'],['dungeon-enter','']]){
    context.action=action;context.value=value;
    vm.runInContext('act(action,value)',context);
    assert.equal(serialize(game),before,action);
  }
});

test('locked mini games refuse launch without touching the story or practice save',()=>{
  const h=harness(new Map(),[]), story=createGame('story',736);
  h.context.game=story;h.run('save()');
  const before=[...h.storage], original=serialize(story);
  for(const entry of MINI_GAMES){
    h.context.requested=entry.id;h.run('launchMiniGame(requested)');
    assert.equal(h.context.game,story);
    assert.equal(serialize(story),original);
    assert.deepEqual([...h.storage],before,entry.id);
  }
  assert.equal(h.storage.has('practice'),false);
  assert.deepEqual(h.context.history.miniGames,[]);
});

test('story starts accumulate independent unlocks before an ending and retain them after losing',()=>{
  const h=harness(new Map(),[]), story=createGame('story',737);
  h.context.game=story;h.run('save()');
  assert.deepEqual(h.context.history.miniGames,[],'reading the briefing is not starting a watch');
  startShift(story);h.run('save()');
  assert.deepEqual([...h.context.history.miniGames],['watch']);
  story.incident=true;assert.equal(enterField(story),true);
  story.player={x:7,y:5};assert.ok(inspect(story));
  assert.equal(startRogue(story,'dungeon'),true);h.run('save()');
  assert.deepEqual([...h.context.history.miniGames],['watch'],'opening the introduction alone grants no practice access');
  assert.equal(chooseRogue(story,'begin'),true);h.run('save()');
  assert.deepEqual([...h.context.history.miniGames],['watch','dungeon']);
  assert.deepEqual(h.context.history.collected,[],'a playable route unlocks independently of earning its ending');
  assert.deepEqual(JSON.parse(h.storage.get('history')).miniGames,['watch','dungeon']);
  for(let turn=0;story.phase==='rogue'&&turn<100;turn++)chooseRogue(story,'wait');
  assert.equal(story.ending,'dungeon_lost');h.run('save()');
  assert.deepEqual(JSON.parse(h.storage.get('history')).miniGames,['watch','dungeon']);
  const persisted=h.storage.get('history');h.run('save()');
  assert.equal(h.storage.get('history'),persisted,'repeated saves do not duplicate unlocks');

  const next=createGame('story',738);h.context.game=next;startShift(next);
  next.incident=true;enterField(next);
  assert.equal(startRogue(next,'broadcast'),true);assert.equal(chooseRogue(next,'begin'),true);h.run('save()');
  assert.deepEqual(new Set(h.context.history.miniGames),new Set(['watch','broadcast','dungeon']));
  const resumed=harness(h.storage);
  assert.deepEqual(new Set(resumed.context.history.miniGames),new Set(['watch','broadcast','dungeon']));
  resumed.run('launchMiniGame("dungeon")');
  assert.equal(resumed.context.game.practice,'dungeon');
});

test('practice and the localhost preview never grant story unlocks',()=>{
  const h=harness(new Map(),[]);
  h.context.game=createMiniGame('dungeon','story',739);h.run('save()');
  for(let turn=0;h.context.game.phase==='rogue'&&turn<100;turn++)chooseRogue(h.context.game,'wait');
  h.run('save()');
  assert.deepEqual(h.context.history.miniGames,[]);
  assert.equal(h.storage.has('history'),false);
  h.run('returnToStory()');
  h.run('launchMiniGame("dungeon",true)');
  assert.equal(h.context.game,null,'the preview argument cannot bypass locks outside the localhost preview');
  h.context.dungeonPreview=true;
  h.run('launchMiniGame("dungeon",true)');
  assert.equal(h.context.game.practice,'dungeon');
  h.run('save()');
  assert.deepEqual(h.context.history.miniGames,[]);
  assert.equal(h.storage.has('history'),false);
  const current=h.context.game;h.run('launchMiniGame("flood",true)');
  assert.equal(h.context.game,current,'the dungeon preview cannot unlock unrelated activities');
});

test('locked cards stay visible and only reached games offer enabled launch controls',()=>{
  const h=harness(new Map(),[]);
  const cards=()=>[...h.context.modal.html.matchAll(/<button class="mini-game-card[^"]*"[^>]*>/g)].map(match=>match[0]);
  h.run('showMiniGames()');
  assert.equal(h.context.modal.kind,'mini-games');
  assert.equal(cards().length,MINI_GAMES.length);
  for(const entry of MINI_GAMES){
    const card=cards().find(markup=>markup.includes(`data-value="${entry.id}"`));
    assert.match(card,/ disabled>/);
    assert.ok(h.context.modal.html.includes(entry.title));
  }
  assert.equal((h.context.modal.html.match(/Reach it in the story to unlock\./g)||[]).length,5);
  h.context.history.miniGames=['watch','dungeon'];h.run('showMiniGames()');
  for(const entry of MINI_GAMES){
    const card=cards().find(markup=>markup.includes(`data-value="${entry.id}"`));
    assert.equal(card.includes(' disabled>'),!h.context.history.miniGames.includes(entry.id),entry.id);
  }
});

test('resuming an old practice slot cannot bypass story locks except the explicit dungeon preview',()=>{
  const h=harness(new Map(),[]);
  h.storage.set('practice',JSON.stringify({game:serialize(createMiniGame('dungeon','story',740)),returnToGame:false}));
  assert.equal(h.run('readMiniGame()'),null);
  h.context.dungeonPreview=true;
  assert.equal(h.run('readMiniGame().game.practice'),'dungeon');
  h.storage.set('practice',JSON.stringify({game:serialize(createMiniGame('flood','story',741)),returnToGame:false}));
  assert.equal(h.run('readMiniGame()'),null,'the preview exception applies only to the dungeon');
  h.context.dungeonPreview=false;h.context.history.miniGames=['flood'];
  assert.equal(h.run('readMiniGame().game.practice'),'flood');
});

test('a transient history write failure retries an earned unlock on the next story save',()=>{
  const h=harness(new Map(),[]), story=createGame('story',742);
  h.context.game=story;startShift(story);
  const write=h.context.localStorage.setItem;let failOnce=true;
  h.context.localStorage.setItem=(key,value)=>{
    if(key==='history'&&failOnce){failOnce=false;throw new Error('Temporarily unavailable');}
    write(key,value);
  };
  h.run('save()');
  assert.deepEqual([...h.context.history.miniGames],['watch']);
  assert.equal(h.context.miniGameUnlocksDirty,true);
  h.run('save()');
  assert.deepEqual(JSON.parse(h.storage.get('history')).miniGames,['watch']);
  assert.equal(h.context.miniGameUnlocksDirty,false);
  assert.equal(h.storage.get('story'),serialize(story));
});
