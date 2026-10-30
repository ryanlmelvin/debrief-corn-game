// The recovery team follows one readable route, stopping at each discovery.
export const GUIDE_SIZE = 13;
export const GUIDE_SITES = [
  { id: 'boot', x: 1.5, y: 9.5, label: 'A boot print', text: 'A boot print full of water. Beside it, a second print faces the other way.' },
  { id: 'radio', x: 5.5, y: 5.5, label: 'An abandoned radio', text: 'The radio is warm. Someone behind you asks you to turn it off. It is already off.' },
  { id: 'corner', x: 11.5, y: 1.5, label: 'The northeast corner', text: 'The stalks stop at a bare patch of earth. Three sets of footprints lead into it. None lead out.' }
];
const ROUTE = [
  { x: 1.5, y: 11.5, distance: 0 },
  { x: 1.5, y: 9.5, distance: 2 },
  { x: 5.5, y: 9.5, distance: 6 },
  { x: 5.5, y: 5.5, distance: 10 },
  { x: 11.5, y: 5.5, distance: 16 },
  { x: 11.5, y: 1.5, distance: 20 }
];
const STOPS = [2, 10, 20];
const WALK_SPEED = 1.8;
function routePose(distance) {
  const end = ROUTE.at(-1);
  if (distance >= end.distance) return { x: end.x, y: end.y, angle: Math.PI / 2 };
  const next = ROUTE.findIndex(point => point.distance > distance);
  const a = ROUTE[next - 1], b = ROUTE[next], fraction = (distance - a.distance) / (b.distance - a.distance);
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  const after = ROUTE[next + 1];
  // Turn inside the open crossing, before the camera reaches its far wall.
  if (after && b.distance - distance < .4) {
    const following = Math.atan2(after.y - b.y, after.x - b.x), amount = 1 - (b.distance - distance) / .4;
    const change = Math.atan2(Math.sin(following - angle), Math.cos(following - angle));
    angle += change * amount * amount * (3 - 2 * amount);
  }
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, angle };
}
export function guideWall(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx <= 0 || cy <= 0 || cx >= 12 || cy >= 12 || !([1,5,11].includes(cx) || [1,5,9,11].includes(cy));
}
export function startGuide(s) {
  s.phase = 'guide'; s.ending = null; s.targets = [];
  s.guide = { ...routePose(0), routeVersion: 1, routeProgress: 0, walking: false, encounterVersion: 2, outcome: null, debriefQuestion: 0, steps: 0, time: 0, clues: [], stage: 'search', team: [], fired: 0, focused: null,
    message: 'Three people follow your light. Lead them to the first crossing.' };
}
export function guideRouteStatus(s) {
  const g = s.guide, leg = g.clues.length, start = leg ? STOPS[leg - 1] : 0, end = STOPS[leg] ?? 20;
  return { walking: g.walking, ready: g.stage === 'search' && g.routeProgress === end, site: GUIDE_SITES[leg] || null,
    leg, progress: end > start ? (g.routeProgress - start) / (end - start) : 1, remaining: Math.max(0, end - g.routeProgress) };
}
export function guideTravel(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'search' || guideRouteStatus(s).ready) return false;
  const g = s.guide;
  g.walking = !g.walking;
  g.focused = null;
  g.message = g.walking ? [
    'You lead the team up the row. Three sets of boots follow your light.',
    'You take the crossing east, then follow the central row north. The team stays close.',
    'You cross to the far row. Beyond it lies the northeast corner. Nobody speaks.'
  ][g.clues.length] : 'You stop. Three sets of footsteps stop behind you.';
  return true;
}
export function nearbyGuideSite(s) {
  return guideRouteStatus(s).ready ? GUIDE_SITES[s.guide.clues.length] : null;
}
export function inspectGuide(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'search') return null;
  const site = nearbyGuideSite(s);
  if (!site) return null;
  const g = s.guide; g.walking = false; g.clues.push(site.id); g.message = site.text;
  // The team breaks only after the player reaches the corner and searches the route.
  if (g.clues.length === GUIDE_SITES.length) {
    g.stage = 'escape'; g.time = 0; g.angle = Math.PI / 2;
    g.team = [0,1,2].map(i => ({ id: i+1, x: g.x+(i-1)*.24, y: g.y+2+i*.7, distance: 0, status: 'running' }));
    g.message = `${site.text} “We are leaving.” Three lights turn toward the southern track. One of them calls your name. Your rifle is still in your hands.`;
  }
  return site;
}
export function projectGuide(g, target) {
  if (g.encounterVersion === 2) {
    if (target.status === 'escaped') return null;
    const lane = [
      { x:400, y:382, height:172, side:-1, drift:45 },
      { x:480, y:372, height:164, side:-1, drift:55 },
      { x:560, y:382, height:180, side:1, drift:45 }
    ][target.id - 1];
    if (!lane) return null;
    const duration=22+target.id*2, cruise=duration-4;
    const concealment=Math.max(0,Math.min(1,(target.distance-cruise)/4));
    if (concealment === 1) return null;
    const spriteX=lane.x+lane.side*(lane.drift*Math.min(1,target.distance/cruise)+55*concealment);
    const fullWidth=lane.height*(target.id===3?32:36)/76, width=54*(1-concealment), gait=target.distance*7+target.id*1.8;
    return { x:spriteX-lane.side*fullWidth*concealment/2, spriteX, y:lane.y+Math.sin(gait*2)*1.2,
      height:lane.height, width, fullWidth, distance:3+(target.id-1)*.7, concealment, exitSide:lane.side, gait };
  }
  const dx = target.x-g.x, dy = target.y-g.y, distance = Math.hypot(dx,dy);
  let angle = Math.atan2(dy,dx)-g.angle;
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (Math.abs(angle) > .65 || distance < .15) return null;
  for (let d=.15; d<distance; d+=.12) if (guideWall(g.x+dx*d/distance,g.y+dy*d/distance)) return null;
  const scale = 420/Math.max(2.4,distance);
  return { x: 480+Math.tan(angle)*640, y: 300+scale*.55, height: scale*1.5, width: scale*.45, distance };
}
export function focusGuide(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'escape') return null;
  const g = s.guide, visible = g.team.filter(t => t.status === 'running' && projectGuide(g,t));
  if (!visible.length) { g.focused = null; g.message = g.fired ? 'The lights vanish between the stalks. The witnesses are reaching the road.' : 'The lights have passed beyond your sight. You can lower the rifle and let them leave.'; return null; }
  const index = visible.findIndex(t => t.id === g.focused);
  const target = visible[(index+1)%visible.length]; g.focused = target.id;
  const p = projectGuide(g,target); return { x: p.x, y: p.y-p.height*.5 };
}
export function fireGuide(s, x, y) {
  if (s.phase !== 'guide' || s.guide.stage !== 'escape') return 'blocked';
  const g=s.guide;
  // The input that uncovered the final clue must not carry into a rifle shot.
  if (Number.isFinite(g.time) && g.time < .65) return 'blocked';
  if (g.fired >= 6) { g.message = 'The rifle clicks. The footsteps keep going.'; return 'empty'; }
  g.fired++; s.shots++;
  const target = g.team.filter(t => t.status === 'running').map(t => ({ t, p: projectGuide(g,t) })).filter(({p}) => p && Math.abs(x-p.x) < Math.max(g.encounterVersion===2?6:18,p.width/2) && y > p.y-p.height && y < p.y).sort((a,b)=>a.p.distance-b.p.distance)[0]?.t;
  if (target) { target.status='shot'; g.message = 'One light drops into the soil. The others run. Your hands will not lower the rifle.'; }
  else g.message = 'The shot misses. Someone shouts, “It is us.” Your hands will not lower the rifle.';
  resolveGuide(s);
  return target ? 'person' : 'miss';
}
function beginGuideDebrief(s, outcome) {
  const g=s.guide;
  for (const t of g.team) if (t.status==='running') t.status='escaped';
  g.stage='debrief';g.outcome=outcome;g.debriefQuestion=0;g.focused=null;g.walking=false;
  g.message=outcome==='secured'?'No lights remain in the row. Dispatch orders you back to the station.':outcome==='arrested'?'The surviving lights reach the road. This time the radio calls for the police.':'Three lights reach the road. You follow them back to the station.';
  s.phase='guide';s.ending=null;
}
function resolveGuide(s) {
  const g=s.guide;
  if (g.stage!=='escape'||!g.team.length) return;
  const shot=g.team.filter(t=>t.status==='shot').length;
  if (shot===3) beginGuideDebrief(s,'secured');
  else if (g.fired && (g.fired>=6||g.team.some(t=>t.status==='escaped'))) beginGuideDebrief(s,'arrested');
  else if (g.team.every(t=>t.status!=='running')) beginGuideDebrief(s,'spared');
}
export function spareGuide(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'escape' || s.guide.fired>0) return false;
  if (Number.isFinite(s.guide.time) && s.guide.time < .65) return false;
  beginGuideDebrief(s,'spared');return true;
}
export function advanceGuide(s,dt) {
  if (s.phase !== 'guide' || !Number.isFinite(dt) || dt<=0 || s.guide.stage==='debrief') return;
  const g=s.guide; g.time+=Math.min(dt,1);
  if (g.stage === 'search') {
    if (!g.walking) return;
    const distance = Math.min(STOPS[g.clues.length], g.routeProgress + Math.min(dt,1) * WALK_SPEED);
    g.steps += distance - g.routeProgress;
    g.routeProgress = distance;
    Object.assign(g, routePose(distance));
    if (guideRouteStatus(s).ready) {
      g.walking = false;
      g.message = `You stop the team. Your light catches ${GUIDE_SITES[g.clues.length].label.toLowerCase()}.`;
    }
    return;
  }
  // Each person crosses the path and disappears into a row at a readable size.
  for (const t of g.team) if (t.status==='running') {
    t.distance=Math.min(22+t.id*2,t.distance+Math.min(dt,1)*(g.fired?1.4:1));
    if (t.distance>=22+t.id*2) t.status='escaped';
  }
  resolveGuide(s);
}
export function guideDebrief(s) {
  if (s?.phase!=='guide'||s.guide?.stage!=='debrief') return null;
  const g=s.guide, question=g.debriefQuestion, shot=g.team.filter(t=>t.status==='shot').length;
  const survivors=3-shot, survivorsText=survivors===1?'One survivor has':`${survivors} survivors have`;
  const interviews={
    spared:[
      { speaker:'SUPERVISOR', prompt:'All three members of the recovery detail returned. They say you let them leave the field. Why?',
        context:'Three lamps sit on the desk. Outside the door, their owners are still talking.',
        options:[{id:'spared-0-people',label:'They were people. They were leaving a dangerous field.'},{id:'spared-0-order',label:'The order said to shoot anything that escaped. I decided not to follow it.'}],
        reply:'The supervisor stops the tape. “We will record a refusal of duty.”' },
      { speaker:'SUPERVISOR', prompt:'You are relieved of this assignment. Put the rifle on the desk. Is there anything else you want on the recording?',
        context:'He removes your name from the next watch. The three lamps remain lit.',
        options:[{id:'spared-1-names',label:'Record the names of all three people who came back.'},{id:'spared-1-warning',label:'Do not send another team into that field.'}],
        reply:'He takes the rifle before he restarts the tape.' }
    ],
    secured:[
      { speaker:'SUPERVISOR', prompt:'Three lights went out. No member of the recovery detail returned with you. Tell me what happened.',
        context:`The rifle lies beside the recorder. You fired ${g.fired} of its six rounds.`,
        options:[{id:'secured-0-people',label:'I shot all three members of the team.'},{id:'secured-0-order',label:'They tried to leave. I followed the instruction.'}],
        reply:'He writes “three escaping specimens contained” on the report.' },
      { speaker:'SUPERVISOR', prompt:'The report records successful containment. Your next watch begins tomorrow. Will you confirm that account?',
        context:'The boxes for missing personnel have been left blank.',
        options:[{id:'secured-1-refuse',label:'No. Put their names in the report. They were people.'},{id:'secured-1-confirm',label:'Confirm the report. The perimeter was secured.'}],
        reply:'He turns off the recorder. “The report is already approved.”' }
    ],
    arrested:[
      { speaker:'SUPERVISOR', prompt:`${survivorsText} reported that you fired on the recovery detail. ${shot?`${shot===1?'One person did':`${shot} people did`} not return.`:'Everyone reached the road.'} What happened?`,
        context:`${g.fired===6?'The rifle is empty.':'The remaining cartridges have been counted.'} A deputy stands beside the interview-room door.`,
        options:[{id:'arrested-0-admit',label:g.fired===1?'I fired at them. I was following the order.':'I fired at them. I heard the order and kept shooting.'},{id:'arrested-0-compulsion',label:'After the first shot, I could not make my hands lower the rifle.'}],
        reply:'The supervisor stops writing. The deputy asks him to keep the tape running.' },
      { speaker:'DEPUTY', prompt:'The rifle and this recording are being taken as evidence. You are coming with me. Is there anything else you want recorded?',
        context:'The supervisor folds the containment report and puts it in a drawer.',
        options:[{id:'arrested-1-orders',label:'Take the written orders too. Ask who gave them.'},{id:'arrested-1-account',label:'Keep the survivors’ statements with mine.'}],
        reply:'The deputy removes your badge. The supervisor does not look up.' }
    ]
  };
  const item=interviews[g.outcome]?.[question];
  return item?{...item,question,total:2}:null;
}
export function answerGuideDebrief(s,id) {
  const question=guideDebrief(s),option=question?.options.find(option=>option.id===id);
  if (!option) return false;
  s.reports.push({shift:s.shift,kind:'recovery',guideQuestion:s.guide.debriefQuestion,question:question.prompt,answer:option.label,supervisorReply:question.reply,replySpeaker:question.speaker});
  s.guide.debriefQuestion++;
  if (s.guide.debriefQuestion===2) { s.phase='ending';s.ending='guide'; }
  return true;
}
// Preserve discoveries in old maze saves; resume safely from the last one.
// New route saves retain the exact walking position and whether travel was active.
export function restoreGuideRoute(s) {
  const g = s.guide;
  if (g.routeVersion === undefined) {
    g.routeVersion = 1;
    g.routeProgress = g.stage === 'escape' ? 20 : g.clues.length ? STOPS[g.clues.length - 1] : 0;
    g.walking = false;
    if (g.stage === 'search') {
      Object.assign(g, routePose(g.routeProgress));
      g.message = g.clues.length ? GUIDE_SITES[g.clues.length - 1].text : 'Three people follow your light. Lead them to the first crossing.';
    } else if (s.phase === 'guide') Object.assign(g, routePose(20));
  }
  if (g.routeVersion !== 1 || !Number.isFinite(g.routeProgress) || typeof g.walking !== 'boolean') return false;
  // Completed older records keep their original aftermath. Active assignments
  // gain the new consequences while retaining people hit and rounds expended.
  if (g.encounterVersion===undefined && s.phase==='guide') {
    g.encounterVersion=2;g.outcome=null;g.debriefQuestion=0;
    if (g.stage==='escape') {
      Object.assign(g,routePose(20));
      for (const person of g.team) person.distance=Math.min(18,g.time*.35);
      resolveGuide(s);
    }
  }
  if (g.encounterVersion!==undefined && g.encounterVersion!==2) return false;
  if (g.encounterVersion===2) {
    if (!['guide','ending'].includes(s.phase)) return false;
    if (![null,'spared','secured','arrested'].includes(g.outcome)||!Number.isInteger(g.debriefQuestion)||g.debriefQuestion<0||g.debriefQuestion>2) return false;
    if (g.stage==='debrief') {
      const shot=g.team.filter(person=>person.status==='shot').length;
      if (!g.outcome||g.team.some(person=>person.status==='running')||g.routeProgress!==20||g.walking) return false;
      if ((g.outcome==='spared'&&(g.fired!==0||shot!==0))||(g.outcome==='secured'&&shot!==3)||(g.outcome==='arrested'&&(!g.fired||shot===3))) return false;
      if ((s.phase==='guide'&&g.debriefQuestion===2)||(s.phase==='ending'&&(s.ending!=='guide'||g.debriefQuestion!==2))) return false;
      const reports=s.reports.filter(report=>report.kind==='recovery');
      if (reports.length!==g.debriefQuestion||!reports.every((report,index)=>report.guideQuestion===index)) return false;
    } else if (g.outcome!==null||g.debriefQuestion!==0||s.phase==='ending') return false;
    if (g.stage==='escape'&&(g.fired>=6||g.team.every(person=>person.status==='shot')||(g.fired>0&&g.team.some(person=>person.status==='escaped')))) return false;
    if (g.stage!=='search'&&!['x','y','angle'].every(key=>Math.abs(g[key]-routePose(20)[key])<.000001)) return false;
    if (!g.team.every(person=>person.distance>=0&&person.distance<=22+person.id*2)) return false;
    if (g.team.filter(person=>person.status==='shot').length>g.fired) return false;
  } else if (g.stage==='debrief') return false;
  if (g.stage==='escape'||g.stage==='debrief') return g.routeProgress === 20 && !g.walking;
  if (g.clues.length >= 3 || g.team.length || g.fired) return false;
  const start = g.clues.length ? STOPS[g.clues.length - 1] : 0, end = STOPS[g.clues.length];
  if (g.routeProgress < start || g.routeProgress > end || (g.walking && g.routeProgress === end)) return false;
  const pose = routePose(g.routeProgress);
  return ['x', 'y', 'angle'].every(key => Math.abs(g[key] - pose[key]) < .000001);
}
// Keep the last field view on screen when the player has fired on the team.
export function isGuideAftermath(s) {
  return s?.phase === 'ending' && s.ending === 'guide' && s.guide?.encounterVersion!==2 && !!s.guide?.team.some(t => t.status === 'shot');
}
export function guideDisposition(s) {
  if (s.guide?.encounterVersion===2) {
    const shot=s.guide.team.filter(person=>person.status==='shot').length;
    const endings={
      spared:{title:'Three lights returned.',text:'Three members of the recovery detail reach the road alive. Back at the station, you surrender the rifle and your watch assignment. Their statements remain on the tape beside yours. Before you leave, someone is sent to replace you.',last:'The order continues without you.',stamp:'RECOVERY INCOMPLETE'},
      secured:{title:'The report is approved.',text:'The department records three escaping specimens contained and no personnel incident. Your account remains on a tape marked for reuse. At the next shift, the rifle is waiting in the tower. Three lamps have been removed from the equipment shelf.',last:'Watch the corn. Shoot any that try to escape.',stamp:'PERIMETER SECURED'},
      arrested:{title:'Held for questioning.',text:`${shot===0?'All three members of the team survive your shots.':shot===1?'One member of the team is dead. Two reach the road.':'Two members of the team are dead. One reaches the road.'} Their account brings the police to the station. After the recorded interview, a deputy places you under arrest and takes your rifle, your badge, and the tape. The supervisor keeps the written orders.`,last:'For once, the record names the people who were there.',stamp:'TAKEN INTO CUSTODY'}
    };
    return endings[s.guide.outcome]||endings.spared;
  }
  const shot = s.guide?.team.filter(t => t.status==='shot').length || 0;
  if (shot===3) return { text: '', last: 'Shoot any that try to escape.', stamp: 'PERIMETER SECURED' };
  if (shot) return { text: '', last: 'Shoot any that try to escape.', stamp: 'PERSONNEL INCIDENT' };
  return { text: 'You lower the rifle. Three lights reach the road. You follow them as far as the last row, where your feet stop. Someone calls back for you. The instruction continues, although your radio is off.', last: 'Watch the corn. Shoot any that try to escape.', stamp: 'RECOVERY INCOMPLETE' };
}
