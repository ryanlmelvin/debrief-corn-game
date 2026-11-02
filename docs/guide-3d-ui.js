import { enableGuideExploration, moveGuide, availableGuideSites, nearbyGuideSite, focusGuide } from './guide.js';
import { bindThumbstick } from './guide-thumbsticks.js';

const KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','KeyF']);
const clamp = value => Math.max(-1,Math.min(1,value));
const SEARCH_LABEL='Recovery search. WASD to walk. Drag to look, or use arrow keys to move and turn. R and F look up and down. E examines nearby clues.';

// Owns presentation and ephemeral input only. The guide simulation owns the
// position, clues, return to the clearing, saved progress, and eventual ending.
export class Guide3D {
  constructor(root,{onInspect=()=>{},onFire=()=>{},onChange=()=>{},onUnavailable=()=>{}}={}) {
    this.root=root;this.onInspect=onInspect;this.onFire=onFire;this.onChange=onChange;this.onUnavailable=onUnavailable;
    this.ready=false;this.failed=false;this.active=false;this.blocked=true;this.game=null;
    this.world=null;this.pending=null;this.keys=new Set();this.dragging=null;this.tap=null;
    this.movement={x:0,y:0};this.look={x:0,y:0};this.currentTarget=null;this.lastGame=null;this.lastStage=null;
    this.coarse=matchMedia('(any-pointer: coarse)');
    root.innerHTML=`<canvas class="guide3d-canvas" tabindex="0" aria-label="${SEARCH_LABEL}"></canvas>
      <div class="guide3d-vignette" aria-hidden="true"></div>
      <p class="guide3d-objective" role="status" aria-live="polite"></p>
      <p class="guide3d-loading" role="status">Loading the field…</p>
      <span class="guide3d-reticle" aria-hidden="true" hidden></span>
      <button type="button" class="guide3d-examine" hidden></button>
      <div class="guide3d-sticks" role="group" aria-label="Touch controls" hidden>
        <div class="guide3d-stick guide3d-move" role="group" aria-label="Movement thumbstick. Drag up to walk forward, down to walk backward, left or right to sidestep."><span class="guide3d-knob" aria-hidden="true"></span><span class="guide3d-stick-label" aria-hidden="true">Move</span></div>
        <div class="guide3d-stick guide3d-look" role="group" aria-label="Camera thumbstick. Drag in the direction you want to look."><span class="guide3d-knob" aria-hidden="true"></span><span class="guide3d-stick-label" aria-hidden="true">Look</span></div>
      </div>`;
    const find=selector=>root.querySelector(selector);
    this.canvas=find('canvas');this.objective=find('.guide3d-objective');this.loading=find('.guide3d-loading');
    this.reticle=find('.guide3d-reticle');this.examine=find('.guide3d-examine');this.sticks=find('.guide3d-sticks');
    this.stickControllers=[
      bindThumbstick(find('.guide3d-move'),{onChange:value=>{this.movement=value;},isEnabled:()=>this.canInput()}),
      bindThumbstick(find('.guide3d-look'),{onChange:value=>{this.look=value;},isEnabled:()=>this.canInput()})
    ];
    this.examine.addEventListener('click',()=>this.inspect());
    document.addEventListener('keydown',event=>{
      if(!this.canInput()||event.target.closest('button,a,input,textarea,select,[contenteditable="true"]'))return;
      if(KEYS.has(event.code)){event.preventDefault();this.keys.add(event.code);}
      if(['KeyE','Space'].includes(event.code)&&!event.repeat){event.preventDefault();this.inspect();}
    });
    document.addEventListener('keyup',event=>this.keys.delete(event.code));
    this.canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      if(this.canAim()){
        event.preventDefault();this.focus();this.game.guide.focused=null;
        this.world.setAim(event.clientX,event.clientY);
        this.onFire(this.world.shotPoint(this.game,event.clientX,event.clientY));return;
      }
      if(!this.canInput())return;
      if(!this.tap)this.tap={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
      else this.tap=null;
      try{this.canvas.setPointerCapture(event.pointerId);}catch{this.tap=null;return;}
      if(event.pointerType==='touch'){event.preventDefault();return;}
      if(this.dragging)return;
      this.dragging={id:event.pointerId,x:event.clientX,y:event.clientY};this.focus();
    });
    this.canvas.addEventListener('pointermove',event=>{
      if(this.canAim()&&event.pointerType!=='touch'){
        this.game.guide.focused=null;this.world.setAim(event.clientX,event.clientY);return;
      }
      if(this.tap?.id===event.pointerId&&Math.hypot(event.clientX-this.tap.x,event.clientY-this.tap.y)>12)this.tap=null;
      if(!this.canInput()||this.dragging?.id!==event.pointerId)return;
      const g=this.game.guide;
      g.angle+=(event.clientX-this.dragging.x)*.004;
      g.pitch=Math.max(-1.1,Math.min(.65,g.pitch-(event.clientY-this.dragging.y)*.003));
      this.dragging.x=event.clientX;this.dragging.y=event.clientY;this.onChange();
    });
    this.canvas.addEventListener('pointerup',event=>{
      const tap=this.tap;
      if(tap?.id!==event.pointerId)return;
      this.tap=null;
      if(!this.canInput()||performance.now()-tap.time>450||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>12)return;
      const target=this.world.pick(this.game,event.clientX,event.clientY);
      if(target)this.inspect(target);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,event=>{
      if(this.dragging?.id===event.pointerId)this.dragging=null;
      if(this.tap?.id===event.pointerId)this.tap=null;
    });
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.fail();});
    window.addEventListener('blur',()=>this.release());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
    this.coarse.addEventListener('change',()=>{this.release();this.refreshControls();});
    window.addEventListener('resize',()=>{this.release();this.world?.resize();});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>this.world?.resize()).observe(root);
  }
  touchControls() { return this.coarse.matches||navigator.maxTouchPoints>0||new URLSearchParams(location.search).get('controls')==='touch'; }
  canInput() { return this.active&&!this.blocked&&!document.hidden&&this.game?.phase==='guide'&&this.game.guide.stage==='search'; }
  canAim() { return this.active&&!this.blocked&&!document.hidden&&this.game?.phase==='guide'&&this.game.guide.stage==='escape'; }
  focusNext() {
    if(!this.canAim())return false;
    for(let i=0;i<this.game.guide.team.length;i++){
      if(!focusGuide(this.game))break;
      const id=this.game.guide.focused;
      if(this.world.visiblePerson(this.game,id)&&this.world.focusPerson(this.game,id))return true;
    }
    this.game.guide.focused=null;return false;
  }
  fireAim() {
    if(!this.canAim())return false;
    const id=this.game.guide.focused;
    if(id!==null&&!this.world.visiblePerson(this.game,id)){this.game.guide.focused=null;return false;}
    this.onFire(this.world.aimPoint(this.game));return true;
  }
  async ensure() {
    if(this.ready)return true;
    if(this.failed)return false;
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      try{
        const {createGuideWorld}=await import('./guide-world.js');
        this.world=await createGuideWorld(this.canvas);
        if(this.failed){this.world.dispose();return false;}
        this.ready=true;this.onChange();return true;
      }catch(error){console.warn('The recovery field is using its guided fallback.',error);this.fail();return false;}
    })();
    return this.pending;
  }
  fail() {
    if(this.failed)return;
    this.failed=true;this.ready=false;this.active=false;this.blocked=true;this.release();
    this.root.hidden=true;document.body.classList.remove('guide-exploring','guide-searching');
    this.onUnavailable('The 3D view is unavailable. You can continue with the guided walk.');
  }
  sync(game,blocked=false) {
    const searching=game?.phase==='guide'&&game.guide?.stage==='search';
    const visible=!!game?.guide&&['guide','ending'].includes(game.phase)&&!this.failed;
    const changedGame=this.lastGame!==game||this.lastStage!==game?.guide?.stage;
    if(changedGame){this.release();this.lastGame=game;this.lastStage=game?.guide?.stage;if(searching)this.canvas.setAttribute('aria-label',SEARCH_LABEL);}
    this.game=game;
    this.active=visible&&this.ready;
    const wasBlocked=this.blocked;
    this.blocked=!!blocked||!this.active;
    if(this.blocked&&!wasBlocked||!visible)this.release();
    this.root.hidden=!visible;
    document.body.classList.toggle('guide-exploring',visible);
    document.body.classList.toggle('guide-searching',visible&&searching);
    this.root.classList.toggle('guide3d-escape',visible&&!searching);
    this.loading.hidden=this.ready;
    this.objective.hidden=!searching;
    if(this.active&&searching&&game.guide.explorationVersion!==1){enableGuideExploration(game);this.onChange();}
    this.canvas.inert=this.blocked;
    this.refreshControls();
    if(this.active&&searching){
      const text='Find the northeast clearing.';
      if(this.objective.textContent!==text)this.objective.textContent=text;
    }
    return visible;
  }
  refreshControls() {
    const touch=this.touchControls();this.root.classList.toggle('guide3d-touch',touch);
    this.sticks.hidden=!this.canInput()||!touch;
    this.reticle.hidden=!this.canInput();
    if(!this.canInput()){this.currentTarget=null;this.examine.hidden=true;}
  }
  update(game,dt,blocked=false) {
    if(!this.sync(game,blocked)||!this.active)return false;
    let moving=false;
    if(this.canInput()){
      const held=(...codes)=>codes.some(code=>this.keys.has(code));
      const input={
        forward:clamp(Number(held('KeyW','ArrowUp'))-Number(held('KeyS','ArrowDown'))-this.movement.y),
        strafe:clamp(Number(held('KeyD'))-Number(held('KeyA'))+this.movement.x),
        turn:clamp(Number(held('ArrowLeft'))-Number(held('ArrowRight'))-this.look.x),
        look:clamp(Number(held('KeyR'))-Number(held('KeyF'))-this.look.y*.85)
      };
      if(Object.values(input).some(Boolean)){
        moving=moveGuide(game,input,dt);this.onChange();
      }
    }
    const target=this.canInput()?nearbyGuideSite(game)?.id||null:null;
    if(target!==this.currentTarget){
      this.currentTarget=target;this.examine.hidden=!target;
      if(target)this.examine.textContent=target==='corner'?'Gather the team at the clearing':`${this.touchControls()?'':'E · '}Examine ${target==='boot'?'the boot print':'the radio'}`;
    }
    try{this.world.render(game,moving);}catch(error){console.warn('Recovery rendering stopped.',error);this.fail();}
    return moving;
  }
  inspect(id) {
    if(!this.canInput())return;
    const site=id?availableGuideSites(this.game).find(site=>site.id===id):nearbyGuideSite(this.game);
    if(!site)return;
    this.release();this.onInspect(site.id);
  }
  release() {
    const pointers=[this.dragging?.id,this.tap?.id];this.dragging=null;this.tap=null;this.keys.clear();
    for(const controller of this.stickControllers)controller.reset();
    for(const id of pointers)if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
  }
  focus() { if(this.active&&!this.blocked)this.canvas.focus({preventScroll:true}); }
}
