// A fixed root drawing. Only its revealed length changes with simulation time.
// Determinism avoids jitter when the watch pauses, resumes, or loads a save.
export function pressureWordMarkup() {
  let seed=4107;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const paths=[];
  const path=(d,width,start,duration)=>paths.push(`<path class="root-filament" d="${d}" pathLength="1" stroke-width="${width.toFixed(2)}" style="--start:${start.toFixed(3)};--rate:${(1/duration).toFixed(3)}"/>`);
  const n=v=>v.toFixed(1);
  for(let i=0;i<105;i++){
    let x=i*11.5+random()*9,y=228;
    const start=random()*.22,duration=.5+random()*.28;
    let d=`M${n(x)} ${y}`;
    for(let j=0;j<8;j++){
      const nx=x+(random()-.5)*24,ny=y-24-random()*12;
      d+=` C${n(x+random()*14-7)} ${n(y-12)} ${n(nx+random()*12-6)} ${n(ny+12)} ${n(nx)} ${n(ny)}`;
      if(j>0&&j<7&&random()<.64){
        const side=random()<.5?-1:1,tipX=nx+side*(15+random()*32),tipY=ny-18-random()*31;
        path(`M${n(nx)} ${n(ny)} C${n(nx+side*13)} ${n(ny-4)} ${n(tipX-side*9)} ${n(tipY+17)} ${n(tipX)} ${n(tipY)}`,.55+random()*.8,start+duration*(j/8),.12+random()*.16);
      }
      x=nx;y=ny;
    }
    path(d,1.3+random()*1.7,start,duration);
  }
  return `<svg viewBox="0 0 1200 240" aria-hidden="true" focusable="false"><defs><mask id="investigate-letter-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="240"><text x="20" y="174" textLength="1160" lengthAdjust="spacingAndGlyphs" font-family="Georgia,serif" font-size="194" font-weight="700" fill="white">investigate</text></mask><linearGradient id="root-ink" x2="0" y2="1"><stop stop-color="#c1c29b"/><stop offset="1" stop-color="#7d8960"/></linearGradient></defs><g mask="url(#investigate-letter-mask)"><rect class="root-impression" width="1200" height="240" fill="#a3ac83"/><g fill="none" stroke="url(#root-ink)" stroke-linecap="round">${paths.join('')}</g></g><text class="root-hit-target" x="20" y="174" textLength="1160" lengthAdjust="spacingAndGlyphs" font-family="Georgia,serif" font-size="194" font-weight="700" fill="transparent">investigate</text></svg>`;
}
