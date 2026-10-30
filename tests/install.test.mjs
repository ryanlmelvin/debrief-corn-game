import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function refreshInstallGuide()'),app.indexOf("if ('serviceWorker' in navigator"));
function harness(storage,installed=false){
  const elements={}, events={};
  const $=id=>elements[id]??= {isConnected:true,addEventListener(name,fn){this[name]=fn;}};
  const context={navigator:{storage},window:{addEventListener:(name,fn)=>events[name]=fn},isInstalled:()=>installed,installHandoff:{update:async()=>true},game:null,readSave:()=>null,history:{collected:[],runs:[]},showProgressTransfer(){context.transferOpened=true;},$: $,modalKind:'',dialog:{open:false},installPrompt:null,save(){},paper:(...args)=>args,showModal(kind){context.modalKind=kind;context.dialog.open=true;},toast(){}};
  vm.runInNewContext(code,context);
  $('install').click();
  return {elements,events,context};
}
test('installation guide stays available without native prompt or storage API',()=>{
  const h=harness();
  assert.equal(h.context.modalKind,'install');
  assert.equal(h.elements['install-now'].hidden,true);
  assert.equal(h.elements['protect-storage'].disabled,true);
  assert.match(h.elements['storage-status'].textContent,/cannot request/);
});
test('storage request reports grants, denials, and errors accurately',async()=>{
  for(const result of [true,false,'error']){
    const h=harness({persisted:async()=>false,persist:async()=>{if(result==='error')throw Error();return result;}});
    await Promise.resolve();
    await h.elements['protect-storage'].click();
    assert.match(h.elements['storage-status'].textContent,result===true?/is enabled/:result===false?/did not grant/:/could not be requested/);
    assert.equal(h.elements['protect-storage'].disabled,result===true);
  }
});
test('native install cancellation retains manual guidance and installed mode hides prompt',async()=>{
  const h=harness();
  h.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'dismissed'})});
  assert.equal(h.elements['install-now'].hidden,false);
  await h.elements['install-now'].click();
  assert.match(h.elements['install-status'].textContent,/canceled/);
  const installed=harness(undefined,true);
  assert.match(installed.elements['install-status'].textContent,/installed app/);
});
test('installation offers a working recovery path for an already-installed app',()=>{
  const h=harness(undefined,true);
  assert.match(h.elements['install-progress-status'].textContent,/Missing browser progress/);
  h.elements['install-transfer'].click();
  assert.equal(h.context.transferOpened,true);
});
