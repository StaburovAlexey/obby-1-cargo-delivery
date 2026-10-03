// Test-only steering waypoints around the visible descriptors. This is not an
// auto-drive feature and never edits position, velocity, fuel or progression.
const smooth = t => {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
export function hazardRouteOffset(hazards,distance,preferred=8) {
  let weight=0;
  for(const h of hazards){
    // City blocks are central: the regular right refuelling lane is clear.
    if(h.type==='repair')continue;
    const before=smooth((distance-(h.distance-95))/60);
    const after=1-smooth((distance-(h.distance+20))/60);
    weight=Math.max(weight,before*after);
  }
  // The middle of the wide road bypasses either seeded roadside half-patch.
  return preferred*(1-weight);
}
