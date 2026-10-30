// Watchtower visuals follow the same nightly events as the radio and interviews.
export const SIGHTING_TIME = 12;
// Let the player watch the people in the rows before offering to leave the tower.
export const SIGHTING_OBSERVATION_SECONDS = 5;
export function sightingPromptReady(s) {
  return s.phase === 'tower' && s.incident && s.time >= SIGHTING_TIME + SIGHTING_OBSERVATION_SECONDS;
}
export const WATCH_NIGHTS = [
  { role:'dress', count:1, crop:'corn', log:'A white dress. Northeast corner. Someone went in.', notice:'Someone in a white dress went into the rows.' },
  { role:'retrieval', count:3, crop:'corn-roots', log:'A recovery team enters the northeast corner. Their lights move between the rows. No radio response.', notice:'Three recovery workers enter the northeast corner. Their lights move between the rows. No one answers the radio.' },
  { role:'retrieval', count:3, crop:'corn-teeth', log:'Three lights in the northeast. Another recovery team has gone in, wearing hooded protective suits.', notice:'Another three-person recovery team enters the northeast corner in hooded protective suits. For now, all three lights are still visible.' }
];
export const watchNight = shift => WATCH_NIGHTS[shift] || WATCH_NIGHTS[0];
export function sightingPeople(shift) {
  const {role,count}=watchNight(shift);
  return Array.from({length:count},(_,member)=>({
    kind:'person',role,member,x:count===1?710:670+member*70,y:331+member*9,
    direction:-1,speed:9,wobble:member*1.7
  }));
}
export function personRole(shift,target) { return target.role || watchNight(shift).role; }
export function personExitTime(shift,target) {
  return shift===2 ? 20+(target.member||0)*3 : 24;
}
export function personLight(shift,time,target) {
  if(personRole(shift,target)!=='retrieval')return 0;
  // A single gentle fade for each light; no flicker, including reduced motion.
  return shift===2?Math.max(0,Math.min(1,(18+(target.member||0)*3-time)/.65)):1;
}
export function targetArtwork(shift,target) {
  return target.kind==='corn'?watchNight(shift).crop:personRole(shift,target)==='retrieval'?`${shift===2?'hazmat':'retrieval'}-${target.member||0}`:'dress';
}

export function observedSighting(s) {
  if(s.shift===0)return 'a figure in a white dress';
  if(s.shift===1)return 'a three-person recovery team';
  return ['another three-person recovery team','one recovery light going out','two recovery lights going out','three recovery lights going out'][s.lightsOut?.length||0];
}
