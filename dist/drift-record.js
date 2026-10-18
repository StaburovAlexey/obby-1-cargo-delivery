export const DRIFT_TRACK_ID='canyon-v1';
export const DRIFT_LEADERBOARD='canyonDriftV1';
export function sanitizeDriftRecord(value){
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
  const data=Object.getOwnPropertyDescriptors(value),read=k=>data[k]&&Object.hasOwn(data[k],'value')?data[k].value:undefined;
  const version=read('version'),trackId=read('trackId'),score=read('score'),durationMs=read('durationMs'),maxCombo=read('maxCombo');
  if(version!==1||trackId!==DRIFT_TRACK_ID||!Number.isSafeInteger(score)||score<0||score>100000000||!Number.isSafeInteger(durationMs)||durationMs<30000||durationMs>600000||!Number.isInteger(maxCombo)||maxCombo<1||maxCombo>5)return null;
  return {version,trackId,score,durationMs,maxCombo};
 }catch{return null;}
}
