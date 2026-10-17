import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export function uniqueParameters(value){
  const params=new URLSearchParams(value);
  const names=new Set();
  for(const [key]of params){if(names.has(key))throw new Error('Duplicate VK parameter');names.add(key);}
  return params;
}
const matches=(actual,expected)=>{
  const a=Buffer.from(actual||''),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
};
export const positiveId=value=>/^[1-9]\d*$/.test(value||'')&&Number.isSafeInteger(Number(value));
export function verifyPayment(params,secret,appId){
  const canonical=[...params].filter(([key])=>key!=='sig').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>key+'='+value).join('');
  const expected=createHash('md5').update(canonical+secret).digest('hex');
  if(!matches(params.get('sig'),expected))throw new Error('Invalid VK payment signature');
  if(params.get('app_id')!==String(appId)||!positiveId(params.get('user_id')))throw new Error('Invalid VK payment application or user');
}
export function verifyLaunch(header,secret,appId,{now=Date.now(),maxAgeSeconds=86400}={}){
  if(!header?.startsWith('VK '))throw new Error('Missing VK authorization');
  const params=uniqueParameters(header.slice(3));
  const signed=new URLSearchParams([...params].filter(([key])=>key.startsWith('vk_')));signed.sort();
  const expected=createHmac('sha256',secret).update(signed.toString()).digest('base64url');
  if(!matches(params.get('sign'),expected))throw new Error('Invalid VK launch signature');
  if(params.get('vk_app_id')!==String(appId)||!positiveId(params.get('vk_user_id')))throw new Error('Invalid VK launch application or user');
  const timestamp=Number(params.get('vk_ts')),seconds=Math.floor(now/1000);
  if(!Number.isSafeInteger(timestamp)||timestamp>seconds+300||timestamp<seconds-maxAgeSeconds)throw new Error('Expired VK launch');
  return {userId:params.get('vk_user_id'),language:params.get('vk_language')};
}
