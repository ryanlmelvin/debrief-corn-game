// A small first-person field walk. Corn rows form the walls; crossings form the route.
export const GUIDE_SIZE = 13;
export const GUIDE_SITES = [
  { id: 'boot', x: 1.5, y: 9.5, label: 'A boot print', text: 'A boot print full of water. Beside it, a second print faces the other way.' },
  { id: 'radio', x: 5.5, y: 5.5, label: 'An abandoned radio', text: 'The radio is warm. Someone behind you asks you to turn it off. It is already off.' },
  { id: 'corner', x: 11.5, y: 1.5, label: 'The northeast corner', text: 'The stalks stop at a bare patch of earth. Three sets of footprints lead into it. None lead out.' }
];
export function guideWall(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx <= 0 || cy <= 0 || cx >= 12 || cy >= 12 || !([1,5,11].includes(cx) || [1,5,9,11].includes(cy));
}
export function startGuide(s) {
  s.phase = 'guide'; s.ending = null; s.targets = [];
  s.guide = { x: 1.5, y: 11.5, angle: -Math.PI/2, steps: 0, time: 0, clues: [], stage: 'search', team: [], fired: 0, focused: null,
    message: 'Three people follow your light. The northeast corner is ahead, beyond the crossings.' };
}
export function turnGuide(s, direction) {
  if (s.phase !== 'guide' || ![-1,1].includes(direction)) return false;
  s.guide.angle += direction * Math.PI/2;
  return true;
}
export function stepGuide(s, direction = 1) {
  if (s.phase !== 'guide' || ![-1,1].includes(direction)) return false;
  const g = s.guide, x = g.x + Math.cos(g.angle)*direction, y = g.y + Math.sin(g.angle)*direction;
  if (guideWall(x,y)) { g.message = 'Stalks press together. There is a crossing farther along the row.'; return false; }
  g.x = x; g.y = y; g.steps++;
  if (g.stage === 'search') {
    const site = nearbyGuideSite(s);
    g.message = site ? `Your light catches something. ${site.label}.` : g.steps < 6 ? 'Boots scrape the soil behind you. They stop when you stop.' : 'At each crossing, the same voices ask how much farther.';
  }
  return true;
}
export function nearbyGuideSite(s) {
  const site = GUIDE_SITES[s.guide.clues.length];
  return site && Math.hypot(site.x-s.guide.x, site.y-s.guide.y) < .8 ? site : null;
}
export function inspectGuide(s) {
  if (s.phase !== 'guide' || s.guide.stage !== 'search') return null;
  const site = nearbyGuideSite(s);
  if (!site) return null;
  const g = s.guide; g.clues.push(site.id); g.message = site.text;
  // The team breaks only after the player reaches the corner and searches the route.
  if (g.clues.length === GUIDE_SITES.length) {
    g.stage = 'escape'; g.time = 0;
    g.team = [0,1,2].map(i => ({ id: i+1, x: g.x+(i-1)*.24, y: g.y+.9+i*.7, distance: .9+i*.7, status: 'running' }));
    g.message = '“We are leaving.” Three lights turn toward the southern track. One of them calls your name. Your rifle is still in your hands.';
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
  if (!visible.length) { g.focused = null; g.message = 'Turn toward the footsteps. The team is heading south.'; return null; }
  const index = visible.findIndex(t => t.id === g.focused);
  const target = visible[(index+1)%visible.length]; g.focused = target.id;
  const p = projectGuide(g,target); return { x: p.x, y: p.y-p.height*.5 };
}
export function fireGuide(s, x, y) {
  if (s.phase !== 'guide' || s.guide.stage !== 'escape') return 'blocked';
  const g=s.guide;
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
  for (const t of s.guide.team) if (t.status === 'running') t.status='escaped';
  s.guide.message='You lower the rifle. The remaining lights reach the track.';
  resolveGuide(s); return true;
}
export function advanceGuide(s,dt) {
  if (s.phase !== 'guide' || !Number.isFinite(dt) || dt<=0) return;
  const g=s.guide; g.time+=Math.min(dt,1);
  if (g.stage !== 'escape') return;
  // Enough time to turn, understand the situation, and choose to let them leave.
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
