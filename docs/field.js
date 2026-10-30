// Shared by the simulation and the touch map. Routes never teleport the player.
export const FIELD_PATHS = [
  [[1,7],[1,1],[9,1],[9,7],[1,7]],
  [[1,3],[3,3]],
  [[9,5],[7,5]]
];
export function onFieldPath(x,y) {
  return FIELD_PATHS.some(points=>points.slice(1).some(([bx,by],i)=>{
    const [ax,ay]=points[i];
    return (ax===bx&&x===ax&&y>=Math.min(ay,by)&&y<=Math.max(ay,by)) ||
      (ay===by&&y===ay&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx));
  }));
}
export function fieldStepCost(s,x,y) {
  return (s.mode==='hard'?1.5:1.15)*(onFieldPath(x,y)?.55:1);
}
// Quiet routes minimize exposure. Shortcuts take a direct staircase through corn.
export function planFieldRoute(s,destination,style='quiet') {
  if(s.phase!=='field'||!destination||!Number.isInteger(destination.x)||!Number.isInteger(destination.y)||destination.x<0||destination.x>10||destination.y<0||destination.y>8)return null;
  if(style==='direct') {
    const steps=[],p={...s.player},dx=destination.x-p.x,dy=destination.y-p.y;
    while(p.x!==destination.x||p.y!==destination.y) {
      const crossX=Math.abs((p.x+Math.sign(dx)-s.player.x)*dy-(p.y-s.player.y)*dx);
      const crossY=Math.abs((p.x-s.player.x)*dy-(p.y+Math.sign(dy)-s.player.y)*dx);
      if(p.x!==destination.x&&(p.y===destination.y||crossX<=crossY))p.x+=Math.sign(dx);
      else p.y+=Math.sign(dy);
      steps.push({...p});
    }
    return {steps,exposure:steps.reduce((sum,p)=>sum+fieldStepCost(s,p.x,p.y),0)};
  }
  const key=p=>`${p.x},${p.y}`, start=key(s.player), end=key(destination);
  const queue=[{...s.player,score:0}], scores=new Map([[start,0]]), previous=new Map();
  while(queue.length) {
    queue.sort((a,b)=>a.score-b.score);
    const current=queue.shift(),currentKey=key(current);
    if(current.score!==scores.get(currentKey))continue;
    if(currentKey===end)break;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const next={x:current.x+dx,y:current.y+dy};
      if(next.x<0||next.x>10||next.y<0||next.y>8)continue;
      const nextKey=key(next),exposure=fieldStepCost(s,next.x,next.y);
      const score=current.score+exposure;
      if(score<(scores.get(nextKey)??Infinity)) {
        scores.set(nextKey,score);previous.set(nextKey,{x:current.x,y:current.y});queue.push({...next,score});
      }
    }
  }
  const steps=[];
  for(let p={x:destination.x,y:destination.y};key(p)!==start;p=previous.get(key(p)))steps.unshift(p);
  return {steps,exposure:steps.reduce((sum,p)=>sum+fieldStepCost(s,p.x,p.y),0)};
}
