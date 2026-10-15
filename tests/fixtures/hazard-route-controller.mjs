

const smooth = t => {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
export function hazardRouteOffset(hazards,distance,preferred=8) {
  let weight=0;
  for(const h of hazards){

    if(h.type==='repair')continue;
    const before=smooth((distance-(h.distance-95))/60);
    const after=1-smooth((distance-(h.distance+20))/60);
    weight=Math.max(weight,before*after);
  }

  return preferred*(1-weight);
}
