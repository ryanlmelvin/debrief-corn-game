import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as engine from '../docs/engine.js';

const source=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
function notice() {
  const game=engine.createGame();
  Object.assign(game,{phase:'decision',time:engine.SHIFT_LENGTH,incident:true});
  engine.enterField(game);
  let open=false,shows=0,saves=[],timer=null,closed;
  const message={textContent:''};
  const popover={matches:()=>open,showPopover(){open=true;shows++;},hidePopover(){closed({newState:'closed'});open=false;},addEventListener(type,listener){if(type==='beforetoggle')closed=listener;}};
  const context=vm.createContext({...engine,game,paused:false,dialog:{open:false},menuOpen:()=>false,
    $:id=>id==='compulsion-notice'?popover:message,
    save(){saves.push(engine.serialize(game));},syncAudio(){},
    setTimeout(fn,delay){timer={fn,delay};return 1;},clearTimeout(){timer=null;}
  });
  vm.runInContext(source.slice(source.indexOf("const compulsionNotice=$"),source.indexOf('const REDACTED_TOWN')),context);
  return {game,popover,context,message,saves,show:()=>vm.runInContext('showCompulsionNotice()',context),shows:()=>shows,expire:()=>{assert.equal(timer.delay,8000);timer.fn();}};
}

test('the brief popover leaves the map playable and automatically clears without replaying',()=>{
  const view=notice();view.show();view.show();
  assert.equal(view.shows(),1);assert.equal(view.message.textContent,engine.COMPULSION_NOTICE);
  assert.equal(view.game.phase,'field');assert.equal(engine.move(view.game,1,0),true);
  assert.equal(engine.restore(view.saves.at(-1)).compulsionNotice,true);
  view.expire();assert.equal(view.popover.matches(),false);assert.equal(view.game.compulsionNotice,false);
  assert.equal(engine.restore(view.saves.at(-1)).compulsionNotice,false);
  view.show();assert.equal(view.shows(),1);
});

test('the arrival notice waits behind pause, menus and dialogs, and light dismissal saves it as seen',()=>{
  const view=notice();
  view.context.paused=true;view.show();assert.equal(view.shows(),0);
  view.context.paused=false;view.context.dialog.open=true;view.show();assert.equal(view.shows(),0);
  view.context.dialog.open=false;view.context.menuOpen=()=>true;view.show();assert.equal(view.shows(),0);
  view.context.menuOpen=()=>false;view.show();view.popover.hidePopover();
  assert.equal(view.game.compulsionNotice,false);view.show();assert.equal(view.shows(),1);
});

test('choosing to investigate early does not show the compulsion notice',()=>{
  const view=notice();view.game.compulsionNotice=false;view.game.departure='chosen';
  view.show();assert.equal(view.shows(),0);
});
