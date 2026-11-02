import * as THREE from './vendor/three/three.module.js';
import { projectGuide } from './guide.js';

export const GUIDE_WORLD_SCALE = 2.5;

// The simulation owns the clock, concealment window, ammunition and outcomes.
// This is a placement of that existing encounter in meters, not another timer.
export function escapePersonPose(guide, person) {
  const projection=projectGuide(guide,person);
  if(!projection||person.status==='escaped')return null;
  const id=person.id,index=id-1,side=id===3?-1:1;
  const concealment=projection.concealment||0;
  const cruise=22+id*2-4;
  const progress=Math.max(0,Math.min(1,person.distance/cruise));
  const initial=[.52,0,-.52][index];
  const lane=initial+side*.1*progress;
  return {
    x:guide.x*GUIDE_WORLD_SCALE+lane+(side*1.9-lane)*concealment,
    z:guide.y*GUIDE_WORLD_SCALE+5+index*.9+progress*1.6+concealment*.45,
    angle:side*Math.asin(Math.min(.9,concealment*.9)),
    concealment,
    gait:person.distance*4.8+index*1.7,
    fallen:person.status==='shot'
  };
}

// A visible mesh hit is translated back into the existing canonical hit test.
// Calling this helper does not expend ammunition or change the target roster.
export function canonicalGuideAim(guide,id) {
  const person=guide.team.find(person=>person.id===id&&person.status==='running');
  const projected=person&&projectGuide(guide,person);
  return projected?{x:projected.x,y:projected.y-projected.height*.5}:null;
}

// These are the original illustrated field workers, shared with the 2D scenes.
export const RECOVERY_SPRITE_CROPS = [
  [124,9,281,579],
  [474,42,274,545],
  [855,76,233,510]
];

export function createRecoveryPerson(id,texture) {
  const root=new THREE.Group();root.name=`recovery-worker-${id}`;
  const crop=RECOVERY_SPRITE_CROPS[id-1];
  const height=[1.75,1.72,1.68][id-1],width=height*crop[2]/crop[3];
  const material=new THREE.SpriteMaterial({map:texture,color:'#8a9672',fog:true,alphaTest:.1});
  const sprite=new THREE.Sprite(material);sprite.userData.guidePersonId=id;root.add(sprite);
  const source=texture?.image;
  const pixels=source?.data?source:source?.getContext('2d').getImageData(0,0,source.width,source.height);
  function opaqueAt(uv) {
    if(!uv||!pixels||uv.x<0||uv.x>1||uv.y<0||uv.y>1)return false;
    const x=Math.min(pixels.width-1,Math.floor(uv.x*pixels.width));
    const v=texture.flipY?1-uv.y:uv.y;
    const y=Math.min(pixels.height-1,Math.floor(v*pixels.height));
    return pixels.data[(y*pixels.width+x)*4+3]>=Math.ceil(material.alphaTest*255);
  }
  function pose({gait=0,moving=false,fallen=false}={}) {
    // Keep the painted silhouette; only a small walking sway moves the card.
    // The fallen pose uses the same flattened, sideways illustration as before.
    material.rotation=fallen?Math.PI/2:moving?Math.sin(gait)*.012:0;
    material.opacity=fallen?.55:1;
    sprite.scale.set(fallen?width*.22:width,fallen?height*.72:height,1);
    sprite.position.y=fallen?width*.11+.025:height/2+(moving?Math.abs(Math.sin(gait))*.009:0);
  }
  function torsoPosition(target=new THREE.Vector3()) {
    root.updateWorldMatrix(true,true);
    return root.localToWorld(target.set(0,height*.61,0));
  }
  pose();
  return {root,meshes:[sprite],pose,torsoPosition,opaqueAt};
}
