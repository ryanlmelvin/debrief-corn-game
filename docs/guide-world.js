// Three.js 0.187.0, vendored under its MIT license for offline play.
import * as THREE from './vendor/three/three.module.js';
import { guideWall, nearbyGuideSite, availableGuideSites, guideClueInReach } from './guide.js';
import { createRecoveryPerson, escapePersonPose, canonicalGuideAim, GUIDE_WORLD_SCALE, RECOVERY_SPRITE_CROPS } from './guide-people.js';

// Presentation only. Positions use the original guide grid, with meters below.
const SCALE = GUIDE_WORLD_SCALE;
const ROUTE = [[1.5,11.5],[1.5,9.5],[5.5,9.5],[5.5,5.5],[11.5,5.5],[11.5,1.5]];
function random(seed) { return () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0) / 4294967296); }
function canvasTexture(width,height,paint) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function imageFile(file) {
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not load ${file}`));
    image.src=new URL(`./assets/${file}`,import.meta.url).href;
  });
}
function horizontalPlane(texture,width,height,opacity=1) {
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
  mesh.rotation.x=-Math.PI/2;return mesh;
}
function bootTexture() {
  return canvasTexture(128,256,c=>{
    c.fillStyle='#141b16';c.beginPath();c.ellipse(64,78,37,66,0,0,Math.PI*2);c.fill();
    c.beginPath();c.roundRect(34,136,60,82,10);c.fill();
    c.strokeStyle='#67705a';c.lineWidth=5;
    for(let y=35;y<124;y+=17){c.beginPath();c.moveTo(38,y);c.lineTo(64,y+8);c.lineTo(90,y);c.stroke();}
    for(let y=152;y<210;y+=15){c.beginPath();c.moveTo(42,y);c.lineTo(86,y);c.stroke();}
    c.strokeStyle='#a0a383';c.globalAlpha=.3;c.lineWidth=2;c.beginPath();c.ellipse(64,78,39,68,0,0,Math.PI*2);c.stroke();
  });
}
function horizonTexture() {
  return canvasTexture(2048,1024,(c,w,h)=>{
    const gradient=c.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,'#0c1c1b');gradient.addColorStop(.35,'#283e36');gradient.addColorStop(.48,'#7e8160');gradient.addColorStop(.53,'#a59b6d');gradient.addColorStop(.6,'#394635');gradient.addColorStop(1,'#1b281e');
    c.fillStyle=gradient;c.fillRect(0,0,w,h);
    const r=random(40130);
    c.fillStyle='#e5dfbc';for(let i=0;i<170;i++){c.globalAlpha=.1+r()*.4;c.fillRect(r()*w,80+r()*330,1+r(),1);}
    c.globalAlpha=1;
    for(let layer=0;layer<3;layer++) {
      c.fillStyle=['#556348','#3c4e39','#2d3d2d'][layer];c.beginPath();c.moveTo(0,550);
      for(let x=0;x<=w;x+=5)c.lineTo(x,524+layer*10-Math.sin(x*.018+layer)*6-r()*(19-layer*4));
      c.lineTo(w,h);c.lineTo(0,h);c.fill();
    }
    // A distant farm silhouette maintains the original horizon's quiet landmarks.
    c.fillStyle='#29372a';c.fillRect(1585,501,44,35);c.beginPath();c.moveTo(1580,501);c.lineTo(1607,480);c.lineTo(1635,501);c.fill();
    c.fillRect(1645,477,15,59);c.beginPath();c.ellipse(1652,477,7.5,5,0,Math.PI,0);c.fill();
    c.fillStyle='#c8ad6c';c.fillRect(1600,514,4,5);
  });
}

export async function createGuideWorld(canvas) {
  const [cornImage,teamImage]=await Promise.all([imageFile('watch-corn.webp'),imageFile('watch-retrieval.webp')]);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#48533d',.028);
  const sky=horizonTexture();sky.mapping=THREE.EquirectangularReflectionMapping;scene.background=sky;
  const camera=new THREE.PerspectiveCamera(66,1,.06,115);camera.rotation.order='YXZ';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.add(new THREE.HemisphereLight('#cad3a2','#24301d',1.4));
  const moon=new THREE.DirectionalLight('#beb888',1.05);moon.position.set(-15,22,-30);scene.add(moon);
  const flashlight=new THREE.SpotLight('#ffe5a6',38,22,.48,.72,1.3);scene.add(flashlight,flashlight.target);
  const dirt=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#5b5d40';c.fillRect(0,0,w,h);const r=random(222);
    for(let i=0;i<24000;i++){const n=r();c.fillStyle=n<.3?'#1d2c20':n<.65?'#9b9566':'#3d4a2f';c.globalAlpha=.13+r()*.23;c.fillRect(r()*w,r()*h,.5+r()*3,.5+r()*2);}
    c.globalAlpha=.22;c.strokeStyle='#181f16';
    for(let i=0;i<160;i++){const x=r()*w,y=r()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+r()*19-9,y+r()*16);c.stroke();}
  });
  dirt.wrapS=dirt.wrapT=THREE.RepeatWrapping;dirt.repeat.set(15,15);dirt.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshLambertMaterial({map:dirt,color:'#8e8a66'}));
  ground.rotation.x=-Math.PI/2;ground.position.set(16,0,16);scene.add(ground);

  const cornTexture=canvasTexture(256,512,c=>c.drawImage(cornImage,29,4,233,499,0,0,256,512));
  cornTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const cornMaterial=new THREE.MeshLambertMaterial({map:cornTexture,alphaTest:.4,side:THREE.DoubleSide,color:'#a9ad78'});
  const wind={value:0};
  cornMaterial.onBeforeCompile=shader=>{
    shader.uniforms.windTime=wind;
    shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float rootPhase = instanceMatrix[3].x * 0.39 + instanceMatrix[3].z * 0.24;
      transformed.x += sin(windTime * 0.85 + rootPhase) * uv.y * uv.y * 0.065;
      transformed.z += cos(windTime * 0.68 + rootPhase) * uv.y * uv.y * 0.035;
    `);
  };
  const plants=[],r=random(735);
  for(let z=-2;z<15;z+=.28)for(let x=-2;x<15;x+=.28) {
    if(!guideWall(x,z))continue;
    const px=x+(r()-.5)*.13,pz=z+(r()-.5)*.13;
    // Keep the lane width readable, including where leaves reach beyond their root.
    if(!guideWall(px,pz))continue;
    plants.push({x:px*SCALE,z:pz*SCALE,height:2.5+r()*.75,angle:r()*Math.PI,shade:.7+r()*.3});
  }
  const corn=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),cornMaterial,plants.length*2);
  const matrix=new THREE.Object3D(),color=new THREE.Color();
  plants.forEach((p,i)=>{
    for(let cross=0;cross<2;cross++) {
      matrix.position.set(p.x,p.height/2,p.z);matrix.scale.set(p.height*.49,p.height,1);matrix.rotation.set(0,p.angle+cross*Math.PI/2,0);matrix.updateMatrix();
      corn.setMatrixAt(i*2+cross,matrix.matrix);corn.setColorAt(i*2+cross,color.setRGB(p.shade,p.shade,p.shade));
    }
  });corn.instanceMatrix.needsUpdate=true;corn.instanceColor.needsUpdate=true;scene.add(corn);

  const prints=bootTexture();
  function footprint(x,z,angle=0,scale=1,opacity=.73) {
    const mark=horizontalPlane(prints,.13*scale,.28*scale,opacity);mark.position.set(x,.012,z);mark.rotation.z=angle;scene.add(mark);return mark;
  }
  // Footsteps are an environmental route cue: no arrows or floating waypoints.
  let step=0;
  for(let leg=1;leg<ROUTE.length;leg++) {
    const [ax,az]=ROUTE[leg-1].map(v=>v*SCALE),[bx,bz]=ROUTE[leg].map(v=>v*SCALE);
    const length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length,angle=Math.atan2(dx,-dz);
    for(let d=.2;d<length;d+=.63) {
      const side=step++%2?1:-1;
      footprint(ax+dx*d-dz*.16*side,az+dz*d+dx*.16*side,-angle,1,.65);
    }
  }
  const clueObjects=new Map();
  const patch=canvasTexture(256,256,(c,w,h)=>{
    const gradient=c.createRadialGradient(w/2,h/2,10,w/2,h/2,125);
    gradient.addColorStop(0,'rgba(15,23,17,0.95)');gradient.addColorStop(.6,'rgba(23,31,20,.8)');gradient.addColorStop(1,'rgba(25,32,21,0)');c.fillStyle=gradient;c.fillRect(0,0,w,h);
  });
  const bootGroup=new THREE.Group();bootGroup.position.set(1.5*SCALE,0,9.5*SCALE);scene.add(bootGroup);
  const puddle=horizontalPlane(patch,1.25,1.45);puddle.position.y=.015;bootGroup.add(puddle);
  footprint(1.5*SCALE-.12,9.5*SCALE,0,1,.98);
  footprint(1.5*SCALE+.15,9.5*SCALE-.12,Math.PI,1,.98);
  const water=new THREE.Mesh(new THREE.CircleGeometry(.05,16),new THREE.MeshBasicMaterial({color:'#a4b4a0',transparent:true,opacity:.28,depthWrite:false}));
  water.rotation.x=-Math.PI/2;water.scale.set(1,1.75,1);water.position.set(-.12,.018,0);bootGroup.add(water);
  clueObjects.set('boot',{object:bootGroup,emission:water.material});

  // Match the existing encounter illustration: a battered field radio resting
  // in the mud, with a horizontal grille, mechanical knobs and a coiled cord.
  const radioGroup=new THREE.Group();radioGroup.position.set(5.5*SCALE,.21,5.5*SCALE);radioGroup.rotation.set(-.45,-.48,-.07);scene.add(radioGroup);
  const radioPaint=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#414633';c.fillRect(0,0,w,h);const dirt=random(5108);
    for(let i=0;i<6500;i++){c.globalAlpha=.1+dirt()*.35;c.fillStyle=i%3?'#21271c':'#8a8669';c.fillRect(dirt()*w,dirt()*h,.4+dirt()*3,.4+dirt()*2);}
    c.globalAlpha=.45;c.strokeStyle='#928d73';c.lineWidth=.7;
    for(let i=0;i<70;i++){const x=dirt()*w,y=dirt()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+dirt()*15-5,y+dirt()*5);c.stroke();}
  });
  const radioMetal=new THREE.MeshStandardMaterial({map:radioPaint,roughness:.92,metalness:.22});
  const housing=new THREE.Mesh(new THREE.BoxGeometry(.52,.31,.25),radioMetal);radioGroup.add(housing);
  const edgeMaterial=new THREE.MeshStandardMaterial({color:'#2c3327',roughness:.85,metalness:.25});
  for(const side of [-1,1]) {
    const guard=new THREE.Mesh(new THREE.BoxGeometry(.025,.33,.267),edgeMaterial);guard.position.x=side*.253;radioGroup.add(guard);
  }
  const radioFace=canvasTexture(640,384,(c,w,h)=>{
    const noise=random(923);
    c.fillStyle='#444834';c.fillRect(0,0,w,h);
    c.strokeStyle='#272c22';c.lineWidth=5;c.strokeRect(10,10,w-20,h-20);
    c.fillStyle='#161e17';c.beginPath();c.roundRect(26,29,366,322,10);c.fill();
    c.strokeStyle='#666951';c.lineWidth=7;
    for(let y=45;y<346;y+=22){c.beginPath();c.moveTo(38,y);c.lineTo(378,y);c.stroke();}
    c.fillStyle='#333b2b';c.fillRect(408,25,205,333);
    c.strokeStyle='#8f8c6c';c.lineWidth=2;
    for(let i=0;i<17;i++){const a=Math.PI*.15+i/16*Math.PI*1.7;c.beginPath();c.moveTo(520+Math.cos(a)*51,255+Math.sin(a)*51);c.lineTo(520+Math.cos(a)*57,255+Math.sin(a)*57);c.stroke();}
    c.globalAlpha=.6;
    for(const x of [18,396,622])for(const y of [18,365]){c.fillStyle='#92917b';c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();c.strokeStyle='#252a20';c.beginPath();c.moveTo(x-3,y);c.lineTo(x+3,y);c.stroke();}
    for(let i=0;i<3500;i++){c.globalAlpha=.05+noise()*.3;c.fillStyle=i%3?'#171e16':'#a19c7d';c.fillRect(noise()*w,noise()*h,noise()*3+1,noise()*2+1);}
    c.globalAlpha=.3;c.strokeStyle='#b0a488';c.lineWidth=1;
    for(let i=0;i<32;i++){const x=noise()*w,y=noise()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+noise()*24-10,y+noise()*5);c.stroke();}
  });
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.51,.303),new THREE.MeshStandardMaterial({map:radioFace,roughness:.92,metalness:.12}));face.position.z=.127;radioGroup.add(face);
  const knobMaterial=new THREE.MeshStandardMaterial({color:'#161e18',roughness:.82,metalness:.08});
  for(const knob of [{x:.158,y:-.052,r:.035},{x:.166,y:.073,r:.018}]) {
    const dial=new THREE.Mesh(new THREE.CylinderGeometry(knob.r,knob.r*1.04,.026,16),knobMaterial);dial.rotation.x=Math.PI/2;dial.position.set(knob.x,knob.y,.145);radioGroup.add(dial);
    const notch=new THREE.Mesh(new THREE.BoxGeometry(.004,knob.r*.55,.003),edgeMaterial);notch.position.set(knob.x,knob.y+knob.r*.35,.16);radioGroup.add(notch);
  }
  const led=new THREE.Mesh(new THREE.SphereGeometry(.0055,8,6),new THREE.MeshBasicMaterial({color:'#bfa05d'}));led.position.set(.096,.086,.136);radioGroup.add(led);
  const radioGlow=new THREE.PointLight('#c8ab67',.04,.8,2);radioGlow.position.set(.096,.09,.16);radioGroup.add(radioGlow);
  const wirePath=new THREE.CatmullRomCurve3([new THREE.Vector3(.26,-.015,0),new THREE.Vector3(.37,-.10,-.12),new THREE.Vector3(.60,-.04,-.32),new THREE.Vector3(.74,.035,-.47)]);
  class CoiledWire extends THREE.Curve { getPoint(t,target=new THREE.Vector3()){wirePath.getPoint(t,target);target.y+=Math.cos(t*Math.PI*40)*.014;target.z+=Math.sin(t*Math.PI*40)*.014;return target;} }
  const wire=new THREE.Mesh(new THREE.TubeGeometry(new CoiledWire(),240,.006,5,false),new THREE.MeshStandardMaterial({color:'#161e18',roughness:.96}));radioGroup.add(wire);
  clueObjects.set('radio',{object:radioGroup,emission:led.material});

  const cornerGroup=new THREE.Group();cornerGroup.position.set(11.5*SCALE,0,1.5*SCALE);scene.add(cornerGroup);
  const bare=horizontalPlane(patch,2.4,2.4);bare.position.y=.016;cornerGroup.add(bare);
  for(let person=0;person<3;person++)for(let i=0;i<4;i++)footprint(11.5*SCALE+(person-1)*.5+(i%2?.09:-.09),1.5*SCALE+.95-i*.32,.03*(person-1),.9,.95);
  const glint=new THREE.Mesh(new THREE.CircleGeometry(.55,32),new THREE.MeshBasicMaterial({color:'#6d7853',transparent:true,opacity:.1,depthWrite:false}));glint.rotation.x=-Math.PI/2;glint.position.y=.02;cornerGroup.add(glint);
  clueObjects.set('corner',{object:cornerGroup,emission:glint.material});

  // Faint dust catches the beam without obscuring evidence or creating HUD clutter.
  const motes=new Float32Array(130*3);for(let i=0;i<motes.length;i+=3){motes[i]=r()*35;motes[i+1]=.2+r()*2.5;motes[i+2]=r()*35;}
  const moteGeometry=new THREE.BufferGeometry();moteGeometry.setAttribute('position',new THREE.BufferAttribute(motes,3));
  const dust=new THREE.Points(moteGeometry,new THREE.PointsMaterial({color:'#c7c495',size:.018,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);

  const team=RECOVERY_SPRITE_CROPS.map((crop,index)=>{
    const texture=canvasTexture(crop[2],crop[3],c=>c.drawImage(teamImage,...crop,0,0,crop[2],crop[3]));
    const person=createRecoveryPerson(index+1,texture);scene.add(person.root);return person;
  });
  // Only the nearby rows can occlude the final fixed-camera encounter. A small
  // duplicate instance index keeps accurate foliage picking affordable on phones.
  const sightPlants=plants.map((plant,index)=>({plant,index})).filter(({plant})=>plant.x>25&&plant.x<33&&plant.z>3&&plant.z<18);
  const sightCorn=new THREE.InstancedMesh(corn.geometry,cornMaterial,sightPlants.length*2);
  const instance=new THREE.Matrix4();
  sightPlants.forEach(({index},i)=>{for(let cross=0;cross<2;cross++){corn.getMatrixAt(index*2+cross,instance);sightCorn.setMatrixAt(i*2+cross,instance);}});
  sightCorn.instanceMatrix.needsUpdate=true;sightCorn.updateMatrixWorld();
  const cornPixels=cornTexture.image.getContext('2d').getImageData(0,0,256,512).data;
  const aim={x:0,y:0};
  const markerGeometry=new THREE.BufferGeometry();
  markerGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-9,0,0,-3,0,0,3,0,0,9,0,0,0,-9,0,0,-3,0,0,3,0,0,9,0],3));
  const aimMarker=new THREE.LineSegments(markerGeometry,new THREE.LineBasicMaterial({color:'#ece2b6',depthTest:false,depthWrite:false,transparent:true,opacity:.85,fog:false}));
  aimMarker.renderOrder=20;aimMarker.visible=false;camera.add(aimMarker);scene.add(camera);
  let breadcrumbs=[{x:1.5,z:11.5}],lastTime=null,lastGuide=null,lastStage=null;
  const viewDirection=new THREE.Vector3(),lightOffset=new THREE.Vector3(),cameraQuaternion=new THREE.Quaternion();
  function resize() {
    const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  function target(game) { return nearbyGuideSite(game)?.id || null; }
  const pickRay=new THREE.Raycaster(),pickPoint=new THREE.Vector3();
  const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.12);
  function pick(game,clientX,clientY) {
    const rect=canvas.getBoundingClientRect();
    pickRay.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),camera);
    const point=pickRay.ray.intersectPlane(groundPlane,pickPoint);
    if(!point)return null;
    const clue=availableGuideSites(game).find(clue=>guideClueInReach(game,clue)&&Math.hypot(point.x/SCALE-clue.x,point.z/SCALE-clue.y)<.5);
    return clue?.id || null;
  }
  const bodyRay=new THREE.Raycaster(),bodyPoint=new THREE.Vector3();
  const projectedBody=new THREE.Vector3();
  function setAim(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();
    aim.x=Math.max(-1,Math.min(1,(clientX-rect.left)/rect.width*2-1));
    aim.y=Math.max(-1,Math.min(1,-(clientY-rect.top)/rect.height*2+1));
  }
  function updatePeople(game,moving=false) {
    const g=game.guide,time=g.time||0,search=g.stage==='search';
    const pose={x:g.x,z:g.y,yaw:-g.angle-Math.PI/2,pitch:search?(g.pitch??-.12):-.07,moving:search&&moving};
    const bob=pose.moving&&!reduced?Math.sin(time*9)*.018:0;
    camera.position.set(pose.x*SCALE,1.55+bob,pose.z*SCALE);
    camera.rotation.set(pose.pitch,pose.yaw,0,'YXZ');camera.updateMatrixWorld();
    if(lastGuide!==g||lastStage!==g.stage){aim.x=0;aim.y=0;}
    if(search) {
      if(lastTime===null||time<lastTime||lastGuide!==g){breadcrumbs=[{x:pose.x,z:pose.z}];}
      const last=breadcrumbs.at(-1);
      if(Math.hypot(pose.x-last.x,pose.z-last.z)>.12)breadcrumbs.push({x:pose.x,z:pose.z});
      if(breadcrumbs.length>70)breadcrumbs.shift();
      team.forEach((person,i)=>{
        const index=Math.max(0,breadcrumbs.length-1-(i+1)*7),entry=breadcrumbs[index],ahead=breadcrumbs[Math.min(breadcrumbs.length-1,index+2)];
        const initial=breadcrumbs.length<(i+1)*7;
        const angle=initial?g.angle:Math.atan2(ahead.z-entry.z,ahead.x-entry.x);
        const x=entry.x+(initial?-Math.cos(g.angle)*(.7+i*.32):0),z=entry.z+(initial?-Math.sin(g.angle)*(.7+i*.32):0);
        person.root.position.set(x*SCALE,0,z*SCALE);
        person.root.rotation.y=Math.PI/2-angle;
        person.root.visible=Math.hypot(pose.x-x,pose.z-z)>.28&&!guideWall(x,z);
        person.pose({gait:g.steps*8+i*1.7,moving:moving&&!reduced,fallen:false});
      });
    } else {
      team.forEach((person,index)=>{
        const state=g.team.find(member=>member.id===index+1),placement=state&&escapePersonPose(g,state);
        person.root.visible=!!placement;
        if(!placement)return;
        person.root.position.set(placement.x,0,placement.z);person.root.rotation.y=placement.angle;
        person.pose({gait:placement.gait,moving:state.status==='running'&&!reduced,fallen:placement.fallen});
      });
    }
    lastTime=time;lastGuide=g;lastStage=g.stage;scene.updateMatrixWorld(true);
  }
  function cornBlocks(ray,distance) {
    ray.far=distance;
    for(const hit of ray.intersectObject(sightCorn,false)) {
      if(!hit.uv)continue;
      const x=Math.max(0,Math.min(255,Math.floor(hit.uv.x*256))),y=Math.max(0,Math.min(511,Math.floor((1-hit.uv.y)*512)));
      if(cornPixels[(y*256+x)*4+3]>=102){ray.far=Infinity;return true;}
    }
    ray.far=Infinity;return false;
  }
  function visibleHit(ray) {
    const sprites=team.filter(person=>person.root.visible).flatMap(person=>person.meshes);
    // Sprite raycasts return the entire card. Only painted pixels can be hit;
    // transparent margins also allow a shot to reach a person farther behind.
    return ray.intersectObjects(sprites,false).find(hit=>team[hit.object.userData.guidePersonId-1].opaqueAt(hit.uv));
  }
  function visiblePerson(game,id) {
    if(game.guide?.stage!=='escape'||!canonicalGuideAim(game.guide,id))return false;
    updatePeople(game);
    const person=team[id-1];if(!person?.root.visible)return false;
    person.torsoPosition(bodyPoint);projectedBody.copy(bodyPoint).project(camera);
    if(projectedBody.z< -1||projectedBody.z>1||Math.abs(projectedBody.x)>1||Math.abs(projectedBody.y)>1)return false;
    bodyRay.setFromCamera(new THREE.Vector2(projectedBody.x,projectedBody.y),camera);
    const hit=visibleHit(bodyRay);
    return !!hit&&hit.object.userData.guidePersonId===id&&!cornBlocks(bodyRay,hit.distance);
  }
  function focusPerson(game,id) {
    if(!visiblePerson(game,id))return false;
    team[id-1].torsoPosition(projectedBody).project(camera);aim.x=projectedBody.x;aim.y=projectedBody.y;return true;
  }
  function shotPoint(game,clientX,clientY) {
    if(game.guide?.stage!=='escape')return {x:0,y:0};
    updatePeople(game);
    if(Number.isFinite(clientX)&&Number.isFinite(clientY))setAim(clientX,clientY);
    bodyRay.setFromCamera(new THREE.Vector2(aim.x,aim.y),camera);
    const hit=visibleHit(bodyRay);
    if(!hit||cornBlocks(bodyRay,hit.distance))return {x:0,y:0};
    return canonicalGuideAim(game.guide,hit.object.userData.guidePersonId)||{x:0,y:0};
  }
  function aimPoint(game) {
    if(game.guide?.focused&&!focusPerson(game,game.guide.focused))return {x:0,y:0};
    return shotPoint(game);
  }
  function render(game,moving=false) {
    const g=game.guide,time=g.time||0,found=new Set(g.clues);
    updatePeople(game,moving);
    camera.getWorldDirection(viewDirection);camera.getWorldQuaternion(cameraQuaternion);
    lightOffset.set(.12,-.16,0).applyQuaternion(cameraQuaternion);
    flashlight.position.copy(camera.position).add(lightOffset);flashlight.target.position.copy(camera.position).addScaledVector(viewDirection,8);
    wind.value=reduced?0:time;
    const close=target(game);
    for(const [id,clue] of clueObjects) {
      if(id==='radio'){clue.emission.color.set(close===id?'#f2d98f':found.has(id)?'#6a7752':'#bdc581');radioGlow.intensity=close===id?.09:.035;}
      else clue.emission.opacity=close===id?.42:found.has(id)?.1:id==='boot'?.25:.1;
    }
    aimMarker.visible=g.stage==='escape';
    if(aimMarker.visible) {
      if(g.focused)focusPerson(game,g.focused);
      const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      aimMarker.position.set(aim.x*halfHeight*camera.aspect,aim.y*halfHeight,-1);
      aimMarker.scale.setScalar(2*halfHeight/(canvas.clientHeight||innerHeight));
    }
    renderer.render(scene,camera);
  }
  function dispose() {
    const textures=new Set(),materials=new Set(),geometries=new Set();
    scene.traverse(obj=>{
      if(obj.geometry)geometries.add(obj.geometry);
      for(const material of obj.material?(Array.isArray(obj.material)?obj.material:[obj.material]):[]){materials.add(material);if(material.map)textures.add(material.map);}
    });
    for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();sky.dispose();renderer.dispose();
  }
  resize();return {render,resize,target,pick,shotPoint,aimPoint,visiblePerson,setAim,focusPerson,dispose};
}
