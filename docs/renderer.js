import { personRole, personLight, targetArtwork } from './watch-story.js';
import { GUIDE_SITES, projectGuide, isGuideAftermath } from './guide.js';
import { FIELD_SITES, SHIFT_LENGTH } from './engine.js';
import { FLARE_DURATION, FLARE_SLOWDOWN } from './watch-play.js';

const W = 960, H = 600;
const GUIDE_PLATES = {
  walk: { file: 'encounter-tracks.webp', x: .62, y: .46 },
  boot: { file: 'encounter-extra-step.webp', x: .52, y: .54 },
  radio: { file: 'encounter-radio.webp', x: .46, y: .5 },
  corner: { file: 'field-corner.webp', x: .45, y: .48 }
};
// Source bounds keep transparent padding out of the gameplay size. The root
// crown / shoes share the same ground anchor as the procedural fallback.
const TARGET_SPRITES = {
  corn: { file:'watch-corn.webp', source:[29,4,233,499], destination:[-28,-86,56,94] },
  'corn-roots': { file:'watch-anatomy.webp', source:[35,3,290,592], destination:[-28,-86,56,94] },
  'corn-teeth': { file:'watch-anatomy.webp', source:[352,3,288,593], destination:[-28,-86,56,94] },
  dress: { file:'watch-figure.webp', source:[96,20,160,464], destination:[-12,-70,25.5,74] },
  'retrieval-0': { file:'watch-retrieval.webp', source:[124,9,281,579], destination:[-18,-72,36,76] },
  'retrieval-1': { file:'watch-retrieval.webp', source:[474,42,274,545], destination:[-18,-68,36,72] },
  'retrieval-2': { file:'watch-retrieval.webp', source:[855,76,233,510], destination:[-16,-66,32,70] },
  'hazmat-0': { file:'watch-hazmat.webp', source:[121,16,302,576], destination:[-20,-72,40,76] },
  'hazmat-1': { file:'watch-hazmat.webp', source:[464,34,294,558], destination:[-19,-68,38,72] },
  'hazmat-2': { file:'watch-hazmat.webp', source:[853,79,264,510], destination:[-18,-66,36,70] }
};
function rng(seed) { return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
function line(c,x1,y1,x2,y2,color,width=1) { c.strokeStyle=color; c.lineWidth=width; c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke(); }
function stalk(c,x,y,size,color,lean=0,mutant=false) {
  c.save(); c.translate(x,y); c.rotate(lean); c.scale(size,size);
  c.strokeStyle=color; c.fillStyle=color; c.lineWidth=2;
  c.beginPath(); c.moveTo(0,0); c.lineTo(-2,-67); c.stroke();
  for (let i=0;i<4;i++) {
    const yy=-15-i*11, side=i%2 ? 1:-1;
    c.beginPath(); c.moveTo(0,yy); c.quadraticCurveTo(side*28,yy-21,side*30,yy-8); c.quadraticCurveTo(side*14,yy-13,0,yy+5); c.fill();
  }
  c.fillStyle=mutant?'#d3b971':color;
  c.beginPath(); c.ellipse(4,-42,5,13,0.25,0,Math.PI*2); c.fill();
  for(let i=-2;i<=2;i++) line(c,-2,-65,i*4-2,-77+Math.abs(i)*3,color,1);
  if(mutant) {
    c.fillStyle='#111b16'; for(let i=0;i<3;i++) c.fillRect(2,-48+i*5,4,2);
  }
  c.restore();
}
export function cameraFor(width,height) {
  const scale=Math.max(width/W,height/H);
  const viewWidth=width/scale,viewHeight=height/scale;
  return {scale,width:viewWidth,height:viewHeight,left:(W-viewWidth)/2,top:(H-viewHeight)/2};
}
export function targetProjection(target,view) {
  const depth=.13+Math.sqrt(Math.max(0,Math.min(1,(target.y-281)/340)))*.72;
  const size=Math.min(1,Math.max(.82,view.width/W))*Math.max(.58,depth*1.45);
  const margin=32*Math.min(1,Math.max(.55,view.width/W));
  return {x:view.left+margin+(target.x-40)/880*(view.width-2*margin),y:target.y,size};
}
export function aimProjection(point,view,targets=[]) {
  const target=targets.find(t=>((point.x-t.x)/24)**2+((point.y-(t.y-34))/45)**2<=1);
  const anchor=target||{x:point.x,y:point.y+34},p=targetProjection(anchor,view);
  return {x:p.x+(point.x-anchor.x)*p.size,y:p.y+(point.y-anchor.y)*p.size};
}
// Aim assistance must only select a person the current crop actually shows.
export function visibleGuideTarget(guide,target,view) {
  const p=projectGuide(guide,target);
  if(!p)return null;
  const aimY=p.y-p.height*.5;
  return p.x>=view.left&&p.x<=view.left+view.width&&aimY>=view.top&&aimY<=view.top+view.height?p:null;
}
// Cosmetic tracks follow simulation time, so pausing never advances or erases them.
// They are deliberately separate from saves and cannot alter containment or aim.
export function updateGroundTracks(tracks,targets,time) {
  for(const target of targets.filter(t=>t.kind==='corn')) {
    let track=tracks.find(t=>t.id===target.id);
    if(!track) { track={id:target.id,x0:target.x,x1:target.x,y:target.y};tracks.push(track); }
    track.x1=target.x;track.time=time;
  }
  return tracks.filter(track=>time-track.time<18);
}
// Show the nearest imminent escape at each edge, using the same slowdown as
// the watch simulation. Human sightings never produce containment warnings.
export function perimeterWarnings(s) {
  const warnings=new Map(),flareRemaining=Math.max(0,(s.watch?.flareUntil||0)-s.time);
  for(const target of s.targets) {
    if(target.kind!=='corn'||!Number.isFinite(target.speed)||target.speed<=0)continue;
    const side=target.direction<0?-1:1;
    const distance=Math.max(0,side<0?target.x-65:895-target.x);
    const slowedDistance=target.speed*FLARE_SLOWDOWN*flareRemaining;
    const remaining=distance<=slowedDistance
      ? distance/(target.speed*FLARE_SLOWDOWN)
      : flareRemaining+(distance-slowedDistance)/target.speed;
    if(remaining>5)continue;
    if(!warnings.has(side)||remaining<warnings.get(side).remaining)warnings.set(side,{target,side,remaining});
  }
  return [...warnings.values()];
}
export class Renderer {
  constructor(canvas) {
    this.canvas=canvas; this.c=canvas.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1,2); canvas.width=W*dpr; canvas.height=H*dpr;
    this.c.scale(dpr,dpr); this.pointer={x:480,y:330}; this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.background=document.createElement('canvas'); this.background.width=W; this.background.height=H;
    this.paintLandscape(this.background.getContext('2d'));
    this.sprites={};const byFile=new Map();
    for(const [kind,art] of Object.entries(TARGET_SPRITES)) {
      if(!byFile.has(art.file)) {const image=new Image();image.src=new URL(`./assets/${art.file}`,import.meta.url).href;byFile.set(art.file,image);}
      this.sprites[kind]=byFile.get(art.file);
    }
    this.guidePlates={};
    for(const [key,plate] of Object.entries(GUIDE_PLATES)) {
      const image=new Image();image.src=new URL(`./assets/${plate.file}`,import.meta.url).href;this.guidePlates[key]=image;
    }
    this.towerFrame=document.createElement('canvas');this.towerFrame.width=W;this.towerFrame.height=H;
    this.paintTowerFrame(this.towerFrame.getContext('2d'));
  }
  paintTowerFrame(c) {
    const random=rng(704),wood=c.createLinearGradient(0,553,0,H);
    wood.addColorStop(0,'#384032');wood.addColorStop(.13,'#1d281e');wood.addColorStop(1,'#0e1712');
    c.fillStyle='#0e1712';c.fillRect(0,0,18,H);c.fillRect(942,0,18,H);
    c.fillStyle=wood;c.fillRect(0,553,W,47);
    // Weathering is baked once, like the landscape grain; it never sparkles.
    for(let i=0;i<150;i++) {
      const x=random()*W,y=557+random()*43,length=10+random()*75;
      c.strokeStyle=i%3?'#77816916':'#030b0760';c.lineWidth=.5+random()*.6;
      c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+length*.3,y-1,x+length*.7,y+1,x+length,y);c.stroke();
    }
    for(const x of [175,575,850]) {
      for(let ring=0;ring<3;ring++) {c.strokeStyle='#050d0a55';c.lineWidth=.7;c.beginPath();c.ellipse(x,577+ring,8+ring*6,1+ring,0,0,Math.PI*2);c.stroke();}
    }
    for(let x=0;x<W;x+=130)line(c,x,561,x-15,600,'#080f0b',2);
    for(const x of [49,344,620,910]) {
      c.fillStyle='#6e725344';c.beginPath();c.ellipse(x,565,2.4,1.5,0,0,Math.PI*2);c.fill();
      line(c,x-1.5,565,x+1.5,565,'#0b140d',.8);
    }
    for(const edge of [0,942])for(let i=0;i<12;i++) {
      const x=edge+2+random()*14,y=random()*H;
      line(c,x,y,x+(random()-.5)*2,y+25+random()*140,'#6d76521b',.7);
    }
    line(c,0,553.5,W,553.5,'#71745166');
  }
  paintLandscape(c,farmLightsOn=true) {
    this.farmLightsOn=farmLightsOn;
    const random=rng(40130);
    this.cropRows=[];
    const sky=c.createLinearGradient(0,0,0,310); sky.addColorStop(0,'#101e1d'); sky.addColorStop(.55,'#3f5149'); sky.addColorStop(1,'#b2a875');
    c.fillStyle=sky; c.fillRect(0,0,W,H);
    c.globalAlpha=.28;
    for(let i=0;i<48;i++) { const x=random()*W,y=random()*160; c.fillStyle='#eee4c5'; c.fillRect(x,y,1,1); }
    c.globalAlpha=1;
    for(let layer=0;layer<3;layer++) {
      c.fillStyle=['#445747','#2c3e32','#23372c'][layer];
      c.beginPath(); c.moveTo(0,275);
      for(let x=0;x<=W;x+=8) c.lineTo(x,236+layer*11-random()*(18-layer*3));
      c.lineTo(W,310);c.lineTo(0,310);c.fill();
    }
    // A distant farm, treatment silo and utility lines at the horizon.
    c.fillStyle='#192c24'; c.fillRect(641,217,95,39);
    c.beginPath(); c.moveTo(630,217); c.lineTo(689,181); c.lineTo(746,217); c.fill();
    c.fillStyle=farmLightsOn?'#af9a57':'#0e1712'; c.fillRect(679,226,8,13);c.fillRect(702,226,8,13);
    c.fillStyle='#253a30'; c.fillRect(757,198,25,61);c.beginPath();c.ellipse(769.5,198,12.5,9,0,0,Math.PI*2);c.fill();
    c.fillStyle='#283c32'; c.fillRect(300,182,33,36);c.beginPath();c.ellipse(316.5,182,16.5,5,0,0,Math.PI*2);c.fill();
    for(const x of [304,329]) line(c,x,214,x-5,261,'#25382d',3);
    line(c,301,220,328,251,'#26392e');line(c,328,220,300,251,'#26392e');
    [90,209,854,936].forEach((x,i)=>{ const y=204+i*5; line(c,x,y,x,292,'#27362b',3);line(c,x-13,y+8,x+13,y+8,'#27362b',2); });
    c.strokeStyle='#283a30';c.beginPath();c.moveTo(0,218);c.quadraticCurveTo(160,249,209,217);c.quadraticCurveTo(540,300,854,222);c.quadraticCurveTo(900,241,960,223);c.stroke();
    const ground=c.createLinearGradient(0,270,0,H);ground.addColorStop(0,'#505b37');ground.addColorStop(1,'#15221a');c.fillStyle=ground;c.fillRect(0,270,W,330);
    // Converging rows create depth without downloaded art or a 3D dependency.
    for(let row=-15;row<=15;row++) {
      c.fillStyle=row%2 ? '#303e27':'#3c472b';c.beginPath();c.moveTo(480+row*11,272);c.lineTo(480+(row+.7)*11,272);c.lineTo(480+(row+.7)*90,600);c.lineTo(480+row*90,600);c.fill();
    }
    this.terrain=document.createElement('canvas');this.terrain.width=W;this.terrain.height=H;
    this.terrain.getContext('2d').drawImage(c.canvas,0,0);
    for(let depth=0;depth<25;depth++) {
      const d=depth/24,y=281+d*d*340,size=.13+d*.72;
      const row={plants:[],top:Math.floor(y-size*85-5)};
      row.canvas=document.createElement('canvas');row.canvas.width=W;row.canvas.height=Math.ceil(y+12-row.top);
      const layer=row.canvas.getContext('2d');layer.translate(0,-row.top);
      for(let col=-19;col<=19;col++) {
        const x=480+col*(13+d*39)+(random()-.5)*8;
        const plant={x,y:y+random()*9,size,color:['#55623b','#646b3e','#747444','#4b5934'][Math.floor(random()*4)],lean:(random()-.5)*.2};
        row.plants.push(plant);
        stalk(c,plant.x,plant.y,size,plant.color,plant.lean);
        stalk(layer,plant.x,plant.y,size,plant.color,plant.lean);
      }
      row.plants.sort((a,b)=>a.y-b.y);
      this.cropRows.push(row);
    }
    this.atmosphere=document.createElement('canvas');this.atmosphere.width=W;this.atmosphere.height=H;
    const landscape=c;c=this.atmosphere.getContext('2d');
    const haze=c.createLinearGradient(0,235,0,370);haze.addColorStop(0,'#aaa87b00');haze.addColorStop(.35,'#c3bb8e35');haze.addColorStop(1,'#aaa87b00');c.fillStyle=haze;c.fillRect(0,235,W,140);landscape.fillStyle=haze;landscape.fillRect(0,235,W,140);
    // Grain is painted once; the game does not flicker.
    for(let i=0;i<20000;i++) {const color=random()>.5?'#efe7b507':'#0000000b',x=random()*W,y=random()*H;c.fillStyle=color;c.fillRect(x,y,1,1);landscape.fillStyle=color;landscape.fillRect(x,y,1,1);}
    const vignette=c.createRadialGradient(480,310,170,480,310,620);vignette.addColorStop(0,'#08110d00');vignette.addColorStop(1,'#08110dc9');c.fillStyle=vignette;c.fillRect(0,0,W,H);
    landscape.fillStyle=vignette;landscape.fillRect(0,0,W,H);
  }
  drawEclipse(s,title) {
    const progress=!s || title || s.phase==='briefing' ? 0
      : ['debrief','ending'].includes(s.phase) ? 1 : Math.max(0,Math.min(1,s.time/SHIFT_LENGTH));
    const c=this.c,view=this.view||{left:0,top:0,width:W,height:H};
    const x=view.left+view.width*.79,y=Math.max(99,view.top+view.height*.17);
    // Trace only the exposed crescent. Clipping two complete circles can leave
    // an antialiased bright rim around the shadow on mobile canvas renderers.
    const radius=23,shadowRadius=22+14*progress,distance=Math.hypot(9,7);
    if(shadowRadius>=distance+radius)return;
    const direction=Math.atan2(-7,-9);
    const angle=Math.acos((radius*radius+distance*distance-shadowRadius*shadowRadius)/(2*radius*distance));
    const start=direction+angle,end=direction-angle;
    const shadowStart=Math.atan2(radius*Math.sin(end)+7,radius*Math.cos(end)+9);
    const shadowEnd=Math.atan2(radius*Math.sin(start)+7,radius*Math.cos(start)+9);
    c.save();
    c.fillStyle='#d9d6ae';
    c.beginPath();
    c.arc(x,y,radius,start,end);
    c.arc(x-9,y-7,shadowRadius,shadowStart,shadowEnd,true);
    c.closePath();
    c.fill();
    c.restore();
  }
  draw(s,now,title=false) {
    const c=this.c; c.clearRect(0,0,W,H);
    const rect=this.canvas.getBoundingClientRect();
    this.view=cameraFor(rect.width,rect.height);this.scene=s;
    if(this.lastShot!==s?.lastShot) {
      this.shotPoint=s?.lastShot&&(this.pointer.view||aimProjection(s.lastShot,this.view,this.previousTargets||s.targets));
      this.lastShot=s?.lastShot;
      if(s?.phase==='tower'&&s.lastShot&&s.time-s.lastShot.time<1.1)
        (this.shotEffects||=[]).push({...s.lastShot,point:{...this.shotPoint}});
    }
    if(s?.phase==='guide'||isGuideAftermath(s)) { this.drawGuide(s); return; }
    if(s?.phase==='field') { this.drawMap(s); return; }
    const active=s&&!title;
    // The third briefing reports the outage. Repaint both cached landscapes
    // once so the windows stay dark with moving crops and after restoring a save.
    const farmLightsOn=!active||s.shift<2;
    if(this.farmLightsOn!==farmLightsOn)this.paintLandscape(this.background.getContext('2d'),farmLightsOn);
    if(this.trackScene!==s||this.trackShift!==s?.shift||s?.time<this.trackTime) {this.groundTracks=[];this.shotEffects=[];}
    this.trackScene=s;this.trackShift=s?.shift;this.trackTime=s?.time;
    this.groundTracks=active?updateGroundTracks(this.groundTracks||[],s.targets,s.time):[];
    if(active&&(s.targets.length||this.groundTracks.length))this.drawFieldDepth(s);
    else c.drawImage(this.background,0,0);
    this.drawEclipse(s,title);
    const t=this.reduced?0:now/1000;
    c.save();
    // Thin drifting mist rather than flashes or screen shake.
    for(let i=0;i<3;i++) {
      const x=120+Math.sin(t*.07+i)*170+i*260;
      const fog=c.createRadialGradient(x,335+i*25,0,x,335+i*25,200);
      fog.addColorStop(0,'#d0cba70a');fog.addColorStop(1,'#d0cba700');c.fillStyle=fog;c.fillRect(0,220,W,300);
    }
    if(s && !title) {
      if(s.shift>0) { c.fillStyle=`rgba(8,18,18,${s.shift*.08})`;c.fillRect(0,0,W,H); }
      if(s.phase==='tower') {
        this.drawFlare(s);
        this.drawPerimeterWarnings(s);
      }
      for(const target of s.targets)if(target.kind==='corn')this.drawTargetMarker(target,s);
    }
    c.drawImage(this.towerFrame,0,0);
    c.strokeStyle='#68705250';c.lineWidth=1;c.strokeRect(31,30,898,501);
    // Canvas coordinates scale with the camera; HTML counters stay screen-fixed.
    // Leave both corners clear while the shooting HUD is visible.
    c.font='10px monospace';
    if(s?.phase!=='tower'||title) {
      c.fillStyle='#bdc19d';c.textAlign='left';c.fillText('STATION 04  /  NORTH FIELD',47,51);
      c.textAlign='right';c.fillText('38°00′17″ N   89°14′12″ W',913,51);
    }
    c.textAlign='left';c.fillStyle='#a8b38d';c.fillText('N',477,42);line(c,480,49,480,62,'#a8b38d');
    if(s?.phase==='tower'&&!title) {
      const {x,y}=this.pointer.view||aimProjection(this.pointer,this.view,s.focused?s.targets.filter(t=>t.id===s.focused):s.targets);
      c.strokeStyle=s.reload?'#d6af69':'#e3dfb9';c.lineWidth=1;
      c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.stroke();
      for(const d of [-1,1]) { line(c,x+d*5,y,x+d*20,y,'#e3dfb9');line(c,x,y+d*5,x,y+d*20,'#e3dfb9'); }
      this.drawShotEffects(s);
      if(s.shift>0 && s.time>35 && s.time<44){c.save();c.globalAlpha=this.reduced ? .6 :Math.sin((s.time-35)/9*Math.PI)*.6;c.fillStyle=s.shift===2?'#b56554':'#bcc09a';c.font='17px Georgia';c.textAlign='center';c.fillText('Watch the corn. Shoot any that try to escape.',480,110);c.restore();}


    }
    c.restore();
    this.previousTargets=s?.targets;
  }
  drawFlare(s) {
    const remaining=(s.watch?.flareUntil||0)-s.time;
    if(remaining<=0)return;
    const c=this.c,view=this.view,x=view.left+view.width*.5,y=468;
    const strength=this.reduced?.65:Math.min(1,(FLARE_DURATION-remaining)/.3,remaining/.7);
    c.save();c.globalAlpha=Math.max(0,strength);
    const glow=c.createRadialGradient(x,y,8,x,y,310);
    glow.addColorStop(0,'#d6af6935');glow.addColorStop(.48,'#d6af691b');glow.addColorStop(1,'#d6af6900');
    c.fillStyle=glow;c.fillRect(view.left,200,view.width,340);
    const smoke=c.createLinearGradient(x,325,x,y);
    smoke.addColorStop(0,'#c6bd9a00');smoke.addColorStop(1,'#c6bd9a28');
    c.fillStyle=smoke;c.beginPath();c.moveTo(x-7,y);c.bezierCurveTo(x-22,424,x+20,378,x-10,325);c.lineTo(x+28,325);c.bezierCurveTo(x+42,378,x+4,424,x+7,y);c.fill();
    c.fillStyle='#e1c687';c.beginPath();c.ellipse(x,y,4,2,0,0,Math.PI*2);c.fill();
    c.restore();
  }
  drawPerimeterWarnings(s) {
    const c=this.c,view=this.view;
    for(const {target,side,remaining} of perimeterWarnings(s)) {
      const p=targetProjection(target,view),x=side<0?view.left+11:view.left+view.width-11,y=p.y-34*p.size;
      c.save();c.globalAlpha=.55+(1-remaining/5)*.4;
      line(c,x,y-24,x,y+24,'#c47756',2);
      // A fixed arrow and countdown draw the eye without a flashing edge.
      for(let i=0;i<2;i++) {
        const xx=x-side*(8+i*6);
        line(c,xx-side*4,y-5,xx,y,'#e4bd82',1.5);
        line(c,xx,y,xx-side*4,y+5,'#e4bd82',1.5);
      }
      c.font='10px monospace';c.textAlign=side<0?'left':'right';c.fillStyle='#e4bd82';
      c.fillText(`${Math.max(1,Math.ceil(remaining))}s`,x-side*8,y-29);c.restore();
    }
  }
  drawShotEffects(s) {
    const c=this.c,view=this.view;
    this.shotEffects=(this.shotEffects||[]).filter(shot=>s.time-shot.time>=0&&s.time-shot.time<1.1);
    for(const shot of this.shotEffects) {
      const age=s.time-shot.time,p=shot.point,hit=shot.result==='hit',armor=shot.result==='armor';
      const duration=hit?1.1:armor?.85:.45;
      if(age>=duration||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      const fade=Math.min(1,(duration-age)/.3),color=hit?'#e4cd91':armor?'#c9bd93':'#a8ae91';
      c.save();c.globalAlpha=fade;
      if(hit||armor) {
        if(!this.reduced)for(let i=0;i<(hit?11:6);i++) {
          const direction=i*2.399+shot.time,spread=(hit?58:32)*age;
          const x=p.x+Math.cos(direction)*spread,y=p.y+Math.sin(direction)*spread-18*age+40*age*age;
          c.fillStyle=i%3===0?'#d1bc7b':i%3===1?'#9caa6c':'#63774e';
          c.beginPath();c.ellipse(x,y,i%3===0?2:4,1.3,direction+age,0,Math.PI*2);c.fill();
        }
        // A clear hit mark survives reduced-motion mode without animated debris.
        for(const dx of [-1,1])for(const dy of [-1,1])line(c,p.x+dx*5,p.y+dy*5,p.x+dx*10,p.y+dy*10,color,1.7);
        const label=hit?`+${shot.points||100}${shot.streak>=3?' · '+shot.streak+' STREAK':''}`:'HUSK BROKEN';
        c.font='bold 11px monospace';c.textAlign='center';
        const labelWidth=c.measureText(label).width+12;
        const x=Math.max(view.left+labelWidth/2+4,Math.min(view.left+view.width-labelWidth/2-4,p.x));
        const y=p.y-31-(this.reduced?0:age*14);
        c.fillStyle='#111914ce';c.fillRect(x-labelWidth/2,y-12,labelWidth,18);
        c.fillStyle=color;c.fillText(label,x,y);
      } else {
        c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,5+(this.reduced?0:age*12),0,Math.PI*2);c.stroke();
        if(shot.result==='miss') {c.font='9px monospace';c.textAlign='center';c.fillStyle=color;c.fillText('MISS',Math.max(view.left+20,Math.min(view.left+view.width-20,p.x)),p.y-15);}
      }
      c.restore();
    }
  }
  drawFieldDepth(s) {
    const c=this.c,actors=s.targets.map(target=>({target,...targetProjection(target,this.view)})).sort((a,b)=>a.y-b.y);
    const tracks=this.groundTracks.map(track=>({
      ...track,a:targetProjection({x:track.x0,y:track.y},this.view),b:targetProjection({x:track.x1,y:track.y},this.view),
      strength:Math.min(1,(18-(s.time-track.time))/6)
    }));
    c.drawImage(this.terrain,0,0);
    for(const track of tracks)this.drawSoilTrack(track);
    let next=0;
    for(const row of this.cropRows) {
      const minY=row.plants[0].y,maxY=row.plants.at(-1).y;
      while(next<actors.length&&actors[next].y<minY)this.drawTarget(actors[next++].target);
      const nearbyActors=actors.filter(p=>p.y-18*p.size<=maxY&&p.y+52*p.size>=minY);
      const nearbyTracks=tracks.filter(p=>p.y-14*p.a.size<=maxY&&p.y+48*p.a.size>=minY);
      if(!nearbyActors.length&&!nearbyTracks.length) {c.drawImage(row.canvas,0,row.top);continue;}
      for(const plant of row.plants) {
        while(next<actors.length&&actors[next].y<=plant.y)this.drawTarget(actors[next++].target);
        let bend=0,side=1;
        const part=(x,y,size,strength)=>{
          const dx=plant.x-x,dy=plant.y-y-16*size;
          const amount=Math.max(0,1-Math.hypot(dx/(33*size),dy/(36*size)))*strength;
          if(amount>bend){bend=amount;side=dx<0?-1:1;}
        };
        for(const p of nearbyActors)part(p.x,p.y,p.size,p.target.kind==='person'?.18:1);
        for(const p of nearbyTracks)part(Math.max(Math.min(p.a.x,p.b.x),Math.min(plant.x,Math.max(p.a.x,p.b.x))),p.y,p.a.size,p.strength);
        c.save();c.globalAlpha=1-bend*.35;
        stalk(c,plant.x,plant.y,plant.size,plant.color,plant.lean+side*bend*1.25);
        c.restore();
      }
    }
    while(next<actors.length)this.drawTarget(actors[next++].target);
    c.drawImage(this.atmosphere,0,0);
  }
  drawSoilTrack(track) {
    const c=this.c,{a,b,strength}=track,size=a.size;
    const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
    c.save();c.globalAlpha=strength;c.lineCap='round';
    // Anchor clods to the ground grid: extending a leftward trail must not shimmer.
    const spacing=6*size;
    for(let x=Math.ceil(left/spacing)*spacing;x<=right+1;x+=spacing) {
      const noise=Math.sin(x*1.73+track.id*9),yy=a.y+noise*4*size;
      c.fillStyle='#4b452e';c.beginPath();c.ellipse(x,a.y+3*size,(5.5+noise)*size,(4+noise)*size,0,0,Math.PI*2);c.fill();
      c.fillStyle='#292b1d';c.beginPath();c.ellipse(x,a.y+2*size,5*size,3*size,noise*.2,0,Math.PI*2);c.fill();
      c.fillStyle=noise>0?'#6b5e40':'#3c3525';
      c.beginPath();c.ellipse(x,yy,2.8*size,(1.4+Math.abs(noise))*size,noise*.4,0,Math.PI*2);c.fill();
      line(c,x-2*size,yy+5*size,x+size,yy+6*size,'#82704d',.7*size);
    }
    c.restore();
  }
  drawRoots(target,phase) {
    const c=this.c,dir=target.direction||1;c.lineCap='round';
    c.fillStyle='#3b3524';c.beginPath();c.ellipse(0,3,11,5,0,0,Math.PI*2);c.fill();
    for(let i=0;i<7;i++) {
      const step=(phase+i/7)%1,lift=step>.72?Math.sin((step-.72)/.28*Math.PI):0;
      const tipX=dir*(18-step*28)+(i-3)*4,tipY=4+(i%3)*3-lift*7;
      c.strokeStyle=i%2?'#b1a177':'#8b805d';c.lineWidth=i%3===0?1.8:1.25;
      c.beginPath();c.moveTo((i-3)*1.1,-5);
      c.bezierCurveTo((i-3)*3,-1,tipX-dir*8,tipY-6,tipX,tipY);c.stroke();
      line(c,tipX-dir*4,tipY-1,tipX+dir*3,tipY+1,'#a99b72',.8);
      line(c,tipX-dir*6,tipY-2,tipX-dir*7,tipY+3,'#8b805d',.7);
    }
  }
  drawSprite(key,lean=0,brightness=1) {
    const image=this.sprites[key],art=TARGET_SPRITES[key];
    if(!image?.complete||!image.naturalWidth)return false;
    const c=this.c;c.save();c.rotate(lean);
    if(brightness!==1)c.filter=`brightness(${brightness})`;
    c.drawImage(image,...art.source,...art.destination);c.restore();return true;
  }
  drawRetrievalMember(member,phase,light=1,artwork=`retrieval-${member}`,walking=false) {
    const c=this.c,lean=this.reduced?0:Math.sin(phase*Math.PI*2)*.012;
    if(!this.drawSprite(artwork,lean,light?1.2:.48)) {
      const hazmat=artwork.startsWith('hazmat-');
      // Distinct civilian kit remains readable if an image has not downloaded.
      c.save();c.globalAlpha=light?1:.45;
      c.fillStyle=hazmat?['#b4aa87','#c7bfa2','#a8ad94'][member]:['#858b69','#aaa080','#67775a'][member];c.fillRect(-8,-52,16,35);
      c.fillStyle='#b0ac8c';c.beginPath();c.arc(0,-61,5,0,Math.PI*2);c.fill();
      if(hazmat) {
        c.fillStyle='#c4bca0';c.beginPath();c.ellipse(0,-61,8,10,0,0,Math.PI*2);c.fill();
        c.fillStyle='#27382e';c.fillRect(-8,-65,7,8);c.fillRect(-10,-58,5,4);
        c.fillStyle='#303d31';c.fillRect(-12,-29,5,8);
      } else if(member!==1){c.fillStyle=member===2?'#c0b692':'#617051';c.fillRect(-7,-65,14,5);}
      c.fillStyle='#4d5842';c.fillRect(4,-45,9,19);
      line(c,-4,-17,-7,4,'#69735b',4);line(c,4,-17,7,4,'#69735b',4);c.restore();
    }
    if(light<=0)return;
    c.save();c.globalAlpha=light;
    if(walking&&!this.reduced)c.translate(Math.sin(phase*Math.PI*2)*1.2,Math.cos(phase*Math.PI*2)*.6);
    // Lamp points and small groundward beams belong to the workers, under leaves.
    const glow=c.createRadialGradient(-17,-26,0,-17,-26,13);
    glow.addColorStop(0,'#e4d5a343');glow.addColorStop(1,'#e4d5a300');c.fillStyle=glow;c.fillRect(-30,-39,26,26);
    c.fillStyle='#d9c78e0c';c.beginPath();c.moveTo(-18,-26);c.lineTo(-69,-12);c.lineTo(-59,1);c.closePath();c.fill();
    c.fillStyle='#eee2b5';c.beginPath();c.ellipse(-17,-26,2.2,1.5,-.3,0,Math.PI*2);c.fill();c.restore();
  }
  drawTarget(target) {
    const c=this.c,p=targetProjection(target,this.view),shift=this.scene?.shift||0;
    const phase=this.reduced?.35:((target.direction*p.x/(28*p.size)+target.wobble)%1+1)%1;
    const form=targetArtwork(shift,target);
    c.save();c.translate(p.x,p.y);c.scale(p.size,p.size);
    c.fillStyle='#07120ba0';c.beginPath();c.ellipse(0,4,22,5,0,0,Math.PI*2);c.fill();
    if(target.kind==='person'&&personRole(shift,target)==='retrieval') {
      this.drawRetrievalMember(target.member||0,phase,personLight(shift,this.scene.time,target),form);
    } else if(target.kind==='person') {
      if(!this.drawSprite('dress',this.reduced?0:Math.sin(phase*Math.PI*2)*.012)) {
        const step=this.reduced?0:Math.sin(phase*Math.PI*2)*3;
        line(c,-4,-12,-5+step,3,'#9d9e8a',2);line(c,4,-12,5-step,3,'#9d9e8a',2);
        c.fillStyle='#c6c6b4';c.beginPath();c.moveTo(-5,-58);c.lineTo(-13+step*.2,-8);c.lineTo(13+step*.2,-8);c.lineTo(5,-58);c.fill();
        c.fillStyle='#bbb9a2';c.beginPath();c.arc(0,-65,5,0,Math.PI*2);c.fill();
        c.fillStyle='#262f24';c.fillRect(-6,-70,12,6);
      }
    } else {
      this.drawRoots(target,phase);
      const lean=target.direction*.045+(this.reduced?0:Math.sin(phase*Math.PI*2)*.025);
      if(!this.drawSprite(form,lean,form==='corn'?1.45:1.2)) {
        stalk(c,0,0,1.1,'#aaa66b',lean,true);
        if(form==='corn-teeth') {c.fillStyle='#dcd2ae';for(let i=0;i<4;i++)c.fillRect(2,-50+i*5,4,3);}
        if(form!=='corn')for(let i=-2;i<=2;i++)line(c,i*2,0,i*5,8,'#c5b58e',2.5);
      }
      c.fillStyle='#766445';c.beginPath();c.ellipse(-target.direction*7,6,4,2,0,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
  drawTargetMarker(target,s) {
    const c=this.c,p=targetProjection(target,this.view);
    c.save();c.translate(p.x,p.y);c.scale(p.size,p.size);
    // Markers stay above the canopy so partially hidden crops remain selectable.
    const col=s.focused===target.id?'#f2d694':'#c47756';
    for(const side of [-1,1]) {line(c,side*24,-77,side*15,-77,col,1.5);line(c,side*24,-77,side*24,-67,col,1.5);line(c,side*24,9,side*15,9,col,1.5);}
    if(target.variant==='runner'||target.variant==='husk') {
      const husk=target.variant==='husk';
      c.fillStyle='#111914df';c.fillRect(-29,-101,58,17);
      c.font='bold 9px monospace';c.textAlign='center';c.fillStyle=husk?'#d8c79b':'#dfb878';
      c.fillText(husk?'HUSK':'RUNNER',0,-89);
      if(husk)for(let i=0;i<2;i++) {
        c.strokeStyle='#d8c79b';c.lineWidth=1;c.strokeRect(-7+i*9,-81,5,4);
        if(i<(target.hp??2)){c.fillStyle='#d8c79b';c.fillRect(-7+i*9,-81,5,4);}
      }
      else for(let i=0;i<2;i++) {
        const x=-4+i*8,dir=target.direction||1;
        line(c,x-dir*2,-81,x+dir*2,-78,'#dfb878',1.3);
        line(c,x+dir*2,-78,x-dir*2,-75,'#dfb878',1.3);
      }
    }
    c.restore();
  }
  drawMap(s) {
    const c=this.c;c.fillStyle='#16221c';c.fillRect(0,0,W,H);
    const view=this.view,scale=Math.min(view.width/W,view.height/H)*.94;
    this.mapView={scale,left:480-W*scale/2,top:300-H*scale/2};
    c.save();c.translate(this.mapView.left,this.mapView.top);c.scale(scale,scale);
    const x0=125,y0=74,cell=58;
    c.font='11px monospace';c.fillStyle='#8e9d79';c.textAlign='left';c.fillText('FIELD SURVEY  /  BOOTS ON THE GROUND',42,36);c.textAlign='right';c.fillText('N ↑',916,36);
    for(let y=0;y<9;y++) for(let x=0;x<11;x++) {
      const seen=s.visited.includes(`${x},${y}`),near=Math.abs(s.player.x-x)+Math.abs(s.player.y-y)<=2;
      c.fillStyle=seen?'#334735':near?'#293a2a':'#1d2b20';c.fillRect(x0+x*cell,y0+y*cell,cell-2,cell-2);
      c.strokeStyle='#87916b12';c.strokeRect(x0+x*cell,y0+y*cell,cell-2,cell-2);
      if(!seen) { for(let a=0;a<3;a++)line(c,x0+x*cell+12+a*15,y0+y*cell+13,x0+x*cell+10+a*15,y0+y*cell+43,near?'#76835242':'#76835217',2); }
    }
    FIELD_SITES.forEach(site=>{
      const x=x0+site.x*cell+cell/2,y=y0+site.y*cell+cell/2;
      c.fillStyle=site.id==='corner'?'#c19b6b':'#a5b290';c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill();
      c.strokeStyle='#c6b789';c.strokeRect(x-16,y-16,32,32);
      c.font='10px monospace';c.textAlign='center';c.fillStyle='#e0d8b7';c.fillText(site.label.toUpperCase(),x,y-25);
      if(s.inspected.includes(site.id)){ c.font='14px monospace';c.fillText('✓',x,y+5); }
      else if(site.id!=='tower'){
        // An unread page appears anew each night; inspection replaces it with a check.
        c.fillStyle='#dfc77d';c.fillRect(x+12,y-17,13,17);c.fillStyle='#283728';c.beginPath();c.moveTo(x+21,y-17);c.lineTo(x+25,y-13);c.lineTo(x+21,y-13);c.fill();
        c.strokeStyle='#dfc77d66';c.strokeRect(x-21,y-21,42,42);
      }
    });
    const px=x0+s.player.x*cell+cell/2,py=y0+s.player.y*cell+cell/2;
    c.strokeStyle='#ddd9a67a';c.lineWidth=1;c.beginPath();c.arc(px,py,22,0,Math.PI*2);c.stroke();
    c.fillStyle='#f3e3aa';c.beginPath();c.moveTo(px,py-10);c.lineTo(px+7,py+7);c.lineTo(px,py+3);c.lineTo(px-7,py+7);c.fill();
    c.fillStyle='#9fa888';c.font='11px monospace';c.textAlign='left';c.fillStyle='#dfc77d';c.fillRect(42,563,10,14);c.fillText('UNREAD',61,576);c.fillStyle='#9fa888';c.fillText('✓  SEARCHED',155,576);
    c.restore();
  }
  drawGuide(s) {
    const c=this.c,g=s.guide,aftermath=isGuideAftermath(s);
    c.save();
    // The same field artwork used in the notebook fills the scene.
    // Discoveries stay in view until the player leads onward.
    const discovery=g.stage==='search'&&!g.walking&&GUIDE_SITES.find(site=>Math.hypot(site.x-g.x,site.y-g.y)<.18);
    const plate=discovery?.id||'walk';
    const legStart=[0,2,10][Math.min(g.clues.length,2)],legEnd=[2,10,20][Math.min(g.clues.length,2)];
    const progress=Math.max(0,Math.min(1,(g.routeProgress-legStart)/(legEnd-legStart)));
    const zoom=this.reduced||plate!=='walk'||g.stage!=='search'?1:1+progress*.055;
    if(this.guideScene!==s) {
      this.guideScene=s;this.guidePlate=plate;this.guidePlateFrom=null;this.guidePlateTime=g.time;
    } else if(this.guidePlate!==plate) {
      this.guidePlateFrom=this.guidePlate;this.guidePlateFromZoom=this.guidePlateZoom||1;
      this.guidePlate=plate;this.guidePlateTime=g.time;
    }
    this.guidePlateZoom=zoom;
    const blend=this.reduced||aftermath?1:Math.max(0,Math.min(1,(g.time-this.guidePlateTime)/.65));
    c.fillStyle='#17231b';c.fillRect(0,0,W,H);
    if(this.guidePlateFrom&&blend<1)this.drawGuidePlate(this.guidePlateFrom,this.guidePlateFromZoom);
    c.globalAlpha=this.guidePlateFrom?blend:1;
    this.drawGuidePlate(plate,zoom);c.globalAlpha=1;
    if(blend===1)this.guidePlateFrom=null;
    const figures=g.team.filter(person=>person.status!=='escaped')
      .map(person=>({person,p:projectGuide(g,person)})).filter(figure=>figure.p)
      .sort((a,b)=>a.p.y-b.p.y);
    for(const {person,p} of figures)this.drawGuideMember(person,p,g);
    if(g.stage==='escape'){
      if(!aftermath){
      const p=this.pointer;c.strokeStyle='#d6cfad';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.stroke();
      // Slow fades, with a steady equivalent for reduced-motion preferences.
      c.globalAlpha=this.reduced ? .8 :Math.max(0,Math.sin(g.time*.55-.8))*.85;
      c.fillStyle='#c65b4f';c.font='22px Georgia';c.textAlign='center';c.fillText('shoot any that try to escape.',480,112);c.globalAlpha=1;
      }
    }
    c.restore();
  }
  drawGuideMember(person,p,g) {
    const c=this.c,size=p.height/76,center=p.spriteX??p.x;
    c.save();
    // Bodies keep their scale as the people cross the track. An irregular edge
    // of the illustrated row conceals each person during the final steps.
    if(p.concealment>0) {
      const half=p.height*(person.id===3?32:36)/76/2;
      const left=center-half,right=center+half;
      const edge=p.exitSide<0?left+half*2*p.concealment:right-half*2*p.concealment;
      const outer=p.exitSide<0?right+18:left-18;
      const top=p.y-p.height-12,bottom=p.y+12;
      c.beginPath();c.moveTo(outer,top);c.lineTo(edge,top);
      for(let y=top;y<bottom;y+=9)c.lineTo(edge+Math.sin(y*.43+person.id)*3,y);
      c.lineTo(edge,bottom);c.lineTo(outer,bottom);c.closePath();c.clip();
    }
    c.save();c.translate(center,p.y+1);c.scale(1,.18);
    const shadow=c.createRadialGradient(0,0,0,0,0,(p.fullWidth||p.width)*.65);
    shadow.addColorStop(0,'#050c08a0');shadow.addColorStop(1,'#050c0800');
    c.fillStyle=shadow;c.fillRect(-p.height*.3,-p.height*.3,p.height*.6,p.height*.6);c.restore();
    if(person.status==='shot') {
      c.translate(center-p.height*.27,p.y);c.scale(size*.72,size*.22);c.rotate(Math.PI/2);
      if(!this.drawSprite(`retrieval-${person.id-1}`,0,.55)){c.fillStyle='#74765c';c.fillRect(-10,-60,20,58);}
    } else {
      c.translate(center,p.y-4*size);c.scale(p.exitSide>0?-size:size,size);
      const phase=this.reduced?.35:Number.isFinite(p.gait)?p.gait/(Math.PI*2):g.time*.6+person.id;
      this.drawRetrievalMember(person.id-1,phase,1,`retrieval-${person.id-1}`,true);
    }
    c.restore();
  }
  drawGuidePlate(key,zoom=1) {
    const image=this.guidePlates[key],plate=GUIDE_PLATES[key];
    if(!image?.complete||!image.naturalWidth)return;
    const view=this.view||{left:0,top:0,width:W,height:H};
    const scale=Math.max(view.width/image.naturalWidth,view.height/image.naturalHeight)*zoom;
    const width=view.width/scale,height=view.height/scale;
    // Crop around the actual clue on portrait screens instead of cropping an
    // already-composed landscape canvas a second time.
    const x=Math.max(0,Math.min(image.naturalWidth-width,plate.x*image.naturalWidth-width/2));
    const y=Math.max(0,Math.min(image.naturalHeight-height,plate.y*image.naturalHeight-height/2));
    this.c.drawImage(image,x,y,width,height,view.left,view.top,view.width,view.height);
  }
  coords(event) {
    const r=this.canvas.getBoundingClientRect(),view=cameraFor(r.width,r.height);
    const point={x:view.left+(event.clientX-r.left)/view.scale,y:view.top+(event.clientY-r.top)/view.scale};
    if(this.scene?.phase==='tower') {
      for(const target of [...this.scene.targets].reverse()) {
        const p=targetProjection(target,view);
        const dx=(point.x-p.x)/p.size,dy=(point.y-p.y)/p.size;
        const padding=event.pointerType==='touch'?Math.max(0,22/view.scale/p.size-24):0;
        if((dx/(24+padding))**2+((dy+34)/(45+padding))**2<=1)
          return {x:target.x+dx,y:target.y+dy,view:point};
      }
      return {x:-1000,y:-1000,view:point};
    }
    if(this.scene?.phase==='field'&&this.mapView)
      return {x:(point.x-this.mapView.left)/this.mapView.scale,y:(point.y-this.mapView.top)/this.mapView.scale};
    if(this.scene?.phase==='guide'&&event.pointerType==='touch') {
      // A distant lamp is smaller than a fingertip. Keep the same 44px touch
      // target as the tower, while leaving mouse aim and game rules precise.
      const radius=22/view.scale;
      const target=this.scene.guide.team.filter(t=>t.status==='running')
        .map(t=>visibleGuideTarget(this.scene.guide,t,view)).filter(Boolean)
        .filter(p=>Math.abs(point.x-p.x)<=Math.max(18,p.width/2,radius)&&Math.abs(point.y-(p.y-p.height*.5))<=Math.max(p.height/2,radius))
        .sort((a,b)=>a.distance-b.distance)[0];
      if(target)return {x:target.x,y:target.y-target.height*.5};
    }
    return point;
  }
}
