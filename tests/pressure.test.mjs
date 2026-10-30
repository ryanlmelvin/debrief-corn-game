import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as engine from '../docs/engine.js';

const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
function takeover() {
  const game=engine.createGame();
  Object.assign(game,{phase:'decision',time:engine.SHIFT_LENGTH,incident:true,departure:'compelled'});
  let shown=[],saves=[],closed=0,focused=0,cancel;
  const context=vm.createContext({...engine,game,lastModalKey:'',modalKind:'',paused:false,
    showModal(kind,html){context.modalKind=kind;shown.push({kind,html});},
    closeModal(){context.modalKind='';closed++;},
    save(){saves.push(engine.serialize(game));},updateUI(){},syncAudio(){},
    $:()=>({querySelector:()=>({focus(){focused++;}})}),
    dialog:{addEventListener(type,handler){if(type==='cancel')cancel=handler;}}
  });
  vm.runInContext(source.slice(source.indexOf('function sceneDialog()'),source.indexOf('function stat(')),context);
  vm.runInContext(source.slice(source.indexOf('function act('),source.indexOf("document.addEventListener('click',event=>")),context);
  vm.runInContext(source.split('\n').find(line=>line.startsWith("dialog.addEventListener('cancel'")),context);
  return {game,shown,saves,run:code=>vm.runInContext(code,context),cancel:()=>{let prevented=false;cancel({preventDefault(){prevented=true;}});return prevented;},closed:()=>closed,focused:()=>focused};
}

test('the takeover opens once, saves before acknowledgement, and retains the update control',()=>{
  const view=takeover();view.run('sceneDialog();sceneDialog();');
  assert.equal(view.shown.length,1);assert.equal(view.shown[0].kind,'compulsion');
  assert.match(view.shown[0].html,/data-update/);
  assert.match(view.shown[0].html,/data-action="accept-compulsion"/);
  assert.equal(engine.restore(view.saves.at(-1)).phase,'decision');
  assert.equal(view.cancel(),true);view.run("act('close');act('confirm-enter');");
  assert.equal(view.game.phase,'decision');assert.equal(view.closed(),0);
});

test('acknowledging the takeover opens the map once and moves keyboard focus into it',()=>{
  const view=takeover();view.run("sceneDialog();act('accept-compulsion');");
  assert.equal(view.game.phase,'field');assert.equal(view.game.departure,'compelled');
  assert.equal(view.closed(),1);assert.equal(view.focused(),1);
  assert.equal(engine.restore(view.saves.at(-1)).phase,'field');
  view.run("act('accept-compulsion');");
  assert.equal(view.closed(),1);assert.deepEqual(view.game.searched,['shift-0']);
});
