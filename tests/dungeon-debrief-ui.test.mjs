import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createGame, startShift, enterField, inspect, serialize, restore, getEnding, ENDINGS } from '../docs/engine.js';
import { startRogue, chooseRogue, moveRogue, getRogueScene } from '../docs/rogue.js';
import { createMiniGame, miniGameComplete, miniGameResult } from '../docs/mini-games.js';
import { resolutionGameActive } from '../docs/resolution-games.js';

const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const sceneCode=source.slice(source.indexOf('function sceneDialog()'),source.indexOf('function stat('));
const actionCode=source.slice(source.indexOf('function act('),source.indexOf("document.addEventListener('click',event=>{const button"));
function escaped(practice) {
  const s=practice?createMiniGame('dungeon','story',42):createGame('story',42);
  if(!practice){
    startShift(s);s.incident=true;enterField(s);s.player={x:7,y:5};inspect(s);
    assert.equal(startRogue(s,'dungeon'),true);assert.equal(chooseRogue(s,'begin'),true);
  }
  const directions={R:[1,0],L:[-1,0],U:[0,-1],D:[0,1]};
  for(const action of 'RRRFRDDRRUURRFRRDDDDDDDDRRFRRDDRRDDFFRRRRDDLLRRDDRRRFADDRRFUURRRRRDDDDDDDD') {
    assert.equal(action==='F'?chooseRogue(s,'fire'):action==='A'?chooseRogue(s,'reload'):moveRogue(s,...directions[action]),true);
  }
  assert.equal(s.rogue.stage,'debrief');
  return s;
}
function ui(game) {
  const modals=[],saves=[];
  const context=vm.createContext({game,paused:false,modalKind:'',lastModalKey:'',dialog:{open:false},menuOpen:()=>false,
    getRogueScene,chooseRogue,moveRogue,miniGameComplete,miniGameResult,getEnding,ENDINGS,resolutionGameActive,
    esc:String,paper:(title,body)=>`${title}${body}`,miniGamePaper:(title,body)=>`${title}${body}`,
    sightingPromptReady:()=>false,isGuideAftermath:()=>false,archives:0,
    archiveRun(){context.archives++;},
    save(){saves.push(serialize(context.game));},
    showModal(kind,html){context.modalKind=kind;context.dialog.open=true;modals.push({kind,html});},
    closeModal(){context.dialog.open=false;context.modalKind='';},
    updateUI(){vm.runInContext('sceneDialog()',context);}
  });
  vm.runInContext(sceneCode+actionCode,context);
  return {context,modals,saves,run:code=>vm.runInContext(code,context)};
}

for(const practice of [false,true])test(`dungeon escape opens all three interview questions in ${practice?'practice':'story'} before its result`,()=>{
  let h=ui(escaped(practice));h.run('sceneDialog()');
  assert.equal(h.modals.at(-1).kind,'dungeon-debrief');
  assert.match(h.modals.at(-1).html,/data-action="rogue-choice"/);
  assert.equal(h.context.archives,0);
  for(let index=0;index<3;index++){
    const scene=getRogueScene(h.context.game);
    assert.equal(scene.index,index);
    assert.ok(h.modals.at(-1).html.includes(scene.prompt));
    h.context.answer=scene.options[0].id;
    const before=serialize(h.context.game);
    h.context.modalKind='records';h.run('act("rogue-choice",answer)');
    assert.equal(serialize(h.context.game),before,'unrelated dialogs cannot submit the interview');
    h.context.modalKind='dungeon-debrief';h.context.paused=true;h.run('act("rogue-choice",answer)');
    assert.equal(serialize(h.context.game),before,'pause cannot submit answers');
    h.context.paused=false;h.run('act("rogue-move","1,0")');
    assert.equal(serialize(h.context.game),before,'movement cannot bypass the interview');
    h.run('act("rogue-choice",answer)');
    assert.ok(h.saves.length);
    const restored=restore(h.saves.at(-1));assert.ok(restored);
    assert.deepEqual(restored,h.context.game);
    if(index<2){
      assert.equal(h.modals.at(-1).kind,'dungeon-debrief');
      assert.equal(h.context.game.ending,null);assert.equal(h.context.archives,0);
      assert.equal(miniGameComplete(h.context.game),false);
      h=ui(restored);h.run('sceneDialog()');
      assert.equal(h.modals.at(-1).kind,'dungeon-debrief','reload reopens the next unanswered question');
    }
  }
  assert.equal(h.context.game.ending,'dungeon_escape');
  assert.equal(h.modals.at(-1).kind,practice?'mini-result':'ending');
  assert.ok(h.modals.at(-1).html.includes(h.context.game.reports.at(-2).supervisorReply),'the final supervisor reply is visible in story and practice');
  assert.equal(h.context.archives,practice?0:1);
  if(practice){
    assert.equal(h.context.game.practice,'dungeon');
    assert.doesNotMatch(h.modals.at(-1).html,/data-action="(?:share-ending|export)"/);
  }
});
