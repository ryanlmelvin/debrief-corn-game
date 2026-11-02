import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture, PerspectiveCamera, Raycaster, Vector2 } from '../docs/vendor/three/three.module.js';
import { createGame, answer, advance, serialize, restore, endingId } from '../docs/engine.js';
import { guideTravel, guideRouteStatus, inspectGuide, fireGuide, spareGuide, guideDebrief, answerGuideDebrief } from '../docs/guide.js';
import { canonicalGuideAim, escapePersonPose, createRecoveryPerson, GUIDE_WORLD_SCALE, RECOVERY_SPRITE_CROPS } from '../docs/guide-people.js';

function retreat() {
  const game=createGame('story',123);
  Object.assign(game,{phase:'debrief',shift:2,question:2});
  assert.equal(answer(game,'guide'),true);
  for(const id of ['boot','radio','corner']) {
    assert.equal(guideTravel(game),true);
    for(let frame=0;!guideRouteStatus(game).ready&&frame<300;frame++)advance(game,.1);
    assert.equal(inspectGuide(game)?.id,id);
  }
  assert.equal(game.guide.stage,'escape');
  return game;
}
function wait(game,seconds) {
  while(seconds>0) {
    const step=Math.min(1,seconds);
    advance(game,step);seconds-=step;
  }
}
function shootPerson(game,id) {
  const aim=canonicalGuideAim(game.guide,id);
  assert.ok(aim,`Person ${id} still has a visible target.`);
  return fireGuide(game,aim.x,aim.y);
}
function finishInterview(game) {
  while(game.phase==='guide'&&game.guide.stage==='debrief') {
    const question=guideDebrief(game);
    assert.equal(answerGuideDebrief(game,question.options[0].id),true);
  }
}

test('the 3D hit bridge resolves the intended simulation target throughout its retreat',()=>{
  const start=retreat();
  for(const id of [1,2,3])for(const time of [.65,5,18,20.5,22.5,23.99]) {
    const game=restore(serialize(start));wait(game,time);
    const before=serialize(game),pose=escapePersonPose(game.guide,game.guide.team[id-1]);
    assert.ok(pose);
    assert.equal(pose.fallen,false);
    assert.ok(pose.z>game.guide.y*GUIDE_WORLD_SCALE,'The departing person remains down the southern row.');
    assert.equal(serialize(game),before,'Presentation helpers leave saved state and randomness unchanged.');
    assert.equal(shootPerson(game,id),'person',`Person ${id} can be hit after ${time} seconds.`);
    assert.deepEqual(game.guide.team.filter(person=>person.status==='shot').map(person=>person.id),[id]);
    assert.equal(game.guide.fired,1);assert.equal(game.shots,1);
  }
});

test('3D shots retain the reveal delay and first-shot commitment',()=>{
  const game=retreat();
  for(const time of [0,.64]) {
    wait(game,time);
    const before=serialize(game);
    assert.equal(shootPerson(game,2),'blocked');
    assert.equal(spareGuide(game),false);
    assert.equal(serialize(game),before,'A clue-release input cannot fire or end the encounter.');
  }
  wait(game,.01);
  assert.equal(shootPerson(game,2),'person');
  assert.equal(spareGuide(game),false);
  const distance=game.guide.team[0].distance;
  wait(game,1);
  assert.ok(Math.abs(game.guide.team[0].distance-distance-1.4)<1e-10,'The original accelerated retreat begins after firing.');
});

test('covered and fallen people cannot be reacquired through the 3D shot bridge',()=>{
  const game=retreat();wait(game,23.99);
  const almostCovered=escapePersonPose(game.guide,game.guide.team[0]);
  assert.ok(almostCovered.concealment>.99&&almostCovered.concealment<1);
  wait(game,.02);
  assert.equal(game.guide.team[0].status,'escaped');
  assert.equal(escapePersonPose(game.guide,game.guide.team[0]),null);
  assert.equal(canonicalGuideAim(game.guide,1),null);
  assert.equal(canonicalGuideAim(game.guide,99),null);
  assert.ok(canonicalGuideAim(game.guide,2),'Another person remains available on its own original timer.');

  const shot=retreat();wait(shot,.65);assert.equal(shootPerson(shot,3),'person');
  const fallen=escapePersonPose(shot.guide,shot.guide.team[2]);
  assert.equal(fallen.fallen,true);
  assert.equal(canonicalGuideAim(shot.guide,3),null);
  wait(shot,1);
  assert.deepEqual(escapePersonPose(shot.guide,shot.guide.team[2]),fallen,'A fallen figure does not continue walking.');
});

test('the 3D aim bridge preserves all four recovery ending identities and ammunition',()=>{
  for(const outcome of ['spared','secured','arrested','interrupted']) {
    const game=retreat();wait(game,.65);
    if(outcome==='secured')for(const id of [3,1,2])assert.equal(shootPerson(game,id),'person');
    else if(outcome==='arrested') {
      assert.equal(shootPerson(game,2),'person');
      for(let round=1;round<6;round++)assert.equal(fireGuide(game,0,0),'miss');
    } else assert.equal(spareGuide(game),true);
    assert.equal(game.guide.stage,'debrief');
    assert.deepEqual(restore(serialize(game)),game);
    if(outcome==='interrupted') {
      const option=guideDebrief(game).options.find(option=>option.action==='rifle');
      assert.ok(option);assert.equal(answerGuideDebrief(game,option.id),true);
      assert.equal(game.shots,1);
    } else finishInterview(game);
    assert.equal(endingId(game),{spared:'guide',secured:'guide_shot',arrested:'guide_arrested',interrupted:'guide_interrupted'}[outcome]);
    assert.equal(game.guide.fired,{spared:0,secured:3,arrested:6,interrupted:0}[outcome]);
  }
});

test('the original illustrated workers remain human-sized and only painted pixels accept hits',()=>{
  assert.deepEqual(RECOVERY_SPRITE_CROPS,[[124,9,281,579],[474,42,274,545],[855,76,233,510]]);
  const pixels=new Uint8Array(4*4*4);
  for(const x of [1,2])for(const y of [1,2])pixels[(y*4+x)*4+3]=255;
  const texture=new DataTexture(pixels,4,4);texture.flipY=true;
  const camera=new PerspectiveCamera(60,1,.1,100);camera.position.set(0,1,5);camera.updateMatrixWorld();
  for(const id of [1,2,3]) {
    const person=createRecoveryPerson(id,texture),sprite=person.meshes[0];
    assert.equal(sprite.isSprite,true,'The worker uses the existing illustrated cutout.');
    assert.equal(person.meshes.length,1,'No procedural human model remains.');
    assert.ok(sprite.scale.y>1.6&&sprite.scale.y<1.85,'The artwork keeps a human-scale height.');
    assert.equal(sprite.position.y-sprite.scale.y/2,0,'Boots meet the ground.');
    const crop=RECOVERY_SPRITE_CROPS[id-1];
    assert.ok(Math.abs(sprite.scale.x/sprite.scale.y-crop[2]/crop[3])<1e-12,'The original artwork proportions are preserved.');
    const standingScale=sprite.scale.clone(),standingPosition=sprite.position.clone();
    const focus=person.torsoPosition().project(camera),ray=new Raycaster();
    ray.setFromCamera(new Vector2(focus.x,focus.y),camera);
    const hit=ray.intersectObjects(person.meshes,false)[0];
    assert.ok(hit,'The focus point lands on the displayed sprite.');
    assert.equal(person.opaqueAt(hit.uv),true,'The focus point is over the painted body.');
    assert.equal(person.opaqueAt(new Vector2(0,1)),false,'Invisible card margins cannot receive shots.');
    assert.equal(person.opaqueAt(new Vector2(.5,0)),false,'A transparent gap is not a body hit.');
    person.pose({fallen:true});
    assert.equal(sprite.material.rotation,Math.PI/2,'A fallen worker uses the original sideways illustration.');
    assert.ok(sprite.position.y+sprite.scale.x/2<.3,'The sideways illustration lies near the ground.');
    person.pose();
    assert.deepEqual(sprite.scale,standingScale);
    assert.deepEqual(sprite.position,standingPosition);
    sprite.material.dispose();
  }
  texture.dispose();
});
