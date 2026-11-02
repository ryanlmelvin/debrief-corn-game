const DIRECTIONS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const KEYS={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};

// The simulation enforces the .20-second step cooldown. Input owns only the
// current held direction and never queues steps across a pause or a new run.
export function bindCornControls({canvas,buttons,move,isEnabled=()=>true,onPause}={}) {
  const doc=canvas.ownerDocument??globalThis.document;
  const win=doc?.defaultView??globalThis.window;
  const later=win?.setTimeout?.bind(win)??setTimeout;
  const cancel=win?.clearTimeout?.bind(win)??clearTimeout;
  const listeners=[],held=new Map(),pointers=new Map();
  let timer=null,swipe=null,destroyed=false;
  const enabled=()=>!destroyed&&!doc?.hidden&&isEnabled();
  function listen(target,type,handler,options) {
    target?.addEventListener(type,handler,options);
    listeners.push(()=>target?.removeEventListener(type,handler,options));
  }
  function clearTimer() {if(timer!==null){cancel(timer);timer=null;}}
  function repeat() {
    timer=null;
    if(!enabled()){release();return;}
    const direction=[...held.values()].at(-1);
    if(!direction)return;
    const accepted=move(...DIRECTIONS[direction]);
    if(!enabled()){release();return;}
    // A frame can still be a few milliseconds short of the game cooldown.
    // Retry a rejected hold, rather than dropping every other repeated step.
    if(held.size)timer=later(repeat,accepted===false?32:200);
  }
  function hold(id,direction) {
    if(!enabled()||held.has(id))return;
    held.set(id,direction);clearTimer();repeat();
  }
  function stop(id) {
    held.delete(id);
    if(!held.size)clearTimer();
  }
  function dropCapture(element,id) {
    try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{ /* The browser may already have canceled it. */ }
  }
  function releasePointer(id) {
    const element=pointers.get(id);if(!element)return;
    pointers.delete(id);stop(`pointer:${id}`);
    if(![...pointers.values()].includes(element))element.classList.remove('held');
    dropCapture(element,id);
  }
  function releaseSwipe() {
    const previous=swipe;swipe=null;
    if(previous)dropCapture(canvas,previous.id);
  }
  function release() {
    clearTimer();held.clear();
    for(const id of [...pointers.keys()])releasePointer(id);
    releaseSwipe();
  }
  function editable(target) {return !!target?.closest?.('input,textarea,select,[contenteditable="true"]');}
  const modified=event=>event.ctrlKey||event.metaKey||event.altKey;
  listen(doc,'keydown',event=>{
    if(event.defaultPrevented||modified(event)||editable(event.target))return;
    // The main game owns Escape. A standalone host may explicitly opt in to
    // handling it here; inactive controls must not consume another view's keys.
    if(event.code==='Escape'&&!event.repeat&&typeof onPause==='function'&&enabled()){
      event.preventDefault();release();onPause();return;
    }
    const direction=KEYS[event.code];
    if(!direction||event.repeat||event.target?.closest?.('button,a')||!enabled())return;
    event.preventDefault();hold(`key:${event.code}`,direction);
  });
  listen(doc,'keyup',event=>{
    if(enabled()&&!modified(event)&&held.has(`key:${event.code}`))event.preventDefault();
    stop(`key:${event.code}`);
  });
  for(const element of buttons.querySelectorAll('[data-direction]')) {
    const direction=element.dataset.direction;if(!DIRECTIONS[direction])continue;
    listen(element,'pointerdown',event=>{
      if(!enabled()||event.button!==0||pointers.has(event.pointerId))return;
      event.preventDefault();
      try{element.setPointerCapture(event.pointerId);}catch{return;}
      pointers.set(event.pointerId,element);element.classList.add('held');
      hold(`pointer:${event.pointerId}`,direction);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(element,type,event=>releasePointer(event.pointerId));
    listen(element,'click',event=>{
      // The application may also delegate clicks from its old movement markup.
      // This control already owns the gesture, including the click after a hold.
      event.stopPropagation();
      // Pointer presses already moved on pointerdown. Zero-detail clicks come
      // from keyboard/assistive activation and must still be usable.
      if(event.detail!==0||event.pointerType||!enabled())return;
      move(...DIRECTIONS[direction]);
    });
    listen(element,'contextmenu',event=>event.preventDefault());
  }
  for(const type of ['pointerup','pointercancel'])listen(doc,type,event=>releasePointer(event.pointerId));
  listen(canvas,'pointerdown',event=>{
    if(!enabled()||!['touch','pen'].includes(event.pointerType)||event.button!==0)return;
    event.preventDefault();
    if(swipe){releaseSwipe();return;}
    try{canvas.setPointerCapture(event.pointerId);}catch{return;}
    swipe={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  listen(canvas,'pointermove',event=>{
    if(swipe?.id!==event.pointerId)return;
    event.preventDefault();if(!enabled())releaseSwipe();
  });
  listen(canvas,'pointerup',event=>{
    if(swipe?.id!==event.pointerId)return;
    event.preventDefault();
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
    releaseSwipe();
    if(!enabled()||Math.max(Math.abs(dx),Math.abs(dy))<24)return;
    move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,Math.sign(dy)]));
  });
  for(const type of ['pointercancel','lostpointercapture'])listen(canvas,type,event=>{if(swipe?.id===event.pointerId)releaseSwipe();});
  listen(win,'blur',release);
  listen(doc,'visibilitychange',()=>{if(doc.hidden)release();});
  return {release,destroy(){release();destroyed=true;for(const remove of listeners)remove();}};
}
