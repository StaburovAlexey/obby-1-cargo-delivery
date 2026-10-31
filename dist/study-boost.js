// Session-only reward: only actual study time consumes it.
export function createStudyBoost(){
 let remaining=0;
 return {
  get remaining(){return remaining;},
  activate(){if(remaining>0)return false;remaining=60;return true;},
  reward(rate,dt){
   if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(dt)||dt<=0)return 0;
   const boosted=Math.min(dt,remaining);remaining=Math.max(0,remaining-dt);if(remaining<1e-8)remaining=0;
   return rate*(dt+boosted);
  },
 };
}
