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
  s.guide = { ...routePose(0), routeVersion: 1, routeProgress: 0, walking: false, steps: 0, time: 0, clues: [], stage: 'search', team: [], fired: 0, focused: null,
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
    g.team = [0,1,2].map(i => ({ id: i+1, x: g.x+(i-1)*.24, y: g.y+2+i*.7, distance: 2+i*.7, status: 'running' }));
    g.message = `${site.text} “We are leaving.” Three lights turn toward the southern track. One of them calls your name. Your rifle is still in your hands.`;
  }
  return site;
}
export function projectGuide(g, target) {
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
  if (!visible.length) { g.focused = null; g.message = 'The lights have passed beyond your sight. You can lower the rifle and let them leave.'; return null; }
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
  const target = g.team.filter(t => t.status === 'running').map(t => ({ t, p: projectGuide(g,t) })).filter(({p}) => p && Math.abs(x-p.x) < Math.max(18,p.width/2) && y > p.y-p.height && y < p.y).sort((a,b)=>a.p.distance-b.p.distance)[0]?.t;
  if (target) { target.status='shot'; g.message = 'One light drops into the soil. The others keep moving.'; }
  else g.message = 'The report rolls down the rows. Someone shouts, “It is us.”';
  resolveGuide(s);
  return target ? 'person' : 'miss';
}
function resolveGuide(s) {
  const g=s.guide;
  if (g.team.length && g.team.every(t => t.status !== 'running')) { s.phase='ending'; s.ending='guide'; }
}
export function spareGuide(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'escape') return false;
  if (Number.isFinite(s.guide.time) && s.guide.time < .65) return false;
  for (const t of s.guide.team) if (t.status === 'running') t.status='escaped';
  s.guide.message='You lower the rifle. The remaining lights reach the track.';
  resolveGuide(s); return true;
}
export function advanceGuide(s,dt) {
  if (s.phase !== 'guide' || !Number.isFinite(dt) || dt<=0) return;
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
  // The camera already faces the people leaving, with time to make a choice.
  for (const t of g.team) if (t.status==='running') {
    t.distance += Math.min(dt,1)*.36;
    // A visible southbound path, then the bottom crossing to the road.
    const along = t.distance;
    t.x = 11.5+(t.id-2)*.24;
    t.y = Math.min(11.5, 1.5+along);
    if (along > 10) t.x = 11.5-(along-10);
    if (along >= 20 || g.time >= 65) t.status='escaped';
  }
  resolveGuide(s);
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
  if (g.stage === 'escape') return g.routeProgress === 20 && !g.walking;
  if (g.clues.length >= 3 || g.team.length || g.fired) return false;
  const start = g.clues.length ? STOPS[g.clues.length - 1] : 0, end = STOPS[g.clues.length];
  if (g.routeProgress < start || g.routeProgress > end || (g.walking && g.routeProgress === end)) return false;
  const pose = routePose(g.routeProgress);
  return ['x', 'y', 'angle'].every(key => Math.abs(g[key] - pose[key]) < .000001);
}
// Keep the last field view on screen when the player has fired on the team.
export function isGuideAftermath(s) {
  return s?.phase === 'ending' && s.ending === 'guide' && !!s.guide?.team.some(t => t.status === 'shot');
}
export function guideDisposition(s) {
  const shot = s.guide?.team.filter(t => t.status==='shot').length || 0;
  if (shot===3) return { text: '', last: 'Shoot any that try to escape.', stamp: 'PERIMETER SECURED' };
  if (shot) return { text: '', last: 'Shoot any that try to escape.', stamp: 'PERSONNEL INCIDENT' };
  return { text: 'You lower the rifle. Three lights reach the road. You follow them as far as the last row, where your feet stop. Someone calls back for you. The instruction continues, although your radio is off.', last: 'Watch the corn. Shoot any that try to escape.', stamp: 'RECOVERY INCOMPLETE' };
}
