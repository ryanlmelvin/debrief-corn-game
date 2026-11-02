import * as THREE from './vendor/three/three.module.js';
import { cornHazards } from './rogue.js';

// A view of the published crossing simulation. Grid positions, hit boxes,
// invulnerability, traffic and rifle timing all remain owned by rogue.js.
const SAFE_ROWS = new Set([0,4,8]);
const HOP_TIME = .13;
const cellX = x => x-5;
const cellZ = y => y-4;
const random = initial => {let seed=initial;return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);};

function artwork(file) {
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not load ${file}`));
    image.src=new URL(`./assets/${file}`,import.meta.url).href;
  });
}
function paintedTexture(width,height,paint) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function roughTexture(base,light,dark,seed) {
  return paintedTexture(256,256,(context,w,h)=>{
    const rng=random(seed);context.fillStyle=base;context.fillRect(0,0,w,h);
    for(let i=0;i<8500;i++) {
      context.globalAlpha=.08+rng()*.24;context.fillStyle=i%3?dark:light;
      context.fillRect(rng()*w,rng()*h,.7+rng()*2,.6+rng()*2);
    }
    context.globalAlpha=.22;context.strokeStyle=dark;context.lineWidth=.65;
    for(let i=0;i<90;i++) {
      const x=rng()*w,y=rng()*h;context.beginPath();context.moveTo(x,y);context.lineTo(x+rng()*14-5,y+rng()*8);context.stroke();
    }
  });
}

export async function createCornWorld(canvas) {
  const [cornImage,characterImage]=await Promise.all([artwork('watch-corn.webp'),artwork('watch-human-anatomy.webp')]);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#22302a');
  scene.fog=new THREE.Fog('#22302a',26,52);
  // Give each row more visible depth on a narrow screen. This one transform
  // applies equally to the ground, cover, player and authoritative hazard poses.
  scene.scale.z=1.45;
  const camera=new THREE.OrthographicCamera(-8,8,7,-7,.1,65);
  camera.position.set(0,17,13);camera.lookAt(0,0,-.2);camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight('#d6d7ac','#26301f',2.15));
  const sun=new THREE.DirectionalLight('#ecd5a4',2.3);sun.position.set(-9,16,-8);scene.add(sun);
  const fill=new THREE.DirectionalLight('#8faaa0',.48);fill.position.set(8,6,12);scene.add(fill);

  const geometries=new Set(),materials=new Set(),textures=new Set();
  const geometry=item=>(geometries.add(item),item);
  const material=item=>(materials.add(item),item);
  const texture=item=>(textures.add(item),item);
  const dirt=texture(roughTexture('#76765a','#a7a187','#37432d',431));
  const asphalt=texture(roughTexture('#555952','#888b7d','#28312b',144));
  const grass=texture(roughTexture('#8b9167','#b5b487','#455333',323));
  const worn=texture(roughTexture('#b5af8c','#e1d8b5','#575e45',629));
  for(const map of [dirt,asphalt,grass]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(4,1);}
  const earthMaterial=material(new THREE.MeshLambertMaterial({map:dirt,color:'#b6ad87'}));
  const safeMaterial=material(new THREE.MeshLambertMaterial({map:grass,color:'#b1b181'}));
  const shoulderMaterial=material(new THREE.MeshLambertMaterial({map:dirt,color:'#8f9271'}));
  const roadMaterial=material(new THREE.MeshLambertMaterial({map:asphalt,color:'#b1b4a6'}));
  const laneAltMaterial=material(new THREE.MeshLambertMaterial({map:asphalt,color:'#969f8f'}));
  const woodMaterial=material(new THREE.MeshLambertMaterial({map:worn,color:'#69684e'}));
  const paintMaterial=material(new THREE.MeshLambertMaterial({color:'#b6b08a'}));
  const unitBox=geometry(new THREE.BoxGeometry(1,1,1));
  function box(parent,mat,w,h,d,x,y,z) {
    const mesh=new THREE.Mesh(unitBox,mat);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  box(scene,shoulderMaterial,90,.4,90,0,-.45,0);
  const board=new THREE.Group();scene.add(board);
  box(board,earthMaterial,11.5,.35,9.5,0,-.22,0);
  const field=new THREE.Group(),road=new THREE.Group();board.add(field,road);
  const laneGeometry=geometry(new THREE.BoxGeometry(11,.07,1));
  const fineDirtMaterial=material(new THREE.MeshLambertMaterial({map:dirt,color:'#989e73'}));
  const waterMaterial=material(new THREE.MeshBasicMaterial({color:'#aab79d',transparent:true,opacity:.16,depthWrite:false}));
  const safeScratchMaterial=material(new THREE.MeshBasicMaterial({color:'#c0ba8e',transparent:true,opacity:.14,depthWrite:false}));
  const laneScratchMaterial=material(new THREE.MeshBasicMaterial({color:'#a6a278',transparent:true,opacity:.18,depthWrite:false}));
  const lineGeometry=geometry(new THREE.PlaneGeometry(1,1));
  function flat(parent,mat,w,d,x,z,y=.045) {
    const mesh=new THREE.Mesh(lineGeometry,mat);mesh.rotation.x=-Math.PI/2;mesh.scale.set(w,d,1);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  for(let row=0;row<=8;row++) {
    const safe=SAFE_ROWS.has(row),z=cellZ(row);
    const soil=new THREE.Mesh(laneGeometry,safe?safeMaterial:row%2?earthMaterial:fineDirtMaterial);
    soil.position.set(0,-.015,z);field.add(soil);
    const strip=new THREE.Mesh(laneGeometry,safe?safeMaterial:row%2?roadMaterial:laneAltMaterial);
    strip.position.set(0,-.015,z);road.add(strip);
    if(row===4) {
      // A shallow drainage furrow is safe cover, never an occluding wall.
      flat(field,material(new THREE.MeshLambertMaterial({color:'#2c3b2b'})),11,.25,0,z,.024);
      flat(field,waterMaterial,10.8,.12,0,z,.028);
      box(road,safeMaterial,11,.10,.76,0,.02,z);
    }
    // Faint scratches show the step spacing without turning the scene into a HUD.
    for(let x=-5;x<=5;x++)if(safe) {
      flat(field,safeScratchMaterial,.16,.035,x,z+.27,.032);
    }
    if(!safe)for(let x=-5.1;x<5.4;x+=.8) {
      flat(field,laneScratchMaterial,.26,.015,x,z+.48,.032);
    }
    if(row<8) {
      const edge=safe||SAFE_ROWS.has(row+1),zLine=z+.5;
      if(edge)flat(road,paintMaterial,10.95,.035,0,zLine,.035);
      else for(let x=-5.1;x<5.4;x+=1.1)flat(road,paintMaterial,.5,.025,x,zLine,.035);
    }
  }

  // Ordinary field hardware gives depth at the edges; nothing stands in a lane.
  for(const side of [-1,1]) {
    for(const z of [-4.4,-.45,.45,4.4]) {
      box(field,woodMaterial,.10,.55,.12,side*5.78,.20,z);
      box(field,woodMaterial,.045,.035,.65,side*5.78,.34,z);
    }
    for(const z of [-4.4,4.4]) {
      box(road,woodMaterial,.11,.42,.12,side*5.77,.16,z);
      box(road,paintMaterial,.12,.075,.13,side*5.77,.3,z);
    }
  }
  const cornMap=texture(paintedTexture(192,384,c=>c.drawImage(cornImage,29,4,233,499,0,0,192,384)));
  const cornMaterial=material(new THREE.MeshLambertMaterial({map:cornMap,color:'#7e8758',side:THREE.DoubleSide,alphaTest:.2}));
  const plants=[];const rng=random(7263);
  for(let x=-8;x<8;x+=.46)for(let z=-7;z<7;z+=.5) {
    if(Math.abs(x)<6.05&&z>-5.05&&z<5.05)continue;
    // Tall plants stay behind or beside the board; the foreground is low stubble.
    if(z>4.8&&Math.abs(x)<6.8)continue;
    plants.push({x:x+(rng()-.5)*.18,z:z+(rng()-.5)*.18,h:1.1+rng()*.7,angle:rng()*Math.PI});
  }
  const stalks=new THREE.InstancedMesh(geometry(new THREE.PlaneGeometry(1,1)),cornMaterial,plants.length*2);
  const matrix=new THREE.Object3D();
  plants.forEach((plant,index)=>{
    for(let cross=0;cross<2;cross++) {
      matrix.position.set(plant.x,plant.h/2,plant.z);matrix.scale.set(plant.h*.44,plant.h,1);matrix.rotation.set(0,plant.angle+cross*Math.PI/2,0);matrix.updateMatrix();stalks.setMatrixAt(index*2+cross,matrix.matrix);
    }
  });stalks.instanceMatrix.needsUpdate=true;scene.add(stalks);

  const shadowMap=texture(paintedTexture(128,128,(c,w,h)=>{
    const gradient=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);gradient.addColorStop(0,'rgba(4,12,7,.75)');gradient.addColorStop(.5,'rgba(4,12,7,.35)');gradient.addColorStop(1,'rgba(4,12,7,0)');c.fillStyle=gradient;c.fillRect(0,0,w,h);
  }));
  const shadowMaterial=material(new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,opacity:.85,depthWrite:false}));
  const playerShadow=flat(scene,shadowMaterial,.95,.58,0,4,.065);
  const characterMap=texture(paintedTexture(304,580,c=>c.drawImage(characterImage,683,0,608,1160,0,0,304,580)));
  const characterMaterial=material(new THREE.SpriteMaterial({map:characterMap,color:'#ded7b3',alphaTest:.15,fog:true}));
  const player=new THREE.Sprite(characterMaterial);player.center.set(.5,0);player.scale.set(.88,1.68,1);scene.add(player);
  const markerMat=material(new THREE.MeshBasicMaterial({color:'#c6c88a',transparent:true,opacity:.72,depthWrite:false}));
  const marker=new THREE.Mesh(geometry(new THREE.RingGeometry(.24,.29,28)),markerMat);marker.rotation.x=-Math.PI/2;marker.position.y=.074;scene.add(marker);
  // Landing dust only follows successful movement. It never changes hit timing.
  const dustGeometry=geometry(new THREE.BufferGeometry());
  const dustPositions=new Float32Array(14*3);dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dustMaterial=material(new THREE.PointsMaterial({color:'#a8a17b',size:.035,transparent:true,opacity:0,depthWrite:false}));
  const dust=new THREE.Points(dustGeometry,dustMaterial);scene.add(dust);
  let dustAge=1,dustAt={x:0,z:4};

  const bulletCore=material(new THREE.MeshBasicMaterial({color:'#fff0ba'}));
  const bulletMetal=material(new THREE.MeshLambertMaterial({color:'#ab8650'}));
  const bulletTrail=material(new THREE.MeshBasicMaterial({color:'#d7b575',transparent:true,opacity:.35,depthWrite:false}));
  const bulletGeo=geometry(new THREE.CylinderGeometry(.025,.043,.30,6));
  const wheelGeo=geometry(new THREE.CylinderGeometry(.115,.115,.075,10));
  const tireMaterial=material(new THREE.MeshLambertMaterial({color:'#171f1b'}));
  const hubMaterial=material(new THREE.MeshLambertMaterial({color:'#777666'}));
  const windowMaterial=material(new THREE.MeshLambertMaterial({color:'#1c302d'}));
  const headlightMaterial=material(new THREE.MeshBasicMaterial({color:'#e5cd8c'}));
  const tailMaterial=material(new THREE.MeshBasicMaterial({color:'#944d36'}));
  const chromeMaterial=material(new THREE.MeshLambertMaterial({color:'#999781'}));
  const carPaint=['#656a51','#877f64','#58635c','#7b684e','#717364','#4c5a4a'].map(color=>material(new THREE.MeshLambertMaterial({map:worn,color})));
  const hazards=new Map();
  function makeBullet() {
    const group=new THREE.Group();
    const round=new THREE.Mesh(bulletGeo,bulletMetal);round.rotation.z=-Math.PI/2;round.position.set(.04,.22,0);group.add(round);
    box(group,bulletCore,.30,.055,.055,.08,.22,0);
    box(group,bulletTrail,.38,.025,.045,-.18,.22,0);
    // The shadow sits directly below the round, making its lane unmistakable.
    flat(group,shadowMaterial,.48,.16,0,0,.068);
    return group;
  }
  function makeCar(lane) {
    const group=new THREE.Group(),paint=carPaint[lane%carPaint.length];
    flat(group,shadowMaterial,2.04,.88,0,0,.062);
    box(group,tireMaterial,1.63,.12,.51,0,.15,0);
    box(group,paint,1.8,.21,.60,0,.27,0);
    box(group,chromeMaterial,1.84,.045,.63,0,.20,0);
    // Low six-sided cab, with sloped glass instead of a toy box on another box.
    const shape=new THREE.Shape();shape.moveTo(-.56,.36);shape.lineTo(-.34,.61);shape.lineTo(.23,.61);shape.lineTo(.50,.36);shape.closePath();
    const cab=new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(shape,{depth:.50,bevelEnabled:false,steps:1})),paint);cab.position.z=-.25;group.add(cab);
    const glassShape=new THREE.Shape();glassShape.moveTo(-.46,.39);glassShape.lineTo(-.30,.57);glassShape.lineTo(.19,.57);glassShape.lineTo(.39,.39);glassShape.closePath();
    const glassGeo=geometry(new THREE.ShapeGeometry(glassShape));
    for(const side of [-1,1]) {
      const glass=new THREE.Mesh(glassGeo,windowMaterial);glass.position.z=side*.253;glass.material.side=THREE.DoubleSide;group.add(glass);
      box(group,paint,.035,.20,.016,-.05,.49,side*.262);
      box(group,chromeMaterial,.13,.017,.019,-.18,.34,side*.31);
      for(const x of [-.57,.59]) {
        const wheel=new THREE.Mesh(wheelGeo,tireMaterial);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.13,side*.32);group.add(wheel);
        const hub=new THREE.Mesh(wheelGeo,hubMaterial);hub.rotation.x=Math.PI/2;hub.scale.set(.48,.99,.48);hub.position.set(x,.13,side*.359);group.add(hub);
      }
      box(group,headlightMaterial,.025,.07,.12,.911,.30,side*.19);
      box(group,tailMaterial,.024,.06,.10,-.911,.29,side*.19);
    }
    // Glass follows the sloped cab faces, with the same worn paint around it.
    for(const [lowX,highX] of [[.45,.26],[-.51,-.32]]) {
      const paneGeometry=geometry(new THREE.BufferGeometry());
      paneGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
        lowX,.405,-.225,lowX,.405,.225,highX,.575,.225,highX,.575,-.225
      ],3));
      paneGeometry.setIndex([0,1,2,0,2,3]);paneGeometry.computeVertexNormals();
      group.add(new THREE.Mesh(paneGeometry,windowMaterial));
    }
    box(group,paint,.54,.035,.47,-.05,.627,0);
    box(group,paint,.65,.045,.54,.55,.394,0);
    box(group,paint,.32,.04,.54,-.72,.394,0);
    return group;
  }
  let lastGame=null,lastCrossing=-1,lastHits=0,lastTime=0,disposed=false;
  let lastX=5,lastY=8,visualX=0,visualZ=4,fromX=0,fromZ=4,hopAge=HOP_TIME,hopDirection=0;
  function resize() {
    if(disposed)return;
    const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    renderer.setSize(width,height,false);
    const aspect=width/height,halfHeight=Math.max(6.05,6.65/aspect);
    camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();
  }
  function render(game,dt=0,{paused=false}={}) {
    if(disposed)return;
    const r=game?.rogue;if(!r||r.route!=='corn')return;
    const reset=lastGame!==game||lastCrossing!==r.crossing||r.time<lastTime||r.hits!==lastHits;
    const roadCrossing=r.patternVersion===2&&r.crossing===2;
    road.visible=roadCrossing;field.visible=!roadCrossing;
    if(reset) {
      fromX=visualX=cellX(r.x);fromZ=visualZ=cellZ(r.y);hopAge=HOP_TIME;dustAge=1;
      lastX=r.x;lastY=r.y;
    } else if(lastX!==r.x||lastY!==r.y) {
      fromX=visualX;fromZ=visualZ;hopDirection=Math.sign(r.x-lastX);hopAge=0;
      lastX=r.x;lastY=r.y;
    }
    const step=paused?0:Math.min(.05,Math.max(0,dt));
    const previousHop=hopAge;hopAge=Math.min(HOP_TIME,hopAge+step);
    const amount=reduced?1:Math.min(1,hopAge/HOP_TIME),ease=1-(1-amount)*(1-amount);
    visualX=THREE.MathUtils.lerp(fromX,cellX(r.x),ease);visualZ=THREE.MathUtils.lerp(fromZ,cellZ(r.y),ease);
    const hop=reduced?0:Math.sin(amount*Math.PI)*.28;
    player.position.set(visualX,.075+hop,visualZ);
    characterMaterial.rotation=reduced?0:-Math.sin(amount*Math.PI)*hopDirection*.08;
    characterMaterial.opacity=r.immuneUntil>r.time?.65:1;
    playerShadow.position.set(visualX,.065,visualZ);playerShadow.scale.set(.95-hop*.5,.58-hop*.3,1);shadowMaterial.opacity=.85;
    marker.position.set(cellX(r.x),.074,cellZ(r.y));marker.material.opacity=SAFE_ROWS.has(r.y)?.68:.34;
    if(!reduced&&previousHop<HOP_TIME&&hopAge>=HOP_TIME){dustAt={x:visualX,z:visualZ};dustAge=0;}
    dustAge=Math.min(1,dustAge+step*2.5);dustMaterial.opacity=(1-dustAge)*.38;
    for(let i=0;i<14;i++) {
      const a=i/14*Math.PI*2,radius=.12+dustAge*(.22+(i%3)*.035);
      dustPositions[i*3]=dustAt.x+Math.cos(a)*radius;dustPositions[i*3+1]=.08+Math.sin(dustAge*Math.PI)*(.035+(i%4)*.02);dustPositions[i*3+2]=dustAt.z+Math.sin(a)*radius*.65;
    }
    dustGeometry.attributes.position.needsUpdate=true;
    for(const node of hazards.values())node.visible=false;
    for(const hazard of cornHazards(game)) {
      let node=hazards.get(hazard.id);
      if(!node){node=hazard.kind==='car'?makeCar(Math.max(0,hazard.y-1)):makeBullet();hazards.set(hazard.id,node);scene.add(node);}
      node.visible=true;node.position.set(cellX(hazard.x),0,cellZ(hazard.y));node.rotation.y=hazard.direction<0?Math.PI:0;
      if(hazard.kind==='car')node.scale.x=hazard.width/1.8;
    }
    lastGame=game;lastCrossing=r.crossing;lastHits=r.hits;lastTime=r.time;
    renderer.render(scene,camera);
  }
  function dispose() {
    if(disposed)return;
    disposed=true;
    stalks.dispose();
    for(const item of geometries)item.dispose();for(const item of materials)item.dispose();for(const item of textures)item.dispose();
    hazards.clear();scene.clear();lastGame=null;renderer.dispose();
  }
  resize();return {render,resize,dispose};
}
