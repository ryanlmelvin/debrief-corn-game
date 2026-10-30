import { guideWall, GUIDE_SITES, projectGuide } from './guide.js';
import { FIELD_SITES } from './engine.js';

const W = 960, H = 600;
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
    line(c,0,-3,-15,8,'#c2b88a',2); line(c,0,-3,14,7,'#c2b88a',2);
    c.fillStyle='#111b16'; for(let i=0;i<3;i++) c.fillRect(2,-48+i*5,4,2);
  }
  c.restore();
}
export class Renderer {
  constructor(canvas) {
    this.canvas=canvas; this.c=canvas.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1,2); canvas.width=W*dpr; canvas.height=H*dpr;
    this.c.scale(dpr,dpr); this.pointer={x:480,y:330}; this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.background=document.createElement('canvas'); this.background.width=W; this.background.height=H;
    this.paintLandscape(this.background.getContext('2d'));
  }
  paintLandscape(c) {
    const random=rng(40130);
    const sky=c.createLinearGradient(0,0,0,310); sky.addColorStop(0,'#101e1d'); sky.addColorStop(.55,'#3f5149'); sky.addColorStop(1,'#b2a875');
    c.fillStyle=sky; c.fillRect(0,0,W,H);
    c.fillStyle='#d9d6ae'; c.beginPath(); c.arc(760,99,23,0,Math.PI*2); c.fill();
    c.fillStyle='#34483f'; c.beginPath(); c.arc(751,92,22,0,Math.PI*2); c.fill();
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
    c.fillStyle='#af9a57'; c.fillRect(679,226,8,13);c.fillRect(702,226,8,13);
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
    for(let depth=0;depth<25;depth++) {
      const d=depth/24,y=281+d*d*340,size=.13+d*.72;
      for(let col=-19;col<=19;col++) {
        const x=480+col*(13+d*39)+(random()-.5)*8;
        stalk(c,x,y+random()*9,size,['#55623b','#646b3e','#747444','#4b5934'][Math.floor(random()*4)],(random()-.5)*.2);
      }
    }
    const haze=c.createLinearGradient(0,235,0,370);haze.addColorStop(0,'#aaa87b00');haze.addColorStop(.35,'#c3bb8e35');haze.addColorStop(1,'#aaa87b00');c.fillStyle=haze;c.fillRect(0,235,W,140);
    // Grain is painted once; the game does not flicker.
    for(let i=0;i<20000;i++) { c.fillStyle=random()>.5?'#efe7b507':'#0000000b';c.fillRect(random()*W,random()*H,1,1); }
    const vignette=c.createRadialGradient(480,310,170,480,310,620);vignette.addColorStop(0,'#08110d00');vignette.addColorStop(1,'#08110dc9');c.fillStyle=vignette;c.fillRect(0,0,W,H);
  }
  draw(s,now,title=false) {
    const c=this.c; c.clearRect(0,0,W,H);
    if(s?.phase==='guide') { this.drawGuide(s); return; }
    if(s?.phase==='field') { this.drawMap(s); return; }
    c.drawImage(this.background,0,0);
    const t=this.reduced?0:now/1000;
    c.save();
    // Thin drifting mist rather than flashes or screen shake.
    for(let i=0;i<3;i++) {
      const x=120+Math.sin(t*.07+i)*170+i*260;
      const fog=c.createRadialGradient(x,335+i*25,0,x,335+i*25,200);
      fog.addColorStop(0,'#d0cba70a');fog.addColorStop(1,'#d0cba700');c.fillStyle=fog;c.fillRect(0,220,W,300);
    }
    if(s && !title) {
      for(const target of [...s.targets].sort((a,b)=>a.y-b.y)) this.drawTarget(target,t,s);
      if(s.shift>0) { c.fillStyle=`rgba(8,18,18,${s.shift*.08})`;c.fillRect(0,0,W,H); }
    }
    // Watchtower frame and its worn sill.
    c.fillStyle='#0e1712'; c.fillRect(0,0,18,H);c.fillRect(942,0,18,H);c.fillRect(0,556,W,44);
    c.fillStyle='#30372a';c.fillRect(0,554,W,6);c.fillStyle='#414332';c.fillRect(0,553,W,1);
    for(let x=0;x<W;x+=130)line(c,x,561,x-15,600,'#080f0b',2);
    c.strokeStyle='#68705250';c.lineWidth=1;c.strokeRect(31,30,898,501);
    c.fillStyle='#bdc19d';c.font='10px monospace';c.textAlign='left';c.fillText('STATION 04  /  NORTH FIELD',47,51);
    c.textAlign='right';c.fillText('41° —′ N   89° —′ W',913,51);
    c.textAlign='left';c.fillStyle='#a8b38d';c.fillText('N',477,42);line(c,480,49,480,62,'#a8b38d');
    if(s?.phase==='tower'&&!title) {
      const {x,y}=this.pointer;
      c.strokeStyle=s.reload?'#d6af69':'#e3dfb9';c.lineWidth=1;
      c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.stroke();
      for(const d of [-1,1]) { line(c,x+d*5,y,x+d*20,y,'#e3dfb9');line(c,x,y+d*5,x,y+d*20,'#e3dfb9'); }
      if(s.lastShot && s.time-s.lastShot.time<.16) {
        const p=s.lastShot;c.strokeStyle='#d8ba75';c.beginPath();c.arc(p.x,p.y,20+(s.time-p.time)*80,0,Math.PI*2);c.stroke();
      }
      if(s.shift>0 && s.time>35 && s.time<44){c.save();c.globalAlpha=this.reduced ? .6 :Math.sin((s.time-35)/9*Math.PI)*.6;c.fillStyle=s.shift===2?'#b56554':'#bcc09a';c.font='17px Georgia';c.textAlign='center';c.fillText('Watch the corn. Shoot any that try to escape.',480,110);c.restore();}
      c.fillStyle='#ddd5ad';c.font='11px monospace';c.fillText(s.reload?'RELOADING':`${String(s.rounds).padStart(2,'0')} / ${String(s.reserve).padStart(2,'0')}   .22 RIFLE`,47,582);

    }
    c.restore();
  }
  drawTarget(target,t,s) {
    const c=this.c,{x,y}=target;const sway=Math.sin(t*4+target.wobble)*.08;
    c.fillStyle='#07120b75';c.beginPath();c.ellipse(x,y+5,25,6,0,0,Math.PI*2);c.fill();
    if(target.kind==='person') {
      c.fillStyle='#c6c6b4';c.beginPath();c.moveTo(x-5,y-37);c.lineTo(x-13,y-2);c.lineTo(x+13,y-2);c.lineTo(x+5,y-37);c.fill();
      c.fillStyle='#bbb9a2';c.beginPath();c.arc(x,y-44,5,0,Math.PI*2);c.fill();
      c.fillStyle='#262f24';c.fillRect(x-6,y-49,12,6);line(c,x-4,y-2,x-5,y+4,'#c6c6b4',2);line(c,x+4,y-2,x+6,y+4,'#c6c6b4',2);
    } else {
      stalk(c,x,y,1.1,'#aaa66b',sway,true);
      // Red corner markers remain visible for mouse, keyboard and touch players.
      const col=s.focused===target.id?'#f2d694':'#c47756';
      for(const side of [-1,1]) { line(c,x+side*24,y-77,x+side*15,y-77,col,1.5);line(c,x+side*24,y-77,x+side*24,y-67,col,1.5);line(c,x+side*24,y+9,x+side*15,y+9,col,1.5); }
    }
  }
  drawMap(s) {
    const c=this.c;c.fillStyle='#16221c';c.fillRect(0,0,W,H);
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
  }
  drawGuide(s) {
    const c=this.c,g=s.guide;
    c.save();
    const sky=c.createLinearGradient(0,0,0,300);sky.addColorStop(0,'#080f0e');sky.addColorStop(1,'#394338');c.fillStyle=sky;c.fillRect(0,0,W,300);
    const soil=c.createLinearGradient(0,300,0,H);soil.addColorStop(0,'#2d3324');soil.addColorStop(1,'#111b15');c.fillStyle=soil;c.fillRect(0,300,W,300);
    // Ray-cast corn rows give the walk depth without changing the tower landscape.
    for(let x=0;x<W;x+=4){
      const offset=Math.atan((x-480)/640),angle=g.angle+offset;
      let d=.05;
      while(d<18&&!guideWall(g.x+Math.cos(angle)*d,g.y+Math.sin(angle)*d))d+=.045;
      const depth=Math.max(.15,d*Math.cos(offset)),height=Math.min(900,620/depth);
      const wx=g.x+Math.cos(angle)*d,wy=g.y+Math.sin(angle)*d;
      const grain=(Math.sin(wx*41)+Math.cos(wy*43))*.5;
      const light=Math.max(12,66-depth*5+grain*9);
      c.fillStyle=`rgb(${light*.85},${light},${light*.57})`;c.fillRect(x,300-height/2,4,height);
      if(Math.floor((wx+wy)*12)%3===0){c.fillStyle='#a4a56b18';c.fillRect(x,300-height*.45,2,height*.85);}
      if(x%16===0){for(let leaf=0;leaf<4;leaf++){const yy=300-height*.3+leaf*height*.17,span=Math.min(42,height*.12),side=leaf%2?1:-1;c.fillStyle='#81935c20';c.beginPath();c.moveTo(x,yy);c.quadraticCurveTo(x+side*span,yy-span*.9,x+side*span,yy-span*.3);c.quadraticCurveTo(x+side*span*.3,yy,x,yy+5);c.fill();}}
    }
    const site=GUIDE_SITES[g.clues.length];
    if(site){const p=projectGuide(g,site);if(p){const size=Math.max(6,50/Math.max(1,p.distance));c.fillStyle='#aaa27c';
      if(site.id==='radio'){c.fillRect(p.x-size/2,p.y-size*.6,size,size*.6);line(c,p.x+size*.25,p.y-size*.6,p.x+size*.4,p.y-size*1.3,'#b5ba98',2);c.fillStyle='#1a251d';c.fillRect(p.x-size*.3,p.y-size*.4,size*.5,size*.15);}
      else{for(let i=0;i<(site.id==='corner'?6:2);i++){c.beginPath();c.ellipse(p.x+(i%2?size*.3:-size*.3),p.y-i*size*.15,size*.15,size*.3,.3,0,Math.PI*2);c.fill();}}
    }}
    for(const person of [...g.team].sort((a,b)=>Math.hypot(b.x-g.x,b.y-g.y)-Math.hypot(a.x-g.x,a.y-g.y))){
      const p=projectGuide(g,person);if(!p||person.status==='escaped')continue;
      if(person.status==='shot'){c.fillStyle='#8b8461';c.fillRect(p.x-p.width*.6,p.y-4,p.width*1.2,5);continue;}
      c.fillStyle='#aaa993';c.fillRect(p.x-p.width*.24,p.y-p.height*.75,p.width*.48,p.height*.48);
      c.beginPath();c.arc(p.x,p.y-p.height*.86,p.width*.23,0,Math.PI*2);c.fill();
      line(c,p.x-p.width*.12,p.y-p.height*.28,p.x-p.width*.24,p.y,'#777d69',Math.max(2,p.width*.13));
      line(c,p.x+p.width*.12,p.y-p.height*.28,p.x+p.width*.24,p.y,'#777d69',Math.max(2,p.width*.13));
      c.fillStyle='#e2cea0';c.fillRect(p.x+p.width*.42,p.y-p.height*.5,Math.max(3,p.width*.13),Math.max(4,p.height*.09));
    }
    const vignette=c.createRadialGradient(480,320,40,480,320,480);vignette.addColorStop(0,'#02080500');vignette.addColorStop(.65,'#02080560');vignette.addColorStop(1,'#020805f2');c.fillStyle=vignette;c.fillRect(0,0,W,H);
    c.fillStyle='#afba98';c.font='11px monospace';c.textAlign='left';
    const compass=['E','S','W','N'][((Math.round(g.angle/(Math.PI/2))%4)+4)%4];
    c.fillText(`RECOVERY DETAIL  /  ${compass}`,35,36);
    if(g.stage==='escape'){
      const p=this.pointer;c.strokeStyle='#d6cfad';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.stroke();
      // Slow fades, with a steady equivalent for reduced-motion preferences.
      c.globalAlpha=this.reduced ? .8 :Math.max(0,Math.sin(g.time*.55-.8))*.85;
      c.fillStyle='#c65b4f';c.font='22px Georgia';c.textAlign='center';c.fillText('shoot any that try to escape.',480,112);c.globalAlpha=1;
      c.fillStyle='#191f18';c.beginPath();c.moveTo(620,600);c.lineTo(493,401);c.lineTo(483,401);c.lineTo(535,600);c.fill();
    }
    c.fillStyle='#d4d2b7';c.font='15px Georgia';c.textAlign='center';
    const words=g.message.split(' ');let row='',y=533;
    for(const word of words){if(c.measureText(row+word).width>730){c.fillText(row,480,y);y+=22;row='';}row+=word+' ';}c.fillText(row,480,y);
    c.restore();
  }
  coords(event) {
    const r=this.canvas.getBoundingClientRect(),scale=Math.min(r.width/W,r.height/H);
    return {x:(event.clientX-r.left-(r.width-W*scale)/2)/scale,y:(event.clientY-r.top-(r.height-H*scale)/2)/scale};
  }
}
